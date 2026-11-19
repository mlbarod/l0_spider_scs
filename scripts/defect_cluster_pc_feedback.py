"""몰림PC 판정 피드백("몰림PC 맞음" = Y, "몰림PC 아님" = N) 저장.

wafer 1매(결과 시각 + line + device + main_seq + met_seq + lot_wf)당 1행만 두고, 다시 누르면 마지막 판정으로 덮어쓴다.
테이블 생성문: scripts/defect_cluster_pc_feedback.sql
"""
import json
import sys
from datetime import datetime
from clicked_category_history import load_db_info, write_json

SQL = (
    "INSERT INTO `defect_cluster_pc_feedback` "
    "(`snapshot`, `line`, `device`, `main_seq`, `met_seq`, `lot_wf`, `verdict`, `clusters`, `knox_id`, `updated_at`) "
    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
    "ON DUPLICATE KEY UPDATE `verdict` = VALUES(`verdict`), `clusters` = VALUES(`clusters`), "
    "`knox_id` = VALUES(`knox_id`), `updated_at` = VALUES(`updated_at`)"
)


def save_feedback(payload, connect):
    if payload["verdict"] not in ("Y", "N"):
        raise ValueError("verdict must be Y or N")
    info = load_db_info()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    params = (payload["snapshot"], payload["line"], payload["device"], payload["mainSeq"], payload["metSeq"],
              payload["lotWf"], payload["verdict"], payload["clusters"] or None, payload["knoxId"], now)
    with connect(host=info["DB_HOST"], user=info["DB_USER"],
                 password=info["DB_PASSWORD"], db=info["DB_NAME"],
                 port=info["DB_PORT"], charset="utf8mb4") as connection:
        with connection.cursor() as cursor:
            cursor.execute(SQL, params)  # 새 행 1, 덮어쓰기 2, 같은 값이면 0(모두 정상)
        connection.commit()
    return {"ok": True}


if __name__ == "__main__":
    try:
        import pymysql
        write_json(save_feedback(json.loads(sys.stdin.read()), pymysql.connect))
    except Exception:
        write_json({"ok": False, "error": "Unable to save the clustered PC verdict."})
