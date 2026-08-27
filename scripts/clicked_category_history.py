import json
import os
import pickle
import sys
from datetime import datetime


DB_INFO_PATH = os.environ.get("DB_INFO_PATH") or "/appdata/l0_spider_scs/db_info.pkl"


def write_json(payload):
    print(json.dumps(payload, ensure_ascii=False, default=str))


def log_db_write(table, operation, columns, rows):
    payload = {
        "table": table,
        "operation": operation,
        "rows": [dict(zip(columns, row)) for row in rows],
    }
    print(
        f"[history-db-write] {json.dumps(payload, ensure_ascii=False, default=str)}",
        file=sys.stderr,
    )


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


def normalize_update_date(value):
    text = str(value or "").strip()
    if not text:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone().replace(tzinfo=None)
    return parsed.strftime("%Y-%m-%d %H:%M:%S")


def build_db_record(payload):
    return {
        "line_id": payload["lineId"],
        "sdwt": payload["sdwt"],
        "grade": payload["grade"],
        "sensor": payload["sensor"],
        "update_date": normalize_update_date(payload.get("updateDate")),
        "knox_id": payload["knoxId"],
    }


def main():
    db_record = None
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        db_record = build_db_record(payload)
        db_info = load_db_info()
        import pymysql

        with pymysql.connect(
            host=db_info["DB_HOST"],
            user=db_info["DB_USER"],
            password=db_info["DB_PASSWORD"],
            db=db_info["DB_NAME"],
            charset="utf8",
            port=db_info["DB_PORT"],
            connect_timeout=10,
            read_timeout=15,
            write_timeout=15,
        ) as connection:
            with connection.cursor() as cursor:
                columns = ("line_id", "sdwt", "grade", "sensor", "update_date", "knox_id")
                values = tuple(db_record[column] for column in columns)
                log_db_write("clicked_category_history", "INSERT", columns, [values])
                affected_rows = cursor.execute(
                    """
                    INSERT INTO `clicked_category_history`
                        (`line_id`, `sdwt`, `grade`, `sensor`, `update_date`, `knox_id`)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    values,
                )
            connection.commit()
        write_json({"ok": True, "affectedRows": affected_rows, "debugRecord": db_record})
    except Exception as error:
        print(f"clicked category history operation failed: {error}", file=sys.stderr)
        result = {"ok": False, "error": "클릭이력 DB 작업에 실패했습니다."}
        if db_record is not None:
            result["debugRecord"] = db_record
        write_json(result)


if __name__ == "__main__":
    main()
