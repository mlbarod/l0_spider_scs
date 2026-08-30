# L0 Spider SCS 환경 정의

## 1. 실행 모드

| 명령·설정 | 동작 |
|---|---|
| `npm run dev` | Vite 개발 서버, React HMR, 20개 API handler 등록 |
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
