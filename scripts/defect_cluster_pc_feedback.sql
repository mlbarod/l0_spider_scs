-- 기존 DB_INFO_PATH가 가리키는 MySQL/MariaDB DB에서 수동 실행합니다.
-- 몰림PC 이상감지 판정 피드백("몰림PC 맞음" / "몰림PC 아님"). 오탐 분석과 알고리즘 튜닝용입니다.
-- wafer 1매(결과 시각 + line + device + main_seq + met_seq + lot_wf)당 1행이며, 다시 누르면 마지막 판정으로 덮어씁니다.
-- 저장: scripts/defect_cluster_pc_feedback.py (INSERT ... ON DUPLICATE KEY UPDATE)
-- 앱 DB 계정에 INSERT, UPDATE 권한이 필요합니다.
-- 컬럼 길이를 바꾸면 server/defectClusterPc.mjs의 FEEDBACK_FIELDS도 함께 바꿉니다.
-- 고유 키 길이 때문에 MySQL 5.7 이상 / MariaDB 10.2 이상(InnoDB, 행 형식 DYNAMIC)을 가정합니다.
CREATE TABLE IF NOT EXISTS defect_cluster_pc_feedback (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    snapshot VARCHAR(16) COLLATE utf8mb4_bin NOT NULL COMMENT '결과 폴더 시각 (예: 2026-11-19 07:00)',
    line VARCHAR(32) COLLATE utf8mb4_bin NOT NULL,
    device VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
    main_seq VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
    met_seq VARCHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT '_RANDOM_PC를 뺀 값',
    lot_wf VARCHAR(64) COLLATE utf8mb4_bin NOT NULL,
    verdict CHAR(1) COLLATE utf8mb4_bin NOT NULL COMMENT 'Y = 몰림PC 맞음, N = 몰림PC 아님',
    clusters TEXT COLLATE utf8mb4_bin NULL COMMENT '판정 사유: fail_list clusters 원문(JSON)',
    knox_id VARCHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT '마지막으로 판정한 사용자',
    updated_at DATETIME NOT NULL COMMENT '마지막 판정 시각',
    PRIMARY KEY (id),
    UNIQUE KEY uq_defect_cluster_pc_feedback_wafer (snapshot, line, device, main_seq, met_seq, lot_wf)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
