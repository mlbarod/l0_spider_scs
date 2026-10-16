import base64
import hashlib
import json
import os
import pickle
import sys
from datetime import datetime


DB_INFO_PATH = os.environ.get("DB_INFO_PATH") or "/appdata/l0_spider_scs/db_info.pkl"


class HistoryError(Exception):
    pass


def write_json(payload):
    print(json.dumps(payload, ensure_ascii=False, default=str))


def read_payload():
    text = sys.stdin.read()
    return json.loads(text) if text.strip() else {}


def load_db_info():
    with open(DB_INFO_PATH, "rb") as file:
        db_info = pickle.load(file)
    return {
        "DB_HOST": db_info["DB_HOST"],
        "DB_PORT": int(db_info["DB_PORT"]),
        "DB_NAME": db_info["DB_NAME"],
        "DB_USER": db_info["DB_USER"],
        "DB_PASSWORD": db_info["DB_PASSWORD"],
    }


def connect(db_info):
    import pymysql

    return pymysql.connect(
        host=db_info["DB_HOST"],
        user=db_info["DB_USER"],
        password=db_info["DB_PASSWORD"],
        db=db_info["DB_NAME"],
        charset="utf8",
        port=db_info["DB_PORT"],
        connect_timeout=10,
        read_timeout=15,
        write_timeout=15,
    )


def normalize_exec_date(value):
    text = str(value or "").strip()
    if not text:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone().replace(tzinfo=None)
    return parsed.strftime("%Y-%m-%d %H:%M:%S")


def build_db_record(payload):
    return {
        "update_date": payload["updateDate"],
        "line_id": payload["lineId"],
        "sdwt": payload["sdwt"],
        "file_path": payload["filePath"],
        "knox_id": payload["knoxId"],
        "exec_date": normalize_exec_date(payload.get("execDate")),
    }


def insert_history(connection, db_record, snapshot=None):
    columns = ("update_date", "line_id", "sdwt", "file_path", "knox_id", "exec_date")
    values = tuple(db_record[column] for column in columns)
    try:
        with connection.cursor() as cursor:
            if snapshot:
                # Never claim atomic storage when an existing table uses MyISAM.
                cursor.execute("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('hit_history', 'hit_history_image')")
                engines = cursor.fetchall()
                if len(engines) != 2 or any(str(row[0]).upper() != "INNODB" for row in engines):
                    raise RuntimeError("History snapshot tables must use InnoDB")
                image = base64.b64decode(snapshot["imageBase64"], validate=True)
                if not 45 <= len(image) <= 5 * 1024 * 1024 or not image.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("Invalid PNG")
                image_hash = hashlib.sha256(image).hexdigest()
                fingerprint = hashlib.sha256(json.dumps(
                    {**db_record, "image_sha256": image_hash}, sort_keys=True,
                    ensure_ascii=False, separators=(",", ":"),
                ).encode("utf-8")).hexdigest()
                cursor.execute("""INSERT INTO `hit_history_image`
                    (`image_id`, `image_png`, `byte_size`, `image_sha256`, `fingerprint`)
                    VALUES (%s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE `image_id` = `image_id`""",
                    (snapshot["imageId"], image, len(image), image_hash, fingerprint))
                created = cursor.rowcount == 1
                cursor.execute("SELECT `fingerprint` FROM `hit_history_image` WHERE `image_id` = %s FOR UPDATE", (snapshot["imageId"],))
                if cursor.fetchone()[0] != fingerprint:
                    raise HistoryError("HISTORY_REQUEST_CONFLICT")
                if not created:
                    connection.commit()
                    return {"ok": True, "affectedRows": 0, "imageId": snapshot["imageId"], "created": False}
                columns += ("image_id",)
                values += (snapshot["imageId"],)
            cursor.execute(
                "INSERT INTO `hit_history` (" + ", ".join(f"`{column}`" for column in columns)
                + ") VALUES (" + ", ".join("%s" for _ in columns) + ")", values,
            )
        connection.commit()
        return {"ok": True, "affectedRows": 1, **({"imageId": snapshot["imageId"], "created": True} if snapshot else {})}
    except Exception:
        connection.rollback()
        raise


def read_image(connection, image_id):
    with connection.cursor() as cursor:
        cursor.execute("""SELECT i.`image_png` FROM `hit_history_image` i
            INNER JOIN `hit_history` h ON h.`image_id` = i.`image_id`
            WHERE i.`image_id` = %s""", (image_id,))
        row = cursor.fetchone()
        if not row:
            raise HistoryError("HISTORY_IMAGE_NOT_FOUND")
        return {"ok": True, "imageBase64": base64.b64encode(row[0]).decode("ascii")}


def list_history(connection, payload):
    conditions = []
    values = []
    for field, column in (("lineId", "line_id"), ("sdwt", "sdwt"), ("knoxId", "knox_id")):
        if payload.get(field):
            conditions.append(f"`{column}` = %s")
            values.append(payload[field])
    if payload.get("dateFrom"):
        conditions.append("`exec_date` >= %s")
        values.append(payload["dateFrom"])
    if payload.get("dateTo"):
        conditions.append("`exec_date` < DATE_ADD(%s, INTERVAL 1 DAY)")
        values.append(payload["dateTo"])
    where = " WHERE " + " AND ".join(conditions) if conditions else ""
    page, page_size = payload["page"], payload["pageSize"]
    columns = ("update_date", "line_id", "sdwt", "knox_id", "exec_date", "image_id")
    with connection.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) FROM `hit_history`" + where, tuple(values))
        total = cursor.fetchone()[0]
        cursor.execute(
            "SELECT " + ", ".join(f"`{column}`" for column in columns)
            + " FROM `hit_history`" + where
            + " ORDER BY `exec_date` DESC, `update_date` DESC, `line_id`, `sdwt`, `knox_id`, `file_path`"
            + " LIMIT %s OFFSET %s",
            tuple(values) + (page_size, (page - 1) * page_size),
        )
        records = [dict(zip(columns, row)) for row in cursor.fetchall()]
    return {"ok": True, "records": records, "total": total, "page": page, "pageSize": page_size}


def main():
    try:
        payload = read_payload()
        db_info = load_db_info()
        with connect(db_info) as connection:
            if payload.get("action") == "list":
                result = list_history(connection, payload)
            elif payload.get("action") == "image":
                result = read_image(connection, payload["imageId"])
            else:
                result = insert_history(connection, build_db_record(payload), payload if payload.get("imageId") else None)
        write_json(result)
    except HistoryError as error:
        write_json({"ok": False, "code": str(error), "error": "The history image request failed."})
    except Exception as error:
        print(f"hit history operation failed: {error}", file=sys.stderr)
        write_json({"ok": False, "error": "The HIT history DB operation failed."})


if __name__ == "__main__":
    main()
