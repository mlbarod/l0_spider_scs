# L0 Spider

Standalone React/Vite app for L0 Spider, based on the `fdc_trend` UI from `mlbarod/template2`.

## Run

```bash
npm install
npm run dev
```

The app opens directly at `/`.

현재 SCS 분리 checkout은 별도 환경변수 없이 Dashboard와 자설비 이상감지의 read API
(`dashboard-data`, `dashboard-latest-date`, `mapping-config`, `self-equipment-data`,
`erd-scatter-data`)를 활성화한다.
`DB_INFO_PATH`의 credential 파일이 읽기 가능하면 사용자·세 이력 DB API도
활성화하고 mapping 응답의 `capabilities.dbConnections=true`와
`capabilities.selfEquipmentDb=true`로 이를 알린다. 자설비 화면의 SKIP·HIT·클릭이력 action은
원본 `l0_spider`처럼 chart `file_path`가 있으면 요청을 실행하고 서버 DB gate가 최종 허용 여부를
결정한다. 다른 App과 image endpoint는 계속 안전한 `503 DATA_CONNECTIONS_DISABLED`를
반환한다. UI shell이 필요하면 `SCS_DASHBOARD_DATA_ENABLED=0`,
`SCS_SELF_EQUIPMENT_DATA_ENABLED=0`, `SCS_DB_CONNECTIONS_ENABLED=0`을 함께 명시한다.
`SCS_DATA_CONNECTIONS_ENABLED=1`은 전체 API를 한 번에 활성화하므로 다른 App의 새 경로와
DB 연결정보가 확정되기 전에는 설정하지 않는다. history 기능은 이 전역 변수를
설정하지 않아도 credential 기반 좁은 allowlist로 동작한다.

SCS에는 My EQP 메뉴, 등록 화면, 조회 API와 메일 Report가 없다. `/registration`과
호환 route `/recipients`는 Mailing 등록 화면만 제공하며 `/my-eqp` route는 제공하지 않는다.

기본 개발 실행은 다음과 같다.

```bash
npm run dev
```

## Server

```bash
PORT=5173 node server.mjs
```

기본 실행 모드는 소스 변경사항을 실시간으로 반영한다. 서버를 재실행할 필요 없이
브라우저를 새로고침하면 최신 개발 코드가 표시된다.

정적 `dist` 운영 모드로 실행하려면 다음과 같이 설정한다.

```bash
LIVE_RELOAD=0 PORT=5173 node server.mjs
```

정적 모드에서 `BUILD_ON_START=0`을 설정하면 기존 `dist`를 재빌드하지 않고 제공한다.

## SCS 사용자·이력 식별 구조

Node 서버는 요청에서 접속 IP를 추출하고 IP 형식을 검증한다. SCS에는 `knox_id` 조회가
없으므로 이력 DB의 `knox_id` 컬럼에는 접속 IP 문자열을 저장한다.

```text
PASS/HIT/클릭이력 요청
  → x-forwarded-for → x-real-ip → socket IP 순서로 접속 주소 선택
  → 첫 번째 forwarded 주소 선택 및 IPv4-mapped IPv6 정규화
  → IPv4/IPv6 형식 검증
  → 검증된 접속 IP를 사용자 식별값으로 확정
  → pass_history / hit_history / clicked_category_history의 knox_id 컬럼에 IP 저장
```

- 브라우저 request body의 `knoxId`는 신뢰하지 않으며 history handler가 서버에서 조회한 값으로 덮어쓴다.
- `/api/current-user` 응답의 기존 필드명 `knoxId`에는 접속 IP가 들어간다.
- 역방향 프록시 환경에서는 proxy가 `x-forwarded-for` 또는 `x-real-ip`를 신뢰할 수 있는 값으로
  덮어쓰고 애플리케이션 직접 접근을 통제해야 한다. 그렇지 않으면 유효한 다른 IP로 위장할 수 있다.
- NAT·공용 IP와 proxy header 정책은 이력 식별 결과에 영향을 줄 수 있다.
- Node 처리: `server/currentUser.mjs`; DB 저장 helper: `scripts/pass_history.py`,
  `scripts/hit_history.py`, `scripts/clicked_category_history.py`.
- `scripts/current_user.py`도 DB 조회 없이 `REMOTE_ADDR`의 IP 형식만 검증해 같은 값을 반환한다.

Python helper가 사용하는 PyMySQL을 설치한다.

```bash
python3 -m pip install -r scripts/requirements.txt
```

DB 접속정보 pickle의 기본 위치는 `/appdata/l0_spider_scs/db_info.pkl`이다. 예외적으로 다른 위치를 사용할 때만 서버 실행 환경에 `DB_INFO_PATH`를 지정한다. 전체 gate가 비활성인 기본 mode에서도 읽기 가능한 credential 파일이 확인되면 `/api/current-user`, `pass_history`, `hit_history`, `clicked_category_history` 전용 API allowlist가 활성화되며, `SCS_DB_CONNECTIONS_ENABLED=0`으로 차단할 수 있다. `db_info.pkl`은 비밀번호를 포함하므로 Git 추적 대상에서 제외되어 있다.

```bash
node server.mjs
```

## Database References

이하 데이터·DB 설명 중 Dashboard와 자설비 파일 read는 기본 활성화된다. DB 전용 API는
credential 파일 read 가능 여부와 `SCS_DB_CONNECTIONS_ENABLED`에 따라 사용자·세 이력 API가 활성화된다.
Mailing DB API와 다른 App은
여전히 전체 gate 뒤의 재연결 기준선이며 실제 배포 환경 값과 운영 연결 결과는 `Unknown`이다.

### 메인 대시보드 데이터

SPIDER 메인 하단의 라인별 이상 현황 대시보드는
`/appdata/abnormal_trend/pic/path` 아래에서 `YYYY-MM-DD hh:mm:ss` 형식의 파일을
조회 기간에 맞춰 읽는다. 최신 항목은 `{latest_date}`로 사용한다.

| 구분 | 경로 | 참조 컬럼 |
| --- | --- | --- |
| 전체 통계 | `/appdata/abnormal_trend/pic/stats/{latest_date}_spider_step_stats.parquets` | `exec_date`, `line_id`, `recipe_id`, `priority`, `ng`, `total` |
| 세부 통계 | `/appdata/abnormal_trend/pic/path/{latest_date}` | `sdwt`, `desc`, `recipe_id`, `priority`, `sensor`, `eqp` |

라인별 이상 1건은 세부 통계의 `sdwt`를 `/appdata/l0_spider_scs/mapping_config.json`의
`line_mapping`과 `sdwt_mapping`으로 라인에 매핑한 뒤, 같은 날짜와 라인 안에서
`desc`, `recipe_id`, `priority`, `sensor`, `eqp` 조합이 같은 행을 중복 제거하여 계산한다.
매핑할 수 없거나 비어 있는 `sdwt` 행은 라인 집계에서 제외한다.

`GET /api/dashboard-data`는 다음 쿼리를 지원한다.

- `startDate`, `endDate`: `YYYY-MM-DD` 형식의 조회 기간. 생략 시 시작일과 종료일 모두 최신 파일 날짜
- `line`: 복수 지정 가능한 라인 필터. 생략 시 조회 기간에 실제 데이터가 있는 전체 라인

하루에 파일이 여러 개 있으면 해당 날짜에서 `hh:mm:ss`가 가장 늦은 파일 1개만 읽고,
전체 최신 날짜도 전역 `{latest_date}` 파일 1개를 사용한다. 서버는 요약 KPI,
라인별 누적/A·B Grade/최신일/전일 비교/비율, 날짜·라인별 추이를 집계해 반환한다.
조회 기간 중 파일이 없는 날짜는 추이에 0건으로 포함한다. 전일 비교는 최신 파일의
`hh:mm:ss`와 정확히 같은 D-1 파일로 계산하며, 해당 파일이 없으면 비교값은 `null`로 반환한다. 기존 최신일
센서/Grade 요약값도 같은 API 응답에 유지한다.

일자별 이상 추이 선그래프는 첫 화면에서 최신일을 종료일로 한 최근 10일을 별도로
지연 조회한다. 차트의 `10일`, `30일`, `90일`, `180일` 버튼으로 기간을 전환할 수 있다.
상단 필터는 실제 데이터에 존재하는 라인의 전체/복수 선택만 제공하며 날짜 입력은 표시하지 않는다.

L0 Spider의 DB 접속정보는 `/appdata/l0_spider_scs/db_info.pkl`에서 읽는다. 아래 이력 테이블의 실제 INSERT/SELECT 기능은 해당 기능 개발 시 명시된 스키마를 기준으로 구현한다.

### `pass_history`

자설비 PASS/SKIP은 선택한 Line·SDWT의
`/appdata/abnormal_trend/pic/path_xian/{line}/{sdwt}/df_path.parquet` row가 제공하는
`ver`를 그대로 사용한다. 서버는 `file_path`에서 version을 추정하지 않으며 row의 `ver`가
비어 있으면 빈 `ver` INSERT를 거부한다. 이 값으로 원본 `l0_spider`와 같은 테이블 구조를 사용한다.
PASS 조회가 실패해도 분임조별 경로 테이블의 `recipe_id` 기반 RECIPE_ID와 일반 file chart 조회는 유지한다.

| 컬럼 | 타입 |
| --- | --- |
| `line_id` | `VARCHAR` |
| `ver` | `VARCHAR` |
| `sdwt` | `VARCHAR` |
| `desc` | `VARCHAR` |
| `recipe_id` | `VARCHAR` |
| `update_date` | `TIMESTAMP` |
| `priority` | `VARCHAR` |
| `sensor` | `VARCHAR` |
| `step` | `VARCHAR` |
| `eqp` | `VARCHAR` |
| `knox_id` | `VARCHAR` |
| `exec_date` | `TIMESTAMP` |
| `comment` | `VARCHAR` |

SKIP 흐름은 `/api/pass-history`를 사용한다. GET은 선택 Line의 상태를 조회하고
POST/DELETE로 등록·해제한다.

| `pass_history` 컬럼 | SKIP 저장값 |
| --- | --- |
| `line_id` | 필터에서 선택한 Line Name |
| `ver` | 선택한 분임조별 ERD 경로 테이블 row의 `ver` |
| `sdwt` | 최종 chart row의 `sdwt` |
| `desc` | 최종 chart row의 호환 `desc` (`recipe_id`) |
| `recipe_id` | 최종 chart row의 `recipe_id` |
| `update_date` | 최종 chart row의 `latest_date` |
| `priority` | 최종 chart row의 `priority` |
| `sensor` | 최종 chart row의 `sensor` |
| `step` | 최종 chart row의 `step` (`ch_step`) |
| `eqp` | 차트의 eqp_ch (`.png` 확장자 제외) |
| `knox_id` | 현재 접속 IP |
| `exec_date` | SKIP 버튼을 눌러 팝업을 연 시각 |
| `comment` | 팝업에서 입력한 한 줄 comment, 미입력 시 빈 문자열 |

SKIP 상태인 차트는 상단에 `이상감지 SKIP 건` 배지와 하단에 `SKIP해제` 버튼을 표시한다. 해제가 완료되면 해당 차트 식별값의 `pass_history` 데이터를 삭제하고 배지를 제거한다.
자설비 각 Chart의 `SKIP` 버튼 옆에는 `EQP ALL SKIP` 버튼을 표시한다. 어느 Chart에서
누르더라도 현재 EQP의 실제 모든 `ch_step` 경로를 조회하여 각 `ch_step`을 별도의
`pass_history` 행으로 한 번에 저장한다. `step = ALL`인 가상 행은 저장하지 않는다.
공통부 이상감지에는 `EQP ALL SKIP` 버튼을 표시하지 않는다.

공통부 이상감지의 SKIP도 같은 `/api/pass-history`와 팝업 구조를 사용한다. Chart drawing에
사용하는 공통부 `data.parquet` 경로, 선택 EQP와 `prc_group`을 서버로 전달하며,
접속자 `knox_id`는 자설비와 동일하게 서버가 결정한다. 공통부 경로에는 `{ver}`가 없으므로
공통부 SKIP은 하드코딩 값 `NA`를 `ver`에 저장한다.

| `pass_history` 컬럼 | 공통부 SKIP 저장값 |
| --- | --- |
| `line_id` | 필터에서 선택한 Line Name |
| `ver` | `NA` |
| `sdwt` | 공통부 데이터 경로의 `{sdwt}` |
| `desc` | 공통부 데이터 경로의 `{step_desc}` |
| `recipe_id` | 경로 테이블에서 선택된 `prc_group` |
| `update_date` | 공통부 데이터 경로의 `{latest_date}` |
| `priority` | 공통부 데이터 경로의 `{grade}` |
| `sensor` | 공통부 데이터 경로의 `{sensor}` |
| `step` | 공통부 데이터 경로의 `{ch_step}` |
| `eqp` | 선택 EQP (`.png` 확장자 제외) |
| `knox_id` | 현재 접속 IP |
| `exec_date` | SKIP 버튼을 눌러 팝업을 연 시각 |
| `comment` | 팝업에서 입력한 한 줄 comment, 미입력 시 빈 문자열 |

`ver = NA`인 행은 공통부 `SKIP LIST`에서 조회하며 자설비의 `SKIP LIST` 경로 복원
대상에서는 제외한다.

SDWT 필터의 마지막에는 가상 항목인 `SKIP LIST`가 표시된다. 일반 SDWT 조회에서는 SKIP 등록 시각(`exec_date`)부터 72시간 동안 `latest_date`를 제외한 ERD 경로의 모든 식별값(`line_id`, `sdwt`, `desc`, `ver`, `recipe_id`, `priority`, `sensor`, `step`, `eqp`)이 같은 행을 동일 이상건으로 처리한다. 과거 빈 `ver` 행은 나머지 식별값을 같은 방식으로 비교해 기존 SKIP 효력을 유지한다. 해당 행은 차트 목록뿐 아니라 STEP, `eqp_ch`, `sensor`, `ch_step`의 일반 이상건수 집계에서도 제외한다. 정확히 72시간이 지나면 일반 이상건과 SKIP 상태로부터 해제되고 `SKIP LIST`에서도 제거된다. 이 만료 처리는 조회 결과에서만 제외하는 UI 동작이며 `pass_history` 행은 삭제하지 않는다. 만료된 동일 식별 건을 다시 SKIP하면 기존 DB 행의 `knox_id`, `exec_date`, `comment`를 갱신하여 새로운 72시간 SKIP 기간을 시작한다.

`SKIP LIST`를 선택하면 ERD 원본 목록 대신 선택 Line의 `pass_history`를 조회한다. 이후 Sensor Grade → STEP(`desc`) → `eqp_ch`(`eqp`) → `sensor` → `ch_step`(`step`) 필터와 차트 목록은 모두 해당 테이블의 구분값으로 생성한다. 차트 행의 `file_path`는 다음 규칙으로 만들고, Scatter와 동일성 차트는 이 경로를 그대로 사용해 같은 디렉터리의 `data.parquet`을 읽는다. SKIP 해제 시 목록을 다시 조회하여 해제된 차트를 즉시 제거한다.

```text
/appdata/abnormal_trend/pic/erd_xian/{update_date}/{sdwt}/{desc}/{ver}/{recipe_id}/{priority}/{sensor}/{step}/{eqp}.png
```

### `hit_history`

HIT 이력은 원본 `l0_spider`와 같은 6-column 계약을 사용한다.

| 컬럼 | 타입 |
| --- | --- |
| `update_date` | `TIMESTAMP` |
| `line_id` | `VARCHAR` |
| `sdwt` | `VARCHAR` |
| `file_path` | `VARCHAR` |
| `knox_id` | `VARCHAR` |
| `exec_date` | `TIMESTAMP` |

Chart의 `이력저장` 버튼은 `POST /api/hit-history`를 호출한다.
자설비는 최종 chart row의 날짜·SDWT를 사용하고 다른 App은 기존 결과 경로를 파싱해 아래 규칙으로 저장한다.
`knox_id`는 요청 본문이 아니라 서버가 확인한 접속 IP를 사용한다.

| `hit_history` 컬럼 | 이력저장 값 |
| --- | --- |
| `update_date` | 자설비 최종 chart row의 `latest_date` 또는 다른 App Chart 경로의 날짜 |
| `line_id` | 화면에서 선택한 Line Name |
| `sdwt` | 자설비 최종 chart row의 `sdwt` 또는 다른 App Chart 경로의 `sdwt` |
| `file_path` | Chart drawing 원본 파일 경로의 모든 `/`를 `#`으로 치환한 값 |
| `knox_id` | 현재 접속 IP |
| `exec_date` | 이력저장 버튼 클릭 시각 |

예를 들어 `/appdata/abnormal_trend/pic/erd_xian/.../EQP-1.png`는
`#appdata#abnormal_trend#pic#erd_xian#...#EQP-1.png`로 저장한다. 버튼 클릭마다
`hit_history`에 새 행을 INSERT한다.

### `clicked_category_history`

자설비·동일성·공통부·공통부 동일성 App에서 마지막 필터를 선택해 Chart Drawing을 시작한
클릭이력을 저장한다.

| 컬럼 | 타입 |
| --- | --- |
| `line_id` | `VARCHAR` |
| `sdwt` | `VARCHAR` |
| `grade` | `VARCHAR` |
| `sensor` | `VARCHAR` |
| `update_date` | `TIMESTAMP` |
| `knox_id` | `VARCHAR` |

`POST /api/clicked-category-history`는 실제 Drawing 결과 경로를 서버에서 파싱하고 서버가
확인한 접속 IP를 `knox_id` 컬럼에 결합해 한 행을 INSERT한다. 자설비·동일성은 `ch_step`, 공통부는 마지막
필터인 `sensor`를 새로 선택할 때 호출한다. 필터를 다시 클릭해 선택 해제하거나 SKIP
LIST를 조회하는 동작은 저장하지 않는다.

| App | `line_id` | `sdwt` | `grade` | `sensor` | `update_date` |
| --- | --- | --- | --- | --- | --- |
| 자설비 | 선택 Line Name | ERD Drawing 경로 | 선택 grade를 확장한 리스트 문자열. `A/B`는 `['A', 'B']` | ERD Drawing 경로 | `ch_step` 클릭 시각 |
| 동일성 | 선택 Line Name + `(g)` | `img.png` Drawing 경로 | `img.png` Drawing 경로 | `{sensor}_{ch_step}` 경로 | `ch_step` 클릭 시각 |
| 공통부 | 선택 Line Name + `(c)` | `data.parquet` Drawing 경로 | `data.parquet` Drawing 경로 | `data.parquet` Drawing 경로 | `sensor` 클릭 시각 |

한 번의 Drawing 결과에 여러 grade 또는 sensor가 포함되면 중복을 제거한 리스트 문자열로
저장한다. 동일성 App의 STEP(`step_desc`) 선택값은 저장하지 않으며, 업로드 요청은
Drawing 결과를 `sdwt`, `grade`, `sensor` 기준 대표 경로로 압축해 기존 컬럼 구조를
유지한다. 단, sensor 필터에서 `ALL`을 선택한 클릭이력은 여러 센서명을 긴 리스트로
확장하지 않고 `sensor` 컬럼에 `ALL`을 저장한다. 다른 선택 컬럼도 값이 `ALL` 하나이면
리스트 표현이 아닌 `ALL` 문자열 그대로 저장한다. 자설비의 클릭이력·SKIP·이력저장은
별도 reference 경로가 아니라 선택한 분임조별 `path_xian` row의 `file_path`를 공통으로 사용한다.
DB 응답의 `affectedRows`가
0이면 저장 성공으로 처리하지 않고 화면에 오류를 표시한다. `knox_id`는 모든 App에서
서버가 확인한 접속 IP를 사용한다.

현재 확인된 정보에는 `VARCHAR` 길이, 기본키, 인덱스, NULL 허용 여부와 기본값이 포함되어 있지 않으므로 각 표에서는 별도로 가정하지 않는다.

## Self-equipment UI Versions

- 최초버전: `src/features/fdc-trend/pages/versions/FdcTrendPage.initial.jsx.bak`
- 개선버전(현재 사용): `src/features/fdc-trend/pages/FdcTrendPage.jsx`

원복 절차는 `src/features/fdc-trend/pages/versions/README.md`를 참조한다.

## Data References

아래 표는 다른 서버에 별도 서비스할 자설비 이상감지 App의 신규 데이터 연결 기준이다.
실제 파일 연결과 운영 데이터 검증은 아직 수행하지 않았다.

| 구분 | 참조 파일 | 참조 경로 | 참조 컬럼/키 |
| --- | --- | --- | --- |
| `latest_date` 결정 및 대시보드 세부 파일 | `{latest_date}` | `/appdata/abnormal_trend/pic/path_xian/{latest_date}` | `{latest_date}` |
| 최신 자설비 index | `{latest_date}` | `/appdata/abnormal_trend/pic/path_xian/{latest_date}` | `ver` 포함; 현재 일반 자설비 필터에서는 사용하지 않음 |
| 분임조별 ERD 이상감지 경로 테이블 | `df_path.parquet` | `/appdata/abnormal_trend/pic/path_xian/{line}/{sdwt}/df_path.parquet` | `sdwt`, `desc`, `ver`, `recipe_id`, `priority`, `sensor`, `step`, `eqp`, `file_path`, `line_rev` |
| 자설비 이상감지 단일설비 데이터 | `data.parquet` | `file_path`가 `{eqp}.png`이면 같은 디렉터리의 `data.parquet`; 디렉터리이면 하위 `data.parquet`; 이미 `data.parquet`이면 그대로 사용 | 선택적 `ver`가 있으면 정확히 일치하는 row 우선·단일값 file-scope fallback, 없으면 선택 경로에 한정된 파일로 처리; `act_time` (x축), 실제 schema의 `{sensor}_{ch_step}` 우선·`{sensor}*{ch_step}` 호환 (y축), `eqp_cb` 또는 `eqp` (차트별 EQP 필터), 선택적 hover 컬럼 |
| 자설비 이상감지 동일성 데이터 | `data.parquet` | 위와 같은 `file_path` 변환으로 선택한 `data.parquet` | 위와 같은 선택적 `ver` 규칙, `act_time` (x축), 실제 schema의 `{sensor}_{ch_step}` 우선·`{sensor}*{ch_step}` 호환 (y축), `eqp_cb` (series), 선택적 hover 컬럼 |
| EQP 변경점 이력 | `{eqp}.parquet` | 선택한 `data.parquet`와 같은 디렉터리의 `{eqp}.parquet` | `date` (세로 점선 위치), `work_type` (점선 라벨), `ctttm_url`, `desc` |

일반 자설비 구현은 선택한 Line·SDWT로 분임조별 `path_xian/{line}/{sdwt}/df_path.parquet`를
직접 읽는다. 화면 `RECIPE_ID` 필터는
`recipe_id` 컬럼을, `ch_step`은 `step` 컬럼을 사용한다. `file_path`의
`/pic_server2/` segment는 `/pic/`로 바꾸고, `.png` `file_path`는 같은 디렉터리의
`data.parquet`와 `{eqp}.parquet`로 변환한다. directory와 `data.parquet` 직접 입력도 호환한다.
차트 로드가 실패하면 오류 카드에 변환된 실제 `data.parquet` 참조 경로를 표시한다.
차트는 실제 Parquet schema에서 `{sensor}_{ch_step}`을 우선하고 `{sensor}*{ch_step}`도
호환하며, 단일설비 EQP 식별은 `eqp_cb` 또는 `eqp`, 동일성 series는 `eqp_cb`를 사용한다.
hover 보조 컬럼은 존재하는 항목만 projection한다. 일반 조회는 chart 요청의
Line·SDWT·EQP·sensor·step·`ver`·경로가 선택한 분임조별 row와 모두 일치할 때만 후속
Parquet를 읽는다. SKIP LIST는 `pathSdwt=__SKIP_LIST__`로 구분하고 전달된 ERD `file_path`의
같은 디렉터리 `data.parquet`을 직접 읽는다. Scatter·3일 동일성·동일성 팝업은 같은 경로를
공통 request builder로 전달한다. 단일설비 `data.parquet`에 선택적 `ver`가 있으면 같은 row를 우선 사용하고,
파일 내부 `ver`가 단일 값이면 선택 경로로 이미 version이 한정된 것으로 처리한다. `ver` 컬럼이
없어도 선택한 `file_path`가 version 범위를 한정한 것으로 보고 drawing을 유지한다.
여러 `ver`가 섞였는데 요청값이 없으면 point를 반환하지 않는다. DB 이력에는
분임조별 ERD 경로 row의 `ver`를 그대로 전달하며, 비어 있으면 SKIP 저장을 거부한다.
클릭이력·SKIP·HIT에는 분임조별 row의 `file_path`를 사용한다. chart `file_path`가 있으면 action을
노출하고 요청하며, DB capability가 없으면 서버가 `503 DATA_CONNECTIONS_DISABLED`로 거부한다.
이력 요청과 DB record를 브라우저·서버 Console에 별도로 출력하지 않으며 API 응답에도
`debugRecord`를 포함하지 않는다. 자설비 클릭이력은 분임조별 경로 조회 응답의
`filters.sdwt`·`filters.priorities`·`filters.sensor`로 6컬럼을
구성한다. `file_path`는 선택 결과 존재 확인과 요청 추적에만 남기며 6컬럼 구성에서는 경로 형식이나
mount root를 해석하지 않는다.
자설비 SKIP과 이력저장도 선택된 chart row의 확정 필드를 각각 `pass_history` 13컬럼과 `hit_history`
6컬럼으로 전달하며, 자설비에서는 `file_path`의 legacy 계층이나 mount root를 다시 해석하지 않는다.

새 데이터 파일이나 참조 컬럼/키가 추가되면 이 표와
`src/config/spiderDataPaths.mjs`를 함께 업데이트한다.

### 공통부 이상감지 App

`/common-anomaly`은 공통부 이상감지 경로 테이블을 기준으로 `Line Name` → `SDWT` →
`prc_group` → `eqp` → `sensor` 순서의 필터를 제공한다. `Line Name`은 테이블의
`line_rev`와 비교하고 나머지 필터는 같은 이름의 컬럼과 비교한다. `eqp` 필터에는
선택한 `prc_group`의 전체 설비를 조회하는 `ALL` 항목이 포함된다.

최종 필터 결과의 각 `file_path`는 아래 순서로 공통부 `data.parquet` 경로로 변환한다.

1. 경로 문자열의 `pic_server2`를 `pic`로 변경한다.
2. 경로의 마지막 `.png` 파일명을 `data.parquet`으로 변경한다.

예를 들어 아래 경로는 같은 디렉터리의 공통부 parquet 파일로 변환된다.

```text
/appdata/abnormal_trend/pic_server2/common/2026-07-17/SDWT-1/ETCH/A/TEMP/10/EQP-1.png
→ /appdata/abnormal_trend/pic/common/2026-07-17/SDWT-1/ETCH/A/TEMP/10/data.parquet
```

메인 카드에는 위 `data.parquet` 파일명을 선택 EQP의 `{eqp_cb}.png`로 바꾼 이미지를
출력한다. 이미지 카드는 데스크톱 기준 2열로 표시하며 이미지 로드에 실패하면 카드에
최종 이미지 절대경로를 표시한다.

`동일성 차트`는 `data.parquet`의 `act_time`과 `{sensor}_{ch_step}`을 사용하여 같은
파일의 전체 `eqp_cb`를 자설비와 같은 UI로 비교하고,
선택 EQP를 강조한다. `SKIP`은 자설비와 같은 팝업·등록·해제 UI를 사용한다.
SDWT 필터 마지막의 `SKIP LIST`를 선택하면 선택 Line에서 `ver = NA`인
`pass_history` 행을 `prc_group`(`recipe_id`) → `eqp` → `sensor` 순서로 조회하고,
저장된 값으로 `data.parquet` 및 `{eqp}.png` 경로를 복원한다. SKIP 해제 후에는 해당
이미지가 목록에서 즉시 제거된다.

일반 SDWT 조회에서는 공통부 SKIP 등록 시각(`exec_date`)부터 72시간 동안
`line_id`, `sdwt`, `desc`, `priority`, `sensor`, `step`(`ch_step`), `eqp`의 7개 값이
모두 같은 행을 동일 이상감지 건으로 판단한다. 이 비교에는 `ver`, `recipe_id`,
`update_date`를 사용하지 않으며, 동일 건은 이미지 목록과 각 필터 건수에서 제외된다.
정확히 72시간이 지나면 일반 이상감지 대상에 다시 포함되고 공통부 `SKIP LIST`에서도
제거된다. 만료된 `pass_history` 행은 DB에서 삭제하지 않으며 UI 조회에서만 제외한다.
`이력저장`은 현재 공통부 결과 카드에서 `/api/hit-history`를 호출한다.

- 필터·경로 목록 API: `GET /api/common-anomaly-data`
- SKIP LIST API: `GET /api/pass-history?view=common-filters`
- 이미지 API: `GET /api/common-anomaly-image`
- 동일성 데이터 API: `GET /api/common-anomaly-scatter-data?mode=identity`
- 서버 데이터 모듈: `server/commonAnomalyData.mjs`
- 화면: `src/features/fdc-trend/pages/CommonAnomalyPage.jsx`

### 동일성 최신날짜

서버의 오늘 날짜를 `YYYY-MM-DD` 형식으로 생성해
`/appdata/abnormal_trend/pic/path_erd_commonality_xian/{YYYY-MM-DD}` 경로 테이블을
`동일성 최신날짜` 데이터로 사용한다. 다른 날짜 파일을 탐색해 최신값을 선택하지 않는다.

공용 함수 `getLatestCommonalityPath`는 다음 구조를 반환하며
`GET /api/latest-commonality-path`에서도 같은 구조를 제공한다.

```json
{
  "name": "동일성 최신날짜",
  "path": "/appdata/abnormal_trend/pic/path_erd_commonality_xian/2026-08-28",
  "date": "2026-08-28"
}
```

오늘 날짜의 경로 테이블 파일이 없으면 API는 `404`와 명확한 오류 메시지를 반환한다.
경로 테이블 root를 예외적으로 변경해야 할 때만 `COMMONALITY_PATH_TABLE_ROOT`를 사용한다.
결과 이미지 root override인 `COMMONALITY_ROOT_PATH`는 기존 이력 경로 해석 계약을 유지한다.
공통부 동일성 root가 같은 mount의 형제 경로가 아니면 `COMMON_COMMONALITY_ROOT_PATH`로 직접 지정한다.

### 동일성 이상감지 App

`/matching-anomaly`은 실제 동일성 기준 이상감지 그래프 파일을 사용한다. Line Name과
SDWT는 자설비 이상감지와 동일하게 `mapping_config.json`의 `line_mapping`,
`sdwt_mapping`을 사용한다. 필터 순서는 Line Name → SDWT → STEP(`step_seq`, API `stepSeq`) →
Sensor → `ch_step`이다. 서버는 경로 테이블의 `sdwt_code`, `step_seq`, `recipe_id`,
`priority`, `sensor`, `ch_step`, `path` 컬럼을 읽는다. 화면 계약에는 각각 SDWT, STEP,
PPID, grade, Sensor, ch_step으로 변환하고 그래프 경로는 `path + /img.png`로 만든다.
`file_path` 컬럼도 이전 생산 파일과의 호환을 위해 `path` 대신 허용한다.

경로 테이블은 파일 `mtimeMs`와 크기를 기준으로 bounded cache하며 같은 파일의 동시 읽기를
공유한다. 이미지 API는 오늘 경로 테이블에 등록된 `img.png` 경로만 허용한 후 실제 파일을
stream한다.

```text
/appdata/abnormal_trend/pic/path_erd_commonality_xian/{YYYY-MM-DD}
  path 컬럼 + /img.png
```

Sensor의 `ALL`을 선택하면 ch_step에는 `ALL`만 표시하며, 이를 선택하면
Line Name, SDWT와 STEP까지 선택한 범위에 속한 모든 Sensor와 ch_step 이미지를 조회한다.
개별 Sensor를 선택한 경우에는 해당 Sensor의 ch_step과 `ALL`을 제공한다. 최종 필터
결과는 `step_seq`별로 분류하여 데스크톱 기준 3열 이미지 카드로 표시한다.
이미지는 한 페이지당 최대 18장만 렌더링하고 이미지 영역 상단의 숫자 탭으로 페이지를
전환한다. 이미지 로드에 실패하면 해당 카드에 오류 상태를 표시한다.

- 필터·이미지 목록 API: `GET /api/commonality-data`
- 이미지 제공 API: `GET /api/commonality-image?path=...`
- 서버 데이터 모듈: `server/commonalityData.mjs`
- 화면: `src/features/fdc-trend/pages/CommonalityAnomalyPage.jsx`

### 공통부 동일성 이상감지 App

`/common-commonality-anomaly`은 `path_common_commonality`의 최신 유효 `YYYY-MM-DD` 날짜 디렉터리를 사용한다.
Line Name과 SDWT는 기존 동일성 화면과 같은 mapping을 사용하고, 필터 순서는 Line Name →
SDWT → EQP_MODEL → Sensor → `ch_step`이다. 고정 경로 깊이의 디렉터리를 제한 병렬 조회하고
결과를 5분간 캐시하며, `{sensor}@{ch_step}`은 첫 번째 `@`를 기준으로 분리하므로
`ch_step` 내부의 `@`는 그대로 유지한다.

Sensor `ALL`, ch_step `ALL`, 최대 18개 이미지 페이지네이션과 클릭이력 저장은 기존 동일성
화면과 같은 계약을 사용한다. 최종 결과는 EQP_MODEL별로 분류하며 이미지 endpoint는 최신
공통부 동일성 root 아래의 `img.png`만 제공한다.

- 필터·이미지 목록 API: `GET /api/common-commonality-data`
- 이미지 제공 API: `GET /api/common-commonality-image?path=...`
- 서버 탐색 모듈: `server/commonCommonalityData.mjs`
- 화면: `src/features/fdc-trend/pages/CommonalityAnomalyPage.jsx`
