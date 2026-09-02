# L0 Spider 자설비 이상감지 기능 기준

## 1. 범위와 상태

자설비 이상감지는 `/self-equipment`와 `/fdc_trend/self-equipment`에서 제공되는 운영 기능이다. 일반 자설비의 필터, scatter·동일성 chart, 변경점, SKIP·HIT·click 이력을 다룬다.

MY EQP 등록·조회, `/api/my-eqp-*`, `myeqp_regist`, `step=ALL` 기반 MY EQP 흐름은 현재 계약이 아니다. 메인 화면의 `MY EQP 등록`은 개발예정 카드다.

## 2. 사용자 흐름

1. Line과 분임조를 선택한다.
2. Grade, PRC_Group, EQP, Sensor, STEP 조건을 좁힌다.
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
| `/api/current-user` | 현재 사용자 식별 정보 |
| `/api/pass-history` | SKIP 이력 조회·변경 |
| `/api/hit-history` | HIT 이력 기록 |
| `/api/clicked-category-history` | category click 이력 기록 |

`npm run dev`와 `node server.mjs`는 같은 API handler를 등록한다. DB 이력 API는 DB gate와 `DB_INFO_PATH` readiness 영향을 받는다.

## 4. 필터와 데이터 처리

- `/api/self-equipment-data`의 기본 조건은 `line`, `pathSdwt`, `sdwt`이며 `priority`, `prcGroup`, `eqpCh`, `sensor`, `chStep`을 선택적으로 전달한다. 기존 API의 `desc` 조건도 호환을 위해 유지한다.
- 화면의 PRC_Group은 분임조별 경로 테이블의 `eqp`에서 첫 `-` 앞 값을 추출하고 EQP 기준정보의 `main`과 결합해 얻은 `prc_group`을 사용한다. 기준정보의 나머지 비필수 컬럼 누락은 전체 조회 실패로 처리하지 않는다.
- 필터 하단의 `분임조별 ERD 이상감지 경로 데이터 head(5)`에서 원본 `eqp`, 추출한 join key, 결합된 `prc_group`과 전체 결합·미결합 건수를 확인할 수 있다.
- chart 요청은 `path`, `eqp`, `sensor`, `chStep`과 선택적인 `ver`, `latestDate`, `line`, `pathSdwt`를 전달한다.
- 이미지 경로, directory 경로와 직접 `data.parquet` 경로의 기존 변환 규칙을 보존한다.
- Sensor 제외 설정이 없으면 빈 제외 규칙으로 동작한다.

## 5. 오류와 보안

- 조건에 맞는 행이 없는 정상 빈 상태와 파일·DB 오류를 구분한다.
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
| 분임조별 ERD 이상감지 경로 테이블 | `df_path.parquet` | `/appdata/abnormal_trend/pic/path_xian/{line}/{sdwt}/df_path.parquet` | 원본 `sdwt`, `desc`, `ver`, `recipe_id`, `priority`, `sensor`, `step`, `eqp`, `file_path`, `line_rev`; EQP 기준정보 결합 후 `prc_group` 추가 |
| eqp 기준정보 | `erdtsum_info.parque` | `/appdata/abnormal_trend/pic/erdtsum_info.parque` (`.parque`가 없으면 같은 위치의 `.parquet` 호환) | `line_no`, `fdc_model`, `main`, `disp_name`, `sdwt_prod`, `prc_group`; 결합 키는 `main` |
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
