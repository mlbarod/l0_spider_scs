"""Saved History Board (mail entries and saved history). No DDL and no mail transport."""
import base64
import hashlib
import json
import re
import sys
from datetime import datetime

try:
    from .hit_history import connect, load_db_info
except ImportError:
    from hit_history import connect, load_db_info


STATUSES = ("IN_PROGRESS", "COMPLETED")
PAGE_SIZE = 20
POST_COLUMNS = ("post_id", "entry_type", "knox_id", "title", "app", "line_id", "sdwt",
                "update_date", "work_status", "version", "legacy", "created_at", "updated_at")


class BoardError(Exception):
    pass


def now():
    # Same local-time convention as the existing hit_history.exec_date.
    return datetime.now().replace(microsecond=0)


def fetch_dict(cursor):
    row = cursor.fetchone()
    return None if row is None else dict(zip([column[0] for column in cursor.description], row))


def fetch_dicts(cursor):
    names = [column[0] for column in cursor.description]
    return [dict(zip(names, row)) for row in cursor.fetchall()]


def public_post(row):
    return {
        "id": row["post_id"], "type": row["entry_type"], "author": row["knox_id"],
        "title": row["title"], "app": row["app"], "line": row["line_id"], "sdwt": row["sdwt"],
        "updateDate": row["update_date"], "workStatus": row["work_status"],
        "version": row["version"], "legacy": bool(row["legacy"]),
        "createdAt": row["created_at"], "updatedAt": row["updated_at"],
    }


def require_post(cursor, post_id, lock=False):
    cursor.execute("SELECT * FROM `hit_history_post` WHERE `post_id` = %s" + (" FOR UPDATE" if lock else ""), (post_id,))
    post = fetch_dict(cursor)
    if not post or post["work_status"] == "DELETED":
        raise BoardError("BOARD_NOT_FOUND")
    return post


def create(cursor, payload):
    image = base64.b64decode(payload["imageBase64"], validate=True)
    if not 45 <= len(image) <= 5 * 1024 * 1024 or not image.startswith(b"\x89PNG\r\n\x1a\n"):
        raise BoardError("BOARD_INVALID")
    if payload["entryType"] != "HISTORY":
        raise BoardError("BOARD_INVALID")
    timestamp = now()
    # The primary key and row lock serialize retries of the same request across processes.
    cursor.execute("""INSERT INTO `hit_history_post`
        (`post_id`, `fingerprint`, `entry_type`, `knox_id`, `title`, `details`, `comment`, `app`,
         `line_id`, `sdwt`, `update_date`, `file_path`, `work_status`, `version`, `legacy`, `created_at`, `updated_at`)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'IN_PROGRESS',1,0,%s,%s)
        ON DUPLICATE KEY UPDATE `post_id` = `post_id`""", (
        payload["id"], payload["fingerprint"], payload["entryType"], payload["actor"],
        payload["title"], payload["details"], payload["comment"], payload["app"],
        payload["lineId"], payload["sdwt"], payload["updateDate"], payload["filePath"],
        timestamp, timestamp,
    ))
    created = cursor.rowcount == 1
    cursor.execute("SELECT `fingerprint` FROM `hit_history_post` WHERE `post_id` = %s FOR UPDATE", (payload["id"],))
    if cursor.fetchone()[0] != payload["fingerprint"]:
        raise BoardError("BOARD_REQUEST_CONFLICT")
    if created:
        cursor.execute("INSERT INTO `hit_history_post_image` (`post_id`, `image_png`, `byte_size`, `image_sha256`) VALUES (%s,%s,%s,%s)",
                       (payload["id"], image, len(image), hashlib.sha256(image).hexdigest()))
    return {"id": payload["id"], "created": created}


def list_posts(cursor, payload):
    page, status, search = payload["page"], payload["status"], payload["search"]
    line, sdwt = payload["line"], payload["sdwt"]
    if type(page) is not int or not 1 <= page <= 100000 or status not in ("",) + STATUSES:
        raise BoardError("BOARD_INVALID")
    if any(not isinstance(value, str) or len(value) > 200 for value in (search, line, sdwt)):
        raise BoardError("BOARD_INVALID")
    where = "`work_status` <> 'DELETED'"
    params = []
    for column, value in (("line_id", line), ("sdwt", sdwt), ("work_status", status)):
        if value:
            where += f" AND `{column}` = %s"
            params.append(value)
    if search:
        where += " AND (LOCATE(%s, `title`) > 0 OR LOCATE(%s, `knox_id`) > 0 OR LOCATE(%s, `details`) > 0)"
        params.extend([search] * 3)
    cursor.execute("SELECT COUNT(*) FROM `hit_history_post` WHERE " + where, tuple(params))
    total = cursor.fetchone()[0]
    cursor.execute("SELECT " + ", ".join(f"`{column}`" for column in POST_COLUMNS)
                   + " FROM `hit_history_post` WHERE " + where
                   + " ORDER BY `created_at` DESC, `post_id` DESC LIMIT %s OFFSET %s",
                   tuple(params) + (PAGE_SIZE, (page - 1) * PAGE_SIZE))
    posts = [public_post(row) for row in fetch_dicts(cursor)]
    # Filter options cover the entire board, not only this page.
    cursor.execute("SELECT DISTINCT `line_id` FROM `hit_history_post` WHERE `work_status` <> 'DELETED' AND `line_id` <> '' ORDER BY `line_id`")
    lines = [row[0] for row in cursor.fetchall()]
    cursor.execute("SELECT DISTINCT `sdwt` FROM `hit_history_post` WHERE `work_status` <> 'DELETED' AND `sdwt` <> ''"
                   + (" AND `line_id` = %s" if line else "") + " ORDER BY `sdwt`", (line,) if line else ())
    sdwts = [row[0] for row in cursor.fetchall()]
    return {"posts": posts, "total": total, "page": page, "pageSize": PAGE_SIZE, "filters": {"lines": lines, "sdwts": sdwts}}


def detail(cursor, post_id):
    post = require_post(cursor, post_id)
    cursor.execute("SELECT COUNT(*) FROM `hit_history_post_image` WHERE `post_id` = %s", (post_id,))
    has_image = cursor.fetchone()[0] > 0
    cursor.execute("""SELECT `previous_status`, `next_status`, `changed_by`, `comment`, `changed_at`
        FROM `hit_history_post_status_log` WHERE `post_id` = %s ORDER BY `log_id` DESC LIMIT 100""", (post_id,))
    history = [{"from": row["previous_status"], "to": row["next_status"], "changedBy": row["changed_by"],
                "comment": row["comment"], "changedAt": row["changed_at"]} for row in fetch_dicts(cursor)]
    return {"post": {**public_post(post), "details": post["details"], "comment": post["comment"],
                     "hasImage": has_image, "history": history}}


def read_image(cursor, post_id):
    require_post(cursor, post_id)
    cursor.execute("SELECT `image_png` FROM `hit_history_post_image` WHERE `post_id` = %s", (post_id,))
    row = cursor.fetchone()
    if not row:
        raise BoardError("BOARD_NOT_FOUND")
    return {"imageBase64": base64.b64encode(row[0]).decode("ascii")}


def change_status(cursor, payload):
    status, version, comment = payload["status"], payload["version"], payload["comment"]
    if status not in STATUSES or type(version) is not int or version < 1 or not isinstance(comment, str) or len(comment) > 1000:
        raise BoardError("BOARD_INVALID")
    post = require_post(cursor, payload["id"], lock=True)
    if post["version"] != version:
        raise BoardError("BOARD_CONFLICT")
    if post["work_status"] != status:
        timestamp = now()
        cursor.execute("""INSERT INTO `hit_history_post_status_log`
            (`post_id`, `previous_status`, `next_status`, `changed_by`, `comment`, `changed_at`) VALUES (%s,%s,%s,%s,%s,%s)""",
            (payload["id"], post["work_status"], status, payload["actor"], comment, timestamp))
        cursor.execute("UPDATE `hit_history_post` SET `work_status` = %s, `version` = `version` + 1, `updated_at` = %s WHERE `post_id` = %s",
                       (status, timestamp, payload["id"]))
    return {}


def delete(cursor, post_id):
    require_post(cursor, post_id, lock=True)
    for table in ("hit_history_post_status_log", "hit_history_post_image"):
        cursor.execute(f"DELETE FROM `{table}` WHERE `post_id` = %s", (post_id,))
    # Keep the row as DELETED so a retried request or a re-run of the legacy
    # migration cannot bring the entry back.
    cursor.execute("""UPDATE `hit_history_post` SET `work_status` = 'DELETED', `title` = '', `details` = '',
        `comment` = '', `version` = `version` + 1, `updated_at` = %s WHERE `post_id` = %s""", (now(), post_id))
    return {}


def execute_action(connection, payload):
    action = payload.get("action")
    actor = payload.get("actor")
    # Reads are open to unregistered users; only writes need a registered actor.
    if action in ("create", "status", "delete") and (
            not isinstance(actor, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,128}", actor)):
        raise BoardError("BOARD_INVALID")
    if action != "list" and not re.fullmatch(r"[a-f0-9]{64}", str(payload.get("id", ""))):
        raise BoardError("BOARD_INVALID")
    with connection.cursor() as cursor:
        if action == "create":
            result = create(cursor, payload)
        elif action == "list":
            result = list_posts(cursor, payload)
        elif action == "detail":
            result = detail(cursor, payload["id"])
        elif action == "image":
            result = read_image(cursor, payload["id"])
        elif action == "status":
            result = change_status(cursor, payload)
        elif action == "delete":
            result = delete(cursor, payload["id"])
        else:
            raise BoardError("BOARD_INVALID")
    connection.commit()
    return {"ok": True, **result}


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        with connect(load_db_info()) as connection:
            try:
                result = execute_action(connection, payload)
            except Exception:
                connection.rollback()
                raise
        print(json.dumps(result, ensure_ascii=False, default=str))
    except BoardError as error:
        print(json.dumps({"ok": False, "code": str(error)}))
    except Exception as error:
        # Never print DB credentials, images, SQL or driver details to stdout.
        print(f"history board operation failed: {type(error).__name__}", file=sys.stderr)
        print(json.dumps({"ok": False, "code": "BOARD_STORAGE_ERROR"}))


if __name__ == "__main__":
    main()
