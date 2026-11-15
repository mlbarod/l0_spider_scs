"""Saved History Board 설치: 새 테이블 3개 생성 + 기존 hit_history 데이터 복사.

사용법
  1. 아래 DB_CONFIG에 접속 정보를 직접 입력합니다.
  2. python3 -B scripts/setup_history_board.py           # 미리보기 (DB를 변경하지 않음)
  3. python3 -B scripts/setup_history_board.py --apply   # 테이블 생성 + 데이터 복사

- 테이블 정의는 scripts/history_board.sql을 그대로 사용합니다.
- 기존 hit_history / hit_history_image 테이블은 읽기만 하고 변경하지 않습니다(백업으로 보존).
- 여러 번 실행해도 안전합니다. 이미 만든 테이블은 건너뛰고, 이미 복사한 이력(게시판에서 삭제한 이력 포함)은 다시 복사하지 않습니다.

주의: 비밀번호를 입력한 상태로 이 파일을 Git에 commit/push 하지 마세요.
      실행이 끝나면 비밀번호를 지우거나, 파일을 저장소 밖으로 복사해서 실행하세요.
"""
import argparse
import re
import sys
from pathlib import Path

# ===== DB 접속 정보: 직접 입력 =====
DB_CONFIG = {
    "host": "",        # 예: "10.0.0.1"
    "port": 3306,
    "database": "",    # DB 이름
    "user": "",
    "password": "",
}
# ===================================

SQL_PATH = Path(__file__).resolve().with_name("history_board.sql")
NEW_TABLES = ("hit_history_post", "hit_history_post_image", "hit_history_post_status_log")
SOURCE_TABLES = ("hit_history", "hit_history_image")
# hit_history 행 식별값. scripts/hit_history.py의 RECORD_ID_SQL과 같아야 기존 이력 ID가 유지됩니다.
RECORD_COLUMNS = ("update_date", "line_id", "sdwt", "file_path", "knox_id", "exec_date", "image_id")
RECORD_ID_SQL = "SHA2(CONCAT_WS(':', " + ", ".join(
    f"CASE WHEN h.`{column}` IS NULL THEN '~' ELSE HEX(h.`{column}`) END" for column in RECORD_COLUMNS
) + "), 256)"


class SetupError(Exception):
    pass


def connect():
    missing = [key for key in ("host", "database", "user", "password") if not str(DB_CONFIG.get(key, "")).strip()]
    if missing:
        raise SetupError("파일 상단 DB_CONFIG에 접속 정보를 입력해 주세요: " + ", ".join(missing))
    import pymysql
    return pymysql.connect(
        host=DB_CONFIG["host"], port=int(DB_CONFIG["port"]), db=DB_CONFIG["database"],
        user=DB_CONFIG["user"], password=DB_CONFIG["password"], charset="utf8mb4",
        autocommit=False, connect_timeout=10, read_timeout=300, write_timeout=300,
    )


def read_create_statements():
    # history_board.sql에는 CREATE TABLE 문과 줄 단위 주석(--)만 있습니다.
    sql = "\n".join(line for line in SQL_PATH.read_text(encoding="utf-8").splitlines()
                    if not line.lstrip().startswith("--"))
    statements = [part.strip() for part in sql.split(";") if part.strip()]
    names = [re.match(r"CREATE TABLE `([a-z_]+)`", statement) for statement in statements]
    if tuple(match.group(1) if match else None for match in names) != NEW_TABLES:
        raise SetupError("history_board.sql의 테이블 구성과 순서를 확인해 주세요.")
    return statements


def table_engines(cursor, names):
    placeholders = ", ".join(["%s"] * len(names))
    cursor.execute("SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES "
                   f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ({placeholders})", names)
    return {row[0]: str(row[1]).upper() for row in cursor.fetchall()}


def check_source_tables(cursor):
    engines = table_engines(cursor, SOURCE_TABLES)
    missing = [name for name in SOURCE_TABLES if name not in engines]
    if missing:
        raise SetupError("기존 이력 테이블이 없습니다: " + ", ".join(missing))
    cursor.execute("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() "
                   "AND TABLE_NAME = 'hit_history' AND COLUMN_NAME = 'image_id'")
    if cursor.fetchone()[0] != 1:
        raise SetupError("hit_history에 image_id 컬럼이 없습니다. 기존 이미지 보관 설정을 확인해 주세요.")


def new_table_state(cursor):
    """'none' | 'all' (3개 모두 InnoDB로 존재). 일부만 있거나 InnoDB가 아니면 중단합니다."""
    engines = table_engines(cursor, NEW_TABLES)
    if not engines:
        return "none"
    if len(engines) != len(NEW_TABLES):
        raise SetupError("새 테이블 중 일부만 존재합니다: " + ", ".join(sorted(engines)) + ". 구조를 확인해 주세요. 변경하지 않았습니다.")
    if any(engine != "INNODB" for engine in engines.values()):
        raise SetupError("새 테이블은 모두 InnoDB여야 합니다. 변경하지 않았습니다.")
    return "all"


def copy_counts(cursor, tables_exist):
    cursor.execute("SELECT COUNT(*), COUNT(DISTINCT " + RECORD_ID_SQL + "), SUM(h.`image_id` IS NOT NULL) FROM `hit_history` h")
    total, distinct, with_image = cursor.fetchone()
    copied = 0
    if tables_exist:
        cursor.execute("SELECT COUNT(*) FROM (SELECT DISTINCT " + RECORD_ID_SQL + " AS `post_id` FROM `hit_history` h) s "
                       "INNER JOIN `hit_history_post` p ON p.`post_id` = s.`post_id`")
        copied = cursor.fetchone()[0]
    return total, distinct, int(with_image or 0), copied


def copy_rows(cursor):
    # 같은 값의 중복 이력은 같은 ID를 가지므로 INSERT IGNORE로 1건만 남습니다.
    cursor.execute("INSERT IGNORE INTO `hit_history_post` "
                   "(`post_id`, `fingerprint`, `entry_type`, `knox_id`, `title`, `details`, `comment`, `app`, "
                   "`line_id`, `sdwt`, `update_date`, `file_path`, `work_status`, `version`, `legacy`, `created_at`, `updated_at`) "
                   "SELECT " + RECORD_ID_SQL + ", " + RECORD_ID_SQL + ", 'HISTORY', h.`knox_id`, '', '', '', '', "
                   "h.`line_id`, h.`sdwt`, h.`update_date`, h.`file_path`, 'IN_PROGRESS', 1, 1, h.`exec_date`, h.`exec_date` "
                   "FROM `hit_history` h")
    posts = cursor.rowcount
    # 게시판에 남아 있는(삭제되지 않은) 기존 이력의 이미지만 복사합니다.
    cursor.execute("INSERT IGNORE INTO `hit_history_post_image` (`post_id`, `image_png`, `byte_size`, `image_sha256`) "
                   "SELECT p.`post_id`, i.`image_png`, i.`byte_size`, i.`image_sha256` "
                   "FROM (SELECT " + RECORD_ID_SQL + " AS `post_id`, h.`image_id` FROM `hit_history` h WHERE h.`image_id` IS NOT NULL) s "
                   "INNER JOIN `hit_history_post` p ON p.`post_id` = s.`post_id` AND p.`legacy` = 1 AND p.`work_status` <> 'DELETED' "
                   "INNER JOIN `hit_history_image` i ON i.`image_id` = s.`image_id`")
    return posts, cursor.rowcount


def run(connection, apply):
    statements = read_create_statements()
    with connection.cursor() as cursor:
        check_source_tables(cursor)
        state = new_table_state(cursor)
        total, distinct, with_image, copied = copy_counts(cursor, state == "all")
        print(f"[테이블] {'이미 존재 → 생성 건너뜀' if state == 'all' else '없음 → 3개 생성 예정'}: {', '.join(NEW_TABLES)}")
        print(f"[기존 이력] {total}건 (중복 제외 {distinct}건, 이미지 있음 {with_image}건), 이미 복사됨 {copied}건")
        if not apply:
            print("미리보기입니다. DB를 변경하지 않았습니다. 실제 실행: --apply")
            return
        if state == "none":
            # MySQL DDL은 문장마다 자동 commit 되어 전체 롤백되지 않습니다.
            for name, statement in zip(NEW_TABLES, statements):
                cursor.execute(statement)
                print(f"생성 완료: {name}")
        try:
            posts, images = copy_rows(cursor)
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        print(f"복사 완료: 게시글 {posts}건, 이미지 {images}건 (이미 복사된 이력은 건너뜀)")


def main(argv=None):
    parser = argparse.ArgumentParser(description="이력저장 게시판 테이블 생성 + 기존 hit_history 데이터 복사")
    parser.add_argument("--apply", action="store_true", help="실제로 테이블을 만들고 데이터를 복사합니다.")
    args = parser.parse_args(argv)
    try:
        with connect() as connection:
            run(connection, args.apply)
        return 0
    except SetupError as error:
        print(str(error), file=sys.stderr)
    except Exception as error:
        # 접속 정보나 DB 드라이버 원문 메시지는 출력하지 않습니다.
        print(f"실패했습니다 ({type(error).__name__}). 데이터 복사는 롤백되었고, 이미 생성된 테이블은 유지됩니다. "
              "접속 정보·권한·DB 버전을 확인해 주세요.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
