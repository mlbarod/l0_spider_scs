# L0 Spider SCS 배포 기준

## 1. 범위

이 문서는 저장소에서 확인되는 안전한 배포 기준을 정의한다. 실제 운영 service 이름, proxy, 배포 경로와 승인 절차는 대상 환경의 운영 기준을 우선한다.

## 2. 배포 단위

- 애플리케이션 소스와 `package-lock.json`
- Vite build 결과 `dist/` 또는 시작 시 build 가능한 소스
- 문서와 직접 관련된 contract·test
- 배포 환경이 관리하는 `/appdata` 분석 파일, mapping JSON, DB 정보 파일, 선택적 Sensor 제외 설정

운영 `/appdata`는 애플리케이션 배포물로 덮어쓰거나 이동하지 않는다.

## 3. 실행 방식

- `server.mjs`는 기본적으로 Vite live reload middleware를 사용한다.
- 정적 배포는 `LIVE_RELOAD=0`을 설정하고 `dist/index.html`을 준비한다.
- `BUILD_ON_START=0`이면 시작 전 `npm run build`가 완료되어 있어야 한다.
- Vite 개발 서버와 통합 서버 모두 같은 20개 API 경로를 등록한다.

## 4. 배포 전 확인

- 의도한 commit과 작업 트리 상태를 확인한다.
- 변경 범위에 가까운 test와 build를 수행한다.
- route의 운영중·개발예정 표시가 문서와 일치하는지 확인한다.
- 필요한 `/appdata` root와 `mapping_config.json`을 읽을 수 있는지 확인한다.
- DB 기능이 필요하면 `DB_INFO_PATH`의 존재·권한만 확인하고 내용을 출력하지 않는다.
- Sensor 제외가 필요한 환경만 실제 설정 파일을 준비하고 validate한다. 파일이 없으면 빈 규칙이라는 점을 승인한다.

## 5. 반영과 정상 판정

1. 기존 artifact와 환경 설정의 복구 지점을 확보한다.
2. 의존성과 build 산출물을 준비한다.
3. 환경변수를 service manager에 반영한다.
4. 승인된 절차로 service를 재시작한다.
5. process·listener·정적 화면을 확인한다.
6. Dashboard, 자설비, 동일성의 직접 관련 API를 읽기 전용으로 확인한다.
7. 개발예정 카드가 실제 기능 화면으로 잘못 연결되지 않는지 확인한다.

## 6. Rollback

코드·artifact·환경설정을 이전 승인 상태로 되돌리되 운영 데이터 파일이나 DB에 rollback용 쓰기를 수행하지 않는다. Schema 또는 데이터 계약이 바뀐 릴리스는 호환 가능 여부를 먼저 확인한다.

## 7. 관련 절차

- [Runbook](../operations/runbook.md)
- [systemd 기준](../operations/systemd.md)
- [릴리스 체크리스트](../operations/release-checklist.md)
- [백업·복구](../operations/backup-restore.md)
