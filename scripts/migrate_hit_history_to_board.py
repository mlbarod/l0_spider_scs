"""Copy existing hit_history rows (and images) into the Saved History Board tables.

Default is a read-only preview. --apply copies rows in one transaction.
The source tables hit_history / hit_history_image are never modified.
Safe to run again: rows already copied (including entries deleted on the board) are skipped.
"""
import argparse
import re
import sys

try:
    from .hit_history import RECORD_ID_SQL, connect, load_db_info
except ImportError:
    from hit_history import RECORD_ID_SQL, connect, load_db_info


REQUIRED_TABLES = ("hit_history", "hit_history_image", "hit_history_post", "hit_history_post_image")


def record_id_sql(alias):
    return re.sub(r"`(\w+)`", lambda match: f"{alias}.`{match.group(1)}`", RECORD_ID_SQL)


def check_tables(cursor):
    placeholders = ", ".join(["%s"] * len(REQUIRED_TABLES))
    cursor.execute("SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() "
                   f"AND TABLE_NAME IN ({placeholders})", REQUIRED_TABLES)
    engines = {row[0]: str(row[1]).upper() for row in cursor.fetchall()}
    missing = [name for name in REQUIRED_TABLES if name not in engines]
    if missing:
        raise SystemExit("필요한 테이블이 없습니다: " + ", ".join(missing) + " (scripts/history_board.sql, hit_history_image.sql 확인)")
    if any(engine != "INNODB" for engine in engines.values()):
        raise SystemExit("모든 대상 테이블은 InnoDB여야 합니다. 변경하지 않았습니다.")


def counts(cursor):
    record_id = record_id_sql("h")
    cursor.execute("SELECT COUNT(*), COUNT(DISTINCT " + record_id + ") FROM `hit_history` h")
    total, distinct = cursor.fetchone()
    cursor.execute("SELECT COUNT(*) FROM (SELECT DISTINCT " + record_id + " AS `post_id` FROM `hit_history` h) s "
                   "INNER JOIN `hit_history_post` p ON p.`post_id` = s.`post_id`")
    copied = cursor.fetchone()[0]
    return total, distinct, copied


def copy_rows(cursor):
    record_id = record_id_sql("h")
    # Identical legacy rows share one record id; INSERT IGNORE keeps one of them.
    cursor.execute("INSERT IGNORE INTO `hit_history_post` "
                   "(`post_id`, `fingerprint`, `entry_type`, `knox_id`, `title`, `details`, `comment`, `app`, "
                   "`line_id`, `sdwt`, `update_date`, `file_path`, `work_status`, `version`, `legacy`, `created_at`, `updated_at`) "
                   "SELECT " + record_id + ", " + record_id + ", 'HISTORY', h.`knox_id`, '', '', '', '', "
                   "h.`line_id`, h.`sdwt`, h.`update_date`, h.`file_path`, 'IN_PROGRESS', 1, 1, h.`exec_date`, h.`exec_date` "
                   "FROM `hit_history` h")
    posts = cursor.rowcount
    # Copy images only for legacy entries that still exist on the board.
    cursor.execute("INSERT IGNORE INTO `hit_history_post_image` (`post_id`, `image_png`, `byte_size`, `image_sha256`) "
                   "SELECT p.`post_id`, i.`image_png`, i.`byte_size`, i.`image_sha256` "
                   "FROM (SELECT " + record_id + " AS `post_id`, h.`image_id` FROM `hit_history` h WHERE h.`image_id` IS NOT NULL) s "
                   "INNER JOIN `hit_history_post` p ON p.`post_id` = s.`post_id` AND p.`legacy` = 1 AND p.`work_status` <> 'DELETED' "
                   "INNER JOIN `hit_history_image` i ON i.`image_id` = s.`image_id`")
    return posts, cursor.rowcount


def main(argv=None):
    parser = argparse.ArgumentParser(description="hit_history → hit_history_post 데이터 복사 (기존 테이블은 변경하지 않음)")
    parser.add_argument("--apply", action="store_true", help="실제로 복사합니다. 생략하면 건수만 확인합니다.")
    args = parser.parse_args(argv)
    try:
        with connect(load_db_info()) as connection:
            with connection.cursor() as cursor:
                check_tables(cursor)
                total, distinct, copied = counts(cursor)
                print(f"기존 이력 {total}건 (중복 제외 {distinct}건), 이미 복사됨 {copied}건")
                if not args.apply:
                    print("미리보기입니다. 실제 복사: --apply")
                    return 0
                try:
                    posts, images = copy_rows(cursor)
                    connection.commit()
                except Exception:
                    connection.rollback()
                    raise
                print(f"복사 완료: 게시글 {posts}건, 이미지 {images}건")
        return 0
    except SystemExit as error:
        print(str(error), file=sys.stderr)
    except Exception as error:
        # Do not print connection details or raw driver errors.
        print(f"데이터 복사에 실패했습니다 ({type(error).__name__}). 변경 내용은 롤백되었습니다.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
