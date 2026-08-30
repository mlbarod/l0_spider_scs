# L0 Spider SCS Troubleshooting

## 1. 공통 원칙

먼저 증상 시각, URL, HTTP status, 대상 환경과 최근 변경을 기록한다. 읽기 전용 확인부터 수행하고 `/appdata`, 운영 DB, 실제 수신자와 service를 임의로 변경하지 않는다. 오류 공유 전에 secret·credential·개인정보를 마스킹한다.

## 2. 서버 미기동 또는 전체 접속 불가

확인 순서:

1. 실제 service/unit 상태와 restart 횟수
2. journal의 시작 오류
3. listener와 proxy 연결
4. `PORT` 충돌 또는 잘못된 `WorkingDirectory`
5. static 모드의 `dist/index.html` 존재

`MODULE_NOT_FOUND`이면 release 경로와 의존성 설치 결과를, `EADDRINUSE`이면 해당 port의 기존 process 소유권을 먼저 확인한다. 다른 process를 임의 종료하지 않는다.

## 3. Vite host 또는 HMR 오류

`VITE_SITE_URL`, 접속 host, proxy의 Host/WebSocket 전달과 Vite `allowedHosts` 설정을 대조한다. 이 문제는 API가 적어서 발생하는 것이 아니다. Vite와 통합 서버는 같은 20개 API handler를 등록한다.

## 4. 503 `DATA_CONNECTIONS_DISABLED`

- 요청 경로와 method가 gate allowlist에 있는지 확인한다.
- 전체 gate `SCS_DATA_CONNECTIONS_ENABLED`와 해당 기능별 gate를 확인한다.
- DB API라면 `SCS_DB_CONNECTIONS_ENABLED` 및 `DB_INFO_PATH` 가독성을 확인한다.
- 실제 환경변수 값이나 DB 파일 내용을 로그·보고서에 복사하지 않는다.

## 5. `/appdata` 파일 누락·권한 오류

Dashboard, 자설비, 동일성 중 어느 root에서 실패했는지 구분한다. service user로 대상 directory와 파일의 존재·읽기 권한만 확인한다. 운영 파일을 자동 생성하거나 다른 위치로 이동해 증상을 숨기지 않는다.

정상 빈 결과와 파일 read 오류를 구분하고, 경로 override가 기본 경로와 다르면 service 환경을 확인한다.

## 6. Dashboard 빈 데이터·오래된 데이터

- `/api/dashboard-latest-date`와 화면 표시 시각을 대조한다.
- 같은 기준 시각의 stats와 detail 원천이 모두 있는지 확인한다.
- Line mapping과 요청 날짜·Line 필터를 확인한다.
- 프론트엔드에서 KPI를 재계산해 임시 보정하지 않는다.

## 7. 자설비·동일성 조회 오류

- mapping의 Line·SDWT와 index 경로가 일치하는지 확인한다.
- 선택된 `file_path`, `data.parquet`, image가 허용 root 안에 있는지 확인한다.
- Sensor·STEP·RECIPE_ID 필터가 실제 column과 일치하는지 확인한다.
- `/api/erd-file` 등 전체 gate가 필요한 요청이 차단되었는지 확인한다.

## 8. DB 이력 기능 오류

현재 DB 점검 대상은 사용자 식별과 SKIP·HIT·click 이력이다. MY EQP 등록 readiness를 확인하지 않는다. gate와 DB 정보 파일의 권한, 연결 오류를 확인하되 테스트용 운영 DB 쓰기를 수행하지 않는다.

## 9. Sensor 제외가 반영되지 않음

- 실제 사용 중인 `SENSOR_EXCLUSION_CONFIG_PATH` 또는 기본 경로를 확인한다.
- [Sensor 제외 설정 가이드](sensor-exclusion-config.md)의 validate 명령을 후보 파일에 실행한다.
- 설정 파일이 없으면 빈 규칙 fallback이 정상 동작이다.
- 이전 정상 cache가 유지되는 reload 실패인지 journal을 확인한다.

## 10. MY EQP·HMAC·Mailing 문의

- MY EQP 등록은 개발예정이며 `/registration`과 `/recipients`도 개발예정 화면이다.
- HMAC 생성·검증은 현재 구현된 통제가 아니다.
- Mailing은 요약 데이터, template과 잔여 등록 API만 있으며 실제 renderer·scheduler·sender는 확인되지 않는다.

따라서 이 항목을 운영 장애로 분류하기 전에 현재 제공 범위인지 확인한다. 실제 mail을 보내거나 운영 수신자로 시험하지 않는다.

## 11. Build 실패

Node/npm version, lockfile, dependency 설치, Vite build 오류의 첫 원인을 확인한다. `LIVE_RELOAD=0`이고 `BUILD_ON_START=0`이면 기존 `dist/index.html`이 필요하다. 실패한 build로 service를 재시작하지 않는다.

## 12. 종료와 escalation

정상화 조건을 기능별로 다시 확인하고 원인, 영향, 수행한 조치, rollback 가능 여부와 미검증 사항을 기록한다. 데이터 생성 pipeline, DB, proxy 또는 service manager 소유 영역이면 해당 owner에게 evidence와 함께 escalation한다.
