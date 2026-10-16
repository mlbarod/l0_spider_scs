# L0 Spider 자설비 이상감지 기능 기준

## 1. 범위와 상태

자설비 이상감지는 `/self-equipment`와 `/fdc_trend/self-equipment`에서 제공되는 운영 기능이다. 일반 자설비의 필터, scatter·동일성 chart, 변경점, SKIP·HIT·click 이력을 다룬다.

MY EQP 등록·조회, `/api/my-eqp-*`, `myeqp_regist`, `step=ALL` 기반 MY EQP 흐름은 현재 계약이 아니다. 메인 화면의 `MY EQP 등록`은 개발예정 카드다.

## 2. 사용자 흐름

1. Line과 분임조를 선택한다.
2. Grade를 선택하면 PRC_Group, EQP, Sensor, STEP이 `ALL`, 심각도가 `CRITICAL`로 설정되고 차트가 자동 조회된다. 필요하면 이후 조건을 직접 좁힌다. Line·분임조 변경 시 Grade는 해제되며, Grade 해제 시 하위 선택도 해제된다. SKIP LIST는 기존 수동 선택을 유지한다.
3. 결과 목록에서 설비 chart를 연다.
4. scatter, 동일성 비교와 변경점 정보를 확인한다.
5. 권한과 데이터가 허용하는 범위에서 SKIP·HIT·click 이력을 사용한다.

화면의 query 값은 기존 직접 링크 호환을 위해 초기 필터에 사용될 수 있다. HMAC 검증이 구현되었다고 가정하지 않는다.

## 3. API

| 경로 | 역할 |
|---|---|
| `/api/mapping-config` | Line·분임조 표시와 경로 매핑 |
| `/api/self-equipment-data` | 필터 선택지와 자설비 결과 행 |
| `/api/erd-scatter-data` | scatter·동일성 chart 데이터 |
| `/api/erd-file` | 허용된 ERD 파일 제공 |
| `/api/current-user` | IP에 연결된 knox_id 조회(GET)·최초 등록(POST) |
| `/api/pass-history` | SKIP 이력 조회·변경 |
| `/api/hit-history` | HIT 이력 기록(POST)·게시판 조회(GET)·마스터의 게시물 삭제(DELETE) |
| `/api/clicked-category-history` | category click 이력 기록 |

`npm run dev`와 `node server.mjs`는 같은 API handler를 등록한다. DB 이력 API는 DB gate와 `DB_INFO_PATH` readiness 영향을 받는다.

접속 사용자 등록 및 이력의 `knox_id` 저장 방식은 [사용자 식별](current-user.md)을 따른다. 미등록 IP는 먼저 ID를 등록해야 이력을 저장할 수 있다.

## 4. 필터와 데이터 처리

- `/api/self-equipment-data`의 기본 조건은 `line`, `pathSdwt`, `sdwt`이며 `priority`, `prcGroup`, `eqpCh`, `sensor`, `chStep`을 선택적으로 전달한다. `prcGroup=ALL`은 현재 Line·분임조·Grade 범위의 전체 그룹을 조회한다. 기존 API의 `desc` 조건도 호환을 위해 유지한다.
- 화면의 PRC_Group은 분임조별 경로 테이블의 `sdwt`, `eqp`와 EQP 기준정보의 `sdwt_prod`, `main`을 결합해 얻은 `prc_group`을 사용한다. `eqp`는 첫 `-` 앞 값을 `main`과 비교한다. SDWT 기준정보가 없는 구형 축약 데이터에서는 `main`이 하나의 `prc_group`으로만 해석될 때에만 기존 EQP 단독 결합을 적용한다.
- 일반 자설비와 SKIP LIST 모두 같은 `prc_group` 기준으로 이후 `eqp_ch`, `sensor`, `ch_step` 후보를 제한한다.
- chart 요청은 `path`, `eqp`, `sensor`, `chStep`과 선택적인 `ver`, `latestDate`, `line`, `pathSdwt`를 전달한다.
- 이미지 경로, directory 경로와 직접 `data.parquet` 경로의 기존 변환 규칙을 보존한다.
- Sensor 제외 설정이 없으면 빈 제외 규칙으로 동작한다.
- 일반 자설비 결과의 `CRITICAL` 버튼은 `status=ALARM`, `WARNING` 버튼은 `status=WARN` 차트만 표시한다. Grade 자동 조회 시 `CRITICAL`을 선택하며 선택된 버튼을 다시 누르면 전체로 돌아간다. 상태 필터는 ch_step 모아보기와 페이지 분할 전에 적용하고, 변경 시 첫 페이지로 돌아간다. SKIP LIST에는 적용하지 않는다.
- chart 상단에는 `reason` 코드에 따른 `이상감지 사유: {문구}`를 표시한다. 문구는 `l0_spider`와 동일하며 알 수 없거나 빈 사유는 표시하지 않는다. `status`, `reason`이 없는 이전 경로 파일도 조회할 수 있으며 상태 미지정 행은 전체 보기에서만 표시한다.

## 5. 오류와 보안

- 조건에 맞는 행이 없는 정상 빈 상태와 파일·DB 오류를 구분한다.
- chart 파일 로딩 실패 화면에는 내부 파일 경로를 노출하지 않는다.
- `/appdata` 파일은 읽기 전용 원천으로 취급하며 자동 생성·수정하지 않는다.
- 사용자가 전달한 path는 허용 root 안에서만 처리한다.
- query string과 로그에 credential 또는 개인정보를 추가하지 않는다.

## 6. 데이터 원천

- 분임조별 index: `/appdata/abnormal_trend/pic/path_xian/{line}/{sdwt}/df_path.parquet`
- EQP 기준정보: `/appdata/abnormal_trend/pic/erdtsum_info.parque`
- chart: index의 `file_path`가 가리키는 directory의 `data.parquet`
- 변경점: 선택한 `data.parquet`와 같은 directory의 `{eqp}.parquet`
- 매핑: `/appdata/l0_spider_scs/mapping_config.json`
- Sensor 제외: `SENSOR_EXCLUSION_CONFIG_PATH` 또는 기본 `config/sensor-exclusions.json`; 파일 누락 시 빈 규칙
- 이력 DB: `pass_history`, `hit_history`, `clicked_category_history`

### 13.1 Data References

아래 표는 다른 서버에 별도 서비스할 자설비 이상감지 App의 신규 데이터 연결 기준이다.
실제 파일 연결과 운영 데이터 검증은 아직 수행하지 않았다.

| 구분 | 참조 파일 | 참조 경로 | 참조 컬럼/키 |
| --- | --- | --- | --- |
| `latest_date` 결정 및 대시보드 세부 파일 | `{latest_date}` | `/appdata/abnormal_trend/pic/path_xian/{latest_date}` | `{latest_date}` |
| 최신 자설비 index | `{latest_date}` | `/appdata/abnormal_trend/pic/path_xian/{latest_date}` | `ver` 포함; 현재 일반 자설비 필터에서는 사용하지 않음 |
| 분임조별 ERD 이상감지 경로 테이블 | `df_path.parquet` | `/appdata/abnormal_trend/pic/path_xian/{line}/{sdwt}/df_path.parquet` | 원본 `sdwt`, `desc`, `ver`, `recipe_id`, `priority`, `sensor`, `step`, `eqp`, `file_path`, `line_rev`, `status`, `reason`; EQP 기준정보 결합 후 `prc_group` 추가 |
| eqp 기준정보 | `erdtsum_info.parque` | `/appdata/abnormal_trend/pic/erdtsum_info.parque` (`.parque`가 없으면 같은 위치의 `.parquet` 호환) | `line_no`, `fdc_model`, `main`, `disp_name`, `sdwt_prod`, `prc_group`; 기본 결합 키는 `sdwt_prod` + `main` |
| 자설비 이상감지 단일설비 데이터 | `data.parquet` | `file_path`가 `{eqp}.png`이면 같은 디렉터리의 `data.parquet`; 디렉터리이면 하위 `data.parquet`; 이미 `data.parquet`이면 그대로 사용 | 선택적 `ver`가 있으면 정확히 일치하는 row 우선·단일값 file-scope fallback, 없으면 선택 경로에 한정된 파일로 처리; `act_time` (x축), 실제 schema의 `{sensor}_{ch_step}` 우선·`{sensor}*{ch_step}` 호환 (y축), `eqp_cb` 또는 `eqp` (차트별 EQP 필터), 선택적 hover 컬럼 |
| 자설비 이상감지 동일성 데이터 | `data.parquet` | 위와 같은 `file_path` 변환으로 선택한 `data.parquet` | 위와 같은 선택적 `ver` 규칙, `act_time` (x축), 실제 schema의 `{sensor}_{ch_step}` 우선·`{sensor}*{ch_step}` 호환 (y축), `eqp_cb` (series), 선택적 hover 컬럼 |
| EQP 변경점 이력 | `{eqp}.parquet` | 선택한 `data.parquet`와 같은 디렉터리의 `{eqp}.parquet` | `date` (세로 점선 위치), `work_type` (점선 라벨), `ctttm_url`, `desc` |

새 데이터 파일이나 참조 컬럼/키가 추가되면 이 표와
`src/config/spiderDataPaths.mjs`를 함께 업데이트한다.

## 7. 관련 문서와 검증

- [사용자 메뉴얼](../user-manual/USER_MANUAL.md)
- [직접 진입 query](step-deeplink.md)
- `server/selfEquipmentData.test.mjs`
- `tests/integration/step-deeplink.test.mjs`

## 8. 이력저장 게시판

- 홈의 `이력저장 게시판` App(`/history`, `/fdc_trend/history`)에서 기존 `hit_history` 이력을 최신 저장순으로 조회한다. 차트의 이력 저장 버튼은 기존 POST와 사용자 식별 방식을 그대로 사용한다. 메일 발송 기능은 제공하지 않는다.
- Line·SDWT·등록자는 정확히 일치하는 값으로 조회한다. 차트 경로는 화면 및 조회 API 응답에서 제공하지 않으며 경로 검색도 지원하지 않는다. 저장일 기간은 시작일과 종료일을 모두 포함한다. 페이지당 20건을 표시한다.
- GET `/api/hit-history`는 `lineId`, `sdwt`, `knoxId`, `dateFrom`, `dateTo`, `page`, `pageSize`를 받고 `{ ok, records, total, page, pageSize }`를 반환한다. `records`는 `update_date`, `line_id`, `sdwt`, `knox_id`, `exec_date`, nullable `image_id`, 삭제용 `record_id`를 반환하며 이미지 바이너리는 목록에 포함하지 않는다. 날짜 오류·역전된 기간·페이지 범위 오류는 400이다. `pageSize`는 1~100, 기본 20이다.
- 기존 PASS 조회와 동일하게 DB gate 아래에서 공유 이력을 조회한다. 저장자의 `knox_id`는 계속 서버에서 확인한다.
- 상세에는 저장 당시 PNG와 저장일시·등록자·Line·SDWT·차트 기준일을 표시한다. DB 내부의 기존 경로 저장 계약(`/` → `#`)은 유지한다. 이미지가 없는 과거 이력은 메타데이터만 표시하고 이미지를 임의로 복원하지 않는다.
- 배포 전에 관리자가 `scripts/hit_history_image.sql`을 1회 실행한다. 기존 `hit_history` 데이터·컬럼을 유지하면서 nullable `image_id`와 고유 인덱스·외래키를 추가하고, PNG 바이너리는 새 `hit_history_image.image_png` (`MEDIUMBLOB`)에 보관한다. 기본 테이블도 없는 신규 DB만 먼저 `scripts/hit_history.sql`을 실행한다. 앱은 DDL을 실행하지 않는다. 미적용 상태에서는 새 게시판 조회·이미지 저장이 실패하므로 SQL 적용 후 배포한다.
- 두 테이블은 InnoDB여야 한다. 이미지 저장 시 서버가 엔진을 확인하며, 이미지와 이력을 한 트랜잭션으로 커밋한다. 한쪽이라도 저장에 실패하면 롤백한다. 기존 테이블이 다른 엔진이면 관리자가 별도 검토해야 하며 앱에서 자동 변환하지 않는다.
- 원본 L0 SPIDER와 동일하게 자설비 차트는 화면 확대 상태를 바꾸지 않고 전체 범위로 별도 렌더링하여 600×240 PNG를 만든다. 기존 PNG 차트는 동일 출처 이미지 API에서 읽어 저장한다. 이미지 생성·읽기 실패 시 새 이력을 등록하지 않는다.
- POST `/api/hit-history`의 기존 필드에 `image` (PNG Base64 data URL), `requestId` (UUID)를 추가한다. 이미지당 최대 5MiB이며 PNG 형식·크기를 검사한다. 기존 클라이언트의 이미지 없는 POST는 계속 허용한다. 브라우저 저장 버튼은 항상 이미지를 포함한다.
- `requestId`와 서버에서 확인한 등록자로 이미지 ID를 정한다. 응답 유실 후 재시도는 동일 이미지·시각·요청 ID를 재사용하여 중복 등록을 막는다. 같은 요청 ID에 다른 내용이 오면 409를 반환한다. 정상 저장 후 다시 누르면 별도의 이력으로 등록된다.
- GET `/api/hit-history?imageId={image_id}`는 연결된 PNG를 `image/png`로 반환한다. 미존재 이미지는 404이며 클라이언트가 임의의 파일 경로를 읽도록 허용하지 않는다. 이미지도 기존 게시판과 동일한 DB gate 및 공유 조회 범위를 따른다.
- 운영 확인: 5MiB PNG 전송을 수용하도록 DB `max_allowed_packet`은 이스케이프 여유를 포함해 16MiB 이상을 검토하고, 프록시는 Base64 JSON 요청 약 7MiB 이상을 수용해야 한다. 이 작업에서는 운영 DB·프록시 설정을 변경하거나 DDL을 실행하지 않는다.

- 마스터 권한자는 게시물의 `이력 삭제` 버튼과 확인 창으로 삭제한다. DELETE `/api/hit-history`는 JSON `{ "recordId": "목록의 record_id" }`를 받고 성공 시 `{ "ok": true, "affectedRows": 1 }`을 반환한다. 서버는 현재 IP에 등록된 ID와 `SPIDER_MASTER_KNOX_IDS`를 매 요청 대조하며 일반 사용자는 403, 미등록 사용자는 428, 없는 게시물은 404다. 다른 사이트의 요청은 거부한다.
- 삭제는 이력 1행과 연결된 PNG를 한 트랜잭션으로 제거한다. 이미지 없는 과거 이력도 지원하며 모든 필드가 동일한 과거 행이 여러 개면 한 번에 1행만 삭제한다. 기존 `id` 컬럼이나 추가 DDL은 필요하지 않다. `record_id`는 비공개 경로를 포함한 전체 저장 필드의 해시로 식별하며 원문 경로는 반환하지 않는다. 두 테이블은 InnoDB여야 하고 DB 계정에 두 테이블의 DELETE 권한이 필요하다.
