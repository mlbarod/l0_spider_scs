import json
import os
import pickle
import sys
from datetime import datetime


DB_INFO_PATH = os.environ.get("DB_INFO_PATH") or "/appdata/l0_spider_scs/db_info.pkl"


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


def insert_history(connection, db_record):
    columns = ("update_date", "line_id", "sdwt", "file_path", "knox_id", "exec_date")
    values = tuple(db_record[column] for column in columns)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO `hit_history`
                (`update_date`, `line_id`, `sdwt`, `file_path`, `knox_id`, `exec_date`)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            values,
        )
    connection.commit()
    return {"ok": True, "affectedRows": 1}


def main():
    try:
        payload = read_payload()
        db_record = build_db_record(payload)
        db_info = load_db_info()
        with connect(db_info) as connection:
            result = insert_history(connection, db_record)
        write_json(result)
    except Exception as error:
        print(f"hit history operation failed: {error}", file=sys.stderr)
        write_json({"ok": False, "error": "The HIT history DB operation failed."})


if __name__ == "__main__":
    main()
