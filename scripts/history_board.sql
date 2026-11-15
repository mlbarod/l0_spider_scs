-- 메일보내기·이력저장 게시판 (MySQL / MariaDB, InnoDB, utf8mb4)
-- 배포 전에 관리자가 대상 DB에서 검토 후 1회 실행합니다. 앱은 DDL을 실행하지 않습니다.
-- 기존 hit_history / hit_history_image 테이블과 데이터는 변경하지 않습니다(백업으로 보존).
-- 테이블 생성 + 기존 데이터 복사를 한 번에: scripts/setup_history_board.py (DB_CONFIG 입력 후 --apply)
-- PNG는 최대 5MiB. max_allowed_packet은 전송 여유를 포함해 16MiB 이상 권장.

CREATE TABLE `hit_history_post` (
    `post_id` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `fingerprint` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    -- HISTORY: 차트별 이력저장 버튼으로 등록 (l0_spider 메일보내기 흐름에서 실제 발송만 제외)
    `entry_type` VARCHAR(20) NOT NULL,
    `knox_id` VARCHAR(128) NOT NULL,
    `title` VARCHAR(300) NOT NULL DEFAULT '',
    `details` TEXT NOT NULL,
    `comment` TEXT NOT NULL,
    `app` VARCHAR(40) NOT NULL DEFAULT '',
    `line_id` VARCHAR(128) NOT NULL,
    `sdwt` VARCHAR(128) NOT NULL,
    `update_date` VARCHAR(32) NOT NULL,
    -- 기존 hit_history 계약과 같이 /를 #으로 바꾸어 기록합니다. 브라우저에 공개하지 않습니다.
    `file_path` TEXT NOT NULL,
    -- IN_PROGRESS | COMPLETED | DELETED(삭제 후 재등록·재이전 방지용 표시)
    `work_status` VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    `version` INT UNSIGNED NOT NULL DEFAULT 1,
    -- 1: 기존 hit_history에서 복사한 이력
    `legacy` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL,
    `updated_at` DATETIME NOT NULL,
    PRIMARY KEY (`post_id`),
    KEY `idx_hit_history_post_created` (`created_at`, `post_id`),
    KEY `idx_hit_history_post_work` (`work_status`, `created_at`),
    KEY `idx_hit_history_post_scope` (`line_id`, `sdwt`, `created_at`),
    KEY `idx_hit_history_post_knox` (`knox_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hit_history_post_image` (
    `post_id` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `image_png` MEDIUMBLOB NOT NULL,
    `byte_size` INT UNSIGNED NOT NULL,
    `image_sha256` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (`post_id`),
    CONSTRAINT `fk_hit_history_post_image` FOREIGN KEY (`post_id`) REFERENCES `hit_history_post` (`post_id`)
) ENGINE=InnoDB;

CREATE TABLE `hit_history_post_status_log` (
    `log_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `post_id` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `previous_status` VARCHAR(20) NOT NULL,
    `next_status` VARCHAR(20) NOT NULL,
    `changed_by` VARCHAR(128) NOT NULL,
    `comment` VARCHAR(1000) NOT NULL,
    `changed_at` DATETIME NOT NULL,
    PRIMARY KEY (`log_id`),
    KEY `idx_hit_history_post_status_log_post` (`post_id`, `log_id`),
    CONSTRAINT `fk_hit_history_post_status_log` FOREIGN KEY (`post_id`) REFERENCES `hit_history_post` (`post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
