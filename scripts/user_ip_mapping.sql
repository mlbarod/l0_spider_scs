-- Run manually in the database named DB_NAME in DB_INFO_PATH, before deploying.
-- The application never creates or migrates this table.
CREATE TABLE `user_ip_mapping` (
    `ip_address` VARCHAR(45) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `knox_id` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`ip_address`),
    KEY `idx_user_ip_mapping_knox_id` (`knox_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
