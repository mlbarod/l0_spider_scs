# L0 Spider SCS 환경 정의

## 1. 실행 모드

| 명령·설정 | 동작 |
|---|---|
| `npm run dev` | Vite 개발 서버, React HMR, 22개 API handler 등록 |
| `npm start` / `npm run preview` | `server.mjs`; 기본 `LIVE_RELOAD=1`로 Vite middleware 사용 |
| `LIVE_RELOAD=0 npm start` | 필요 시 client build 후 `dist/` 정적 제공 |
| `npm run build` | Vite production build |

Vite와 통합 서버의 API 범위는 동일하다. 환경 차이는 API 개수보다 gate, 외부 파일·DB 가용성과 정적 자산 제공 방식에서 발생한다.

## 2. 서버 환경변수

| 변수 | 기본값·역할 |
|---|---|
| `HOST` | `0.0.0.0` |
| `PORT` | `5173` |
| `LIVE_RELOAD` | `0`이 아니면 활성 |
| `BUILD_ON_START` | `0`이 아니면 static 모드 시작 전 build |
| `VITE_SITE_URL` | Vite host 설정 판단 |
| `SCS_DATA_CONNECTIONS_ENABLED` | `1`이면 전체 데이터 API gate 허용 |
| `SCS_DASHBOARD_DATA_ENABLED` | Dashboard read gate; 미설정 시 활성 |
| `SCS_SELF_EQUIPMENT_DATA_ENABLED` | 자설비 read gate; 미설정 시 활성 |
| `SCS_COMMONALITY_DATA_ENABLED` | 동일성 read gate; 미설정 시 활성 |
| `SCS_COMMON_ANOMALY_DATA_ENABLED` | 공통부 일부 read gate; 미설정 시 활성 |
| `SCS_DEFECT_DATA_ENABLED` | Defect 이상감지 리스트 read gate; 미설정 시 활성 |
| `SCS_DB_CONNECTIONS_ENABLED` | DB gate; `0`이면 비활성 |
| `DB_INFO_PATH` | 기본 `/appdata/l0_spider_scs/db_info.pkl` |

`STEP_HMAC_KEY`는 현재 구현의 필수 환경변수가 아니다.

## 3. 데이터 경로 override

| 변수 | 대상 |
|---|---|
| `SPIDER_DASHBOARD_PATH_ROOT` | Dashboard 상세 root |
| `SPIDER_DASHBOARD_STATS_ROOT` | Dashboard stats root |
| `SCS_SELF_EQUIPMENT_PATH_ROOT` | 자설비 index root |
| `MAPPING_CONFIG_PATH` | mapping JSON |
| `COMMONALITY_ROOT_PATH` | 동일성 image root |
| `COMMONALITY_PATH_TABLE_ROOT` | 동일성 index root |
| `COMMON_COMMONALITY_ROOT_PATH` | 공통부 동일성 잔여 root |
| `SENSOR_EXCLUSION_CONFIG_PATH` | Sensor 제외 JSON |

값이 없으면 코드의 `/appdata` 기본 경로를 사용한다. 운영 환경의 실제 값과 credential은 문서나 Git에 기록하지 않는다.

## 4. Sensor 제외 설정 상태

저장소에는 `config/sensor-exclusions.example.json`만 있다. 기본 실제 파일 `config/sensor-exclusions.json`은 배포 환경에서 선택적으로 준비하는 파일이며, 누락 시 빈 제외 규칙으로 fallback한다. 파일 존재를 모든 환경의 시작 전제조건으로 보지 않는다.

## 5. DB readiness

DB API는 gate가 활성이고 `DB_INFO_PATH`가 읽을 수 있는 파일일 때 허용된다. MY EQP 등록 DB는 현재 사용자 기능 readiness에 포함하지 않는다. 비밀번호나 실제 DB 연결 정보는 출력하지 않는다.

## 6. 환경별 확인

- 개발 환경에서도 실제 `/appdata`와 DB가 없으면 API handler 등록과 데이터 조회 성공은 별개다.
- 운영 topology, proxy, systemd unit의 실제 값은 저장소만으로 확정하지 않는다.
- 배포 전에는 대상 환경에서 경로 가독성, gate와 health를 읽기 전용으로 확인한다.

## 7. Defect SPIDER 이상감지 리스트

`config/defect-spider.env`의 `DEFECT_SPIDER_LINE_DEVICES`에 Line별 device를 JSON으로 지정한다. 예: `DEFECT_SPIDER_LINE_DEVICES='{"P1L":"DEVICE_A","P2L":"DEVICE_B"}'`. Line 키는 화면에서 선택하는 원래 Line 값이며 각 Line에 device 하나를 지정한다. 같은 이름의 서버 환경변수가 있으면 환경변수가 우선한다. 개발·통합·정적 서버가 모두 이 파일을 사용한다. 설정 변경 후 서버를 재시작한다.

읽기 경로는 `/appdata/abnormal_trend/pic/defect/<선택한 Line>/<해당 Line의 device>/fail_list.parquet`이다. Line 선택이 바뀌면 해당 Line에 지정된 device의 파일을 읽는다. 선택한 Line에 device가 없으면 설정 오류를 표시하며 다른 Line의 파일로 대체하지 않는다. 기존 `DEFECT_SPIDER_LINE`, `DEFECT_SPIDER_DEVICE` 대신 이 매핑을 사용한다.

`GET /api/defect-filters`는 `line`, `pathSdwt`로 기존 매핑의 선택 범위를 검증한 뒤 선택한 Line의 파일을 읽고 파일의 `sdwt`로 행을 제한한다. 파일의 `line` 컬럼은 읽거나 참조하지 않는다. `sdwt`는 선택한 SDWT의 원래 코드 또는 매핑된 표시값과 비교한다. Line별 파일에서 SDWT로 제한된 행에 대해 `PRC_Group → main_seq → met_seq` 순으로 상위 선택 조건을 누적 적용해 각 컬럼의 중복 없는 값을 반환한다. 하위 후보는 상위 선택 후 제공한다. `main_seq`와 `met_seq`에는 ALL 선택이 있으며, API에서는 `mainAll=1`, `metAll=1`로 전달해 해당 단계의 값 제한을 해제한다. 실제 값이 `ALL`인 데이터와도 구분한다.

파일의 필수 컬럼은 `sdwt`, `prc_group`, `main_seq`, `met_seq`, `eqpid`, `path`다. `eqpid`와 `path`를 함께 읽고, 모든 필터 선택 후 해당 행의 중복 없는 `path` 목록을 `files`로 반환한다. 각 항목은 원문 `path`, `fail_path`, `all_path`, 경로 형식 오류를 포함한다. 파일명의 `fail_` 접두사만 `all_`로 바꾸며 디렉터리는 유지한다. 파일 변경 시간·크기가 바뀌면 다음 조회에서 다시 로드한다. 설정 누락·파일 읽기 실패·필수 컬럼 누락은 오류로 표시한다.

Defect 필터 API의 `source_path`는 서버가 실제로 읽기를 시도한 이상감지 리스트 경로다. 성공·파일 읽기 실패 모두 필터 영역 아래에 원문을 표시한다. 설정 또는 매핑 검증 단계에서 실패해 경로가 정해지지 않았다면 빈 문자열을 반환하며 화면에는 경로 확인 실패를 안내한다.

`GET /api/defect-file`은 같은 필터와 `filePath`를 받아 해당 선택 범위의 리스트에 있는 FAIL 파일 또는 대응 ALL 파일만 읽는다. 실제 Parquet 데이터를 읽은 뒤 행 수와 컬럼 이름을 반환한다. `fail_` 파일(이상감지 RAW데이터)에만 `eqp_ch_groups`로 eqp_ch별 행 수를 추가한다. `all_` 파일(이상감지 스탭 ALL RAW데이터)은 eqp_ch로 분리하지 않는다. 파일 변경 시간·크기가 같으면 최근 파일의 로드 요약을 재사용한다. 파일별 오류는 차트 카드 안의 해당 파일 영역에 표시하며, 다른 파일의 조회는 유지한다.

Scatter 영역은 각 path의 이상감지 RAW데이터에 있는 고유 eqp_ch별로 차트 카드를 만든다. 각 카드에 해당 eqp_ch, 이상감지 RAW데이터 경로, 이상감지 스탭 ALL RAW데이터 경로를 표시한다. 같은 path의 카드들은 대응 ALL 원본 전체를 공통으로 사용하며 ALL 파일은 eqp_ch별로 재조회하거나 분리하지 않는다. eqp_ch 컬럼이 없으면 오류를 안내하고, 비어 있는 값은 차트 구분에서 제외한 행 수를 표시한다. 차트 카드 배치는 2열 × N행이다. 파일 경로와 로드 상태를 표시하며 동일성 차트와 그룹 보기 옵션은 제거했다. 현재 단계는 데이터 로드 확인용이며 Scatter 축과 점은 아직 연결하지 않는다.
