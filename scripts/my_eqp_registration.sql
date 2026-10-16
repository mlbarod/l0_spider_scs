-- 관리자가 대상 SCS DB에서 검토 후 직접 적용하는 준비 SQL입니다.
-- 앱은 CREATE/ALTER를 실행하지 않습니다. 기존 테이블은 변경하지 않습니다.
CREATE TABLE IF NOT EXISTS `myeqp_regist` (
    `line` VARCHAR(128) NOT NULL,
    `sdwt` VARCHAR(160) NOT NULL,
    `prc_group` VARCHAR(255) NOT NULL,
    `eqp` VARCHAR(255) NOT NULL,
    `exec_date` DATETIME NOT NULL,
    `periode` INT NOT NULL,
    `comment` VARCHAR(90) NOT NULL DEFAULT '',
    `knox_id` VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `is_public` TINYINT(1) NOT NULL DEFAULT 0,
    KEY `idx_myeqp_user_line` (`knox_id`, `line`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 기존 테이블에 is_public이 없는 경우에만 관리자가 별도 검토 후 적용:
-- ALTER TABLE `myeqp_regist` ADD COLUMN `is_public` TINYINT(1) NOT NULL DEFAULT 0;
-- 기준정보는 자설비와 동일한 erdtsum_info.parque 파일에서 조회합니다.
-- main, disp_name, sdwt_prod, prc_group 컬럼이 필요합니다.
