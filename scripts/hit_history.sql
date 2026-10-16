-- MySQL / MariaDB: 기존 DB에서 관리자가 검토 후 직접 실행합니다.
-- 기존 hit_history가 있으면 구조와 데이터를 변경하지 않습니다.
-- 기존 테이블에 id를 추가할 필요가 없습니다.
-- 이미지 보관 기능 배포 전에는 hit_history_image.sql도 1회 실행합니다.
CREATE TABLE IF NOT EXISTS `hit_history` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `update_date` VARCHAR(32) NOT NULL,
    `line_id` VARCHAR(128) NOT NULL,
    `sdwt` VARCHAR(128) NOT NULL,
    `file_path` TEXT NOT NULL,
    `knox_id` VARCHAR(128) NOT NULL,
    `exec_date` DATETIME NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_hit_history_exec_date` (`exec_date`),
    KEY `idx_hit_history_line_exec_date` (`line_id`, `exec_date`),
    KEY `idx_hit_history_knox_exec_date` (`knox_id`, `exec_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- file_path는 기존 저장 계약에 따라 /를 #으로 바꾸어 기록합니다.
-- update_date는 기존 데이터의 날짜 또는 날짜+시각 문자열을 그대로 보존합니다.
