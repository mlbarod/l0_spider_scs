# MY EQP 등록과 자설비 조회

## 사용자 동작

`l0_spider/l0_spider`의 MY EQP 기능을 기준으로 등록 화면과 조회 흐름을 이식했다. 홈의 `MY EQP 등록`은 `/registration`으로 연결되며 `/recipients`, `/fdc_trend/registration`도 같은 화면이다. 기존 개발예정 주소 `/under-construction/my-eqp-registration`은 등록 화면으로 이동한다.

- Line → SDWT → PRC Group → EQP 순서로 선택한다. EQP는 여러 개 또는 ALL을 선택할 수 있다. ALL은 저장 시 현재 기준정보의 실제 설비 목록으로 펼친다.
- 모니터링 기간은 1일 이상의 정수, Comment는 선택 입력(90자), 열람 및 메일수신인은 knox_id 여러 명(최대 100명)으로 지정한다. 최초 수신인은 현재 사용자다. 설비는 최대 500개다.
- 각 수신인·설비 조합마다 `myeqp_regist`에 한 행을 저장한다. 등록 기간은 저장 시각부터 조건의 유효 기간이며 차트의 과거 데이터 조회 기간을 바꾸지 않는다.
- 등록 목록은 현재 사용자에게 지정된 조건과 기존 공개 조건을 표시한다. 기간 만료도 목록에서 확인할 수 있다. 삭제는 본인에게 지정된 조건만 가능하며 다른 수신인의 행은 유지한다.
- 자설비 이상감지의 SDWT 목록에는 해당 Line에서 현재 사용자에게 유효한 등록이 있을 때 MY EQP가 나타난다. 30초마다 등록 상태를 갱신한다. MY EQP는 여러 SDWT의 등록 설비를 모아 조회하고 실제 결과에 있는 Grade를 표시한다.
- SCS의 PRC Group·EQP_CH·Sensor·ch_step 선택, SKIP 제외, Sensor 제외, 차트/동일성/변경점/이력저장 동작을 유지한다. 각 차트는 원래 Line·SDWT 경로를 보존한다.
- 신규 등록은 지정 사용자 전용이다. 기존 `is_public=1` 데이터는 원본과 동일하게 조회한다.

## 기준정보와 저장

기준정보 API는 자설비 이상감지와 동일한 `eqpReference.mjs`를 통해 `/appdata/abnormal_trend/pic/erdtsum_info.parque` 파일을 읽는다. `SCS_EQP_REFERENCE_PATH`가 설정되면 해당 경로를 사용하며, `.parque` 파일이 없으면 `.parquet` 확장자를 확인한다. API는 `main`, `disp_name`, `sdwt_prod`, `prc_group`을 반환하고 네 값이 모두 있는 행만 등록 후보로 사용한다. `chamber_mapping` 조회 및 `fdc_bin_prop` 필터는 사용하지 않는다. EQP 값은 `main_disp_name`으로 저장한다. SDWT는 화면 표시값으로 저장하고 조회할 때 mapping의 경로 코드로 연결한다. 설비 매칭은 원본과 동일하게 PNG 확장자·구분자·대소문자를 정규화한다. 저장 시 등록 후보 검증도 같은 파일을 사용한다.

SCS 차트 조회에는 기존 eqp reference 파일과 team ERD index를 사용한다. 원본 서비스의 SSO 대신 현재 SCS의 서버 IP→knox_id 매핑을 사용한다. 본인 인증·프록시 관련 한계는 [사용자 식별](current-user.md)을 따른다. 삭제 시 body의 knoxId/knoxIds는 신뢰하지 않는다.

## API

| 경로 | 메서드 | 역할 |
|---|---|---|
| `/api/my-eqp-reference` | GET, HEAD | 등록 후보 설비 기준정보 |
| `/api/my-eqp-registration` | GET | `line`, 선택 `activeOnly=true`; 현재 사용자의 등록 조건 |
| `/api/my-eqp-registration` | POST | `line`, 표시 `sdwt`, `prcGroup`, `eqps`, `periode`, `comment`, `knoxIds` 저장 |
| `/api/my-eqp-registration` | DELETE | 목록의 등록 조건을 보내 본인에 해당하는 행 삭제 |
| `/api/my-eqp-equipment-data` | GET | `line`, 반복 `priority`, `prcGroup`, `eqpCh`, `sensor`, `chStep`로 등록 설비 조회 |

기준정보 API의 GET·HEAD와 화면 후보 조회는 자설비 파일 연결 설정을 따른다. 등록 API와 등록 설비 조회 API는 기존 DB 연결 gate를 유지한다. 조회·등록·삭제의 사용자 식별은 서버에서 확인한다. 다른 사이트에서 보내는 쓰기 요청과 잘못된 Line/SDWT/등록 후보 EQP는 거부한다. 일반 설비 데이터 API의 동작은 유지한다.

## 배포 준비와 검증 범위

- 관리자가 [my_eqp_registration.sql](../../scripts/my_eqp_registration.sql)을 검토하고 대상 SCS DB에 적용한다. 기존 테이블은 컬럼 구조와 `is_public` 유무를 확인한다. 앱은 DDL이나 자동 migration을 수행하지 않는다.
- 기준정보 Parquet 파일에는 `main`, `disp_name`, `sdwt_prod`, `prc_group`이 필요하다. DB 계정에는 `myeqp_regist` SELECT·INSERT·DELETE 권한이 필요하다. DB 연결 경로는 기존 `/appdata/l0_spider_scs/db_info.pkl` 또는 `DB_INFO_PATH`다.
- 이 작업은 등록·조회·삭제 기능을 제공한다. 원본 등록 API처럼 실제 메일을 발송하지 않으며, 예약 발송이나 Mailing Report 생성 작업은 추가하지 않는다.
- 로컬 검증은 합성 DB·파일 대역만 사용한다. 실제 운영 테이블·권한·데이터 연결은 별도 확인 대상이다.
