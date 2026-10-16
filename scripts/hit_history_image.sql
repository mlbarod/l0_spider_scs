-- MySQL / MariaDB: 배포 전에 관리자가 대상 DB에서 검토 후 1회 실행합니다.
-- 기존 hit_history의 데이터와 컬럼은 유지합니다. 앱은 DDL을 실행하지 않습니다.
-- 두 테이블 모두 InnoDB여야 이력과 이미지가 한 트랜잭션으로 저장됩니다.
-- 먼저 확인: SHOW TABLE STATUS LIKE 'hit_history';
-- PNG는 최대 5MiB. max_allowed_packet은 전송 여유를 포함해 16MiB 이상 권장.

CREATE TABLE `hit_history_image` (
    `image_id` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `image_png` MEDIUMBLOB NOT NULL,
    `byte_size` INT UNSIGNED NOT NULL,
    `image_sha256` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `fingerprint` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (`image_id`)
) ENGINE=InnoDB;

ALTER TABLE `hit_history`
    ADD COLUMN `image_id` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD UNIQUE KEY `uq_hit_history_image` (`image_id`),
    ADD CONSTRAINT `fk_hit_history_image`
        FOREIGN KEY (`image_id`) REFERENCES `hit_history_image` (`image_id`);

-- 과거 이력의 image_id는 NULL입니다. 저장 당시 이미지가 없으므로 자동 복원하지 않습니다.
-- 신규 DB: hit_history.sql 실행 후 이 파일을 실행합니다.
