import ipaddress
import json
import os
import pickle
import re
import sys


DB_INFO_PATH = os.environ.get("DB_INFO_PATH") or "/appdata/l0_spider_scs/db_info.pkl"


def connect():
    import pymysql

    with open(DB_INFO_PATH, "rb") as file:
        db_info = pickle.load(file)
    return pymysql.connect(
        host=db_info["DB_HOST"], port=int(db_info["DB_PORT"]),
        user=db_info["DB_USER"], password=db_info["DB_PASSWORD"],
        db=db_info["DB_NAME"], charset="utf8",
        connect_timeout=10, read_timeout=15, write_timeout=15,
    )


def write_json(payload):
    print(json.dumps(payload, ensure_ascii=False))


def normalize_remote_ip(value):
    ip_addr = str(value or "").split(",", 1)[0].strip()
    return ip_addr


def lookup_user(connection, ip_addr):
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT `knox_id` FROM `user_ip_mapping` WHERE `ip_address` = %s",
            (ip_addr,),
        )
        row = cursor.fetchone()
    return {
        "ok": True, "ipAddress": ip_addr,
        "knoxId": row[0] if row else None, "registrationRequired": row is None,
    }


def register_user(connection, ip_addr, knox_id):
    # The IP primary key serializes concurrent registration. Never replace its owner.
    with connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO `user_ip_mapping` (`ip_address`, `knox_id`) VALUES (%s, %s) "
            "ON DUPLICATE KEY UPDATE `ip_address` = `ip_address`",
            (ip_addr, knox_id),
        )
        cursor.execute(
            "SELECT `knox_id` FROM `user_ip_mapping` WHERE `ip_address` = %s FOR UPDATE",
            (ip_addr,),
        )
        row = cursor.fetchone()
    if row is None or row[0] != knox_id:
        connection.rollback()
        return {"ok": False, "code": "IP_ALREADY_REGISTERED"}
    connection.commit()
    return {"ok": True, "ipAddress": ip_addr, "knoxId": row[0], "registrationRequired": False}


def main():
    ip_addr = normalize_remote_ip(os.environ.get("REMOTE_ADDR"))
    try:
        address = ipaddress.ip_address(ip_addr)
        normalized_ip = str(getattr(address, "ipv4_mapped", None) or address)
    except ValueError:
        write_json({
            "ok": False,
            "code": "IP_NOT_FOUND",
            "error": "Unable to identify the current user.",
        })
        return

    try:
        payload = json.loads(sys.stdin.read() or "{}")
        action = payload.get("action", "lookup")
        if action not in ("lookup", "register"):
            raise ValueError("Invalid action")
    except (ValueError, AttributeError):
        write_json({"ok": False, "code": "INVALID_USER_REQUEST"})
        return

    knox_id = payload.get("knoxId")
    if action == "register":
        knox_id = knox_id.strip() if isinstance(knox_id, str) else ""
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,128}", knox_id):
            write_json({"ok": False, "code": "INVALID_KNOX_ID"})
            return
    try:
        with connect() as connection:
            result = (register_user(connection, normalized_ip, knox_id)
                      if action == "register" else lookup_user(connection, normalized_ip))
        write_json(result)
    except Exception:
        # Do not expose credentials, connection details or SQL errors.
        write_json({"ok": False, "code": "CURRENT_USER_DB_FAILED"})


if __name__ == "__main__":
    main()
