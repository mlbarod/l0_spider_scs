# L0 Spider SCS 문서 현행화 사전 점검 보고서

> 작성일: 2026-08-30  
> 목적: 이전 `l0_spider`에서 가져온 `docs/` 문서를 현재 `l0_spider_scs` 구조에 맞게 정리하기 전, 수정 필요 범위와 기준을 다음 작업 세션에 전달한다.  
> 조사 범위: `docs/`의 Markdown 25개와 사용자 메뉴얼 이미지 11개, 현재 UI route·API gate·설정·관련 테스트  
> 변경 상태: 이 조사에서는 기존 문서와 애플리케이션 코드를 수정하지 않았다.

## 조사 결과 요약

`docs/`의 Markdown 25개와 이미지 11개 중 상당 부분이 이전 `l0_spider` 구조를 현재 기능처럼 설명하고 있어 전반적인 정리가 필요하다.

## 핵심 불일치

### 1. 현재 사용자 기능 범위가 잘못 섞여 있음

현재 메인 화면 기준 운영 기능은 Dashboard, 자설비 이상감지, 동일성 이상감지, 사용자 메뉴얼이다. 공통부 이상감지, 공통부 동일성, MY EQP 등록, Hard Limit, Defect/L1/L3는 `개발예정`이다.

다만 코드에는 다음 잔여 경로가 있어 문서에서 별도로 구분해야 한다.

- `/common-commonality-anomaly`: 직접 접속 가능한 호환 화면
- `/defect-spider`, `/l1-spider`, `/l3-spider`: mock data 기반 화면이 직접 접속 가능
- `CommonAnomalyPage`, `MailingRegistrationPage`: 현재 route에 연결되지 않은 구현
- `/api/mailing-registration`, 공통부 API: 서버에는 남아 있지만 기본 서비스 진입 경로와 다름

근거:

- `src/features/fdc-trend/routes.jsx`
- `src/features/fdc-trend/pages/L0SpiderHomePage.jsx`

### 2. MY EQP 관련 설명이 대량으로 남아 있음

`self-equipment.md`, `step-deeplink.md`, `mailing.md`, `data-flow.md`, `security.md` 등은 삭제된 다음 기능을 현재 구현처럼 설명한다.

- `/api/my-eqp-*`
- `myeqp_regist`
- `my_eqp_registration.py`
- `step=ALL` MY EQP 흐름
- MY EQP Mailing Report
- 등록 화면과 관련 컴포넌트

현재 해당 API와 helper는 존재하지 않는다. 반대로 메인에는 `MY EQP 등록` 개발예정 카드가 남아 있어 `docs/decisions/ADR-004-scs-my-eqp-scope.md`의 “노출하지 않는다”는 결정과도 충돌한다.

실제로 `tests/unit/no-my-eqp-runtime.test.mjs`는 `L0SpiderHomePage.jsx`와 `routes.jsx` 때문에 실패했다.

### 3. Vite와 통합 서버의 API 범위 설명이 오래됨

여러 문서가 `npm run dev`의 API가 제한적이라고 설명하지만, 현재 `vite.config.mjs`와 `server.mjs`는 동일한 20개 API 경로를 등록한다.

따라서 architecture, environment, deployment, runbook, troubleshooting, release checklist와 현재 README의 관련 설명을 수정해야 한다.

### 4. Sensor 제외 설정 문서와 저장소 상태가 다름

문서는 `config/sensor-exclusions.json`을 기본 실제 설정 파일로 설명하지만 현재 저장소에는 `config/sensor-exclusions.example.json`만 있다.

그 결과 sensor-exclusions contract test도 파일 누락으로 실패했다. 현재 코드는 파일이 없으면 빈 제외 규칙으로 fallback한다.

### 5. Mailing을 사용자 기능과 구현 잔여물로 구분해야 함

현재 확인되는 것은 다음뿐이다.

- `lineDashboard.mailingSummary`
- `public/mailing-report.html`
- route에 연결되지 않은 `MailingRegistrationPage`
- 전체 gate 뒤에 남은 `/api/mailing-registration`
- 실제 renderer·scheduler·sender 없음

따라서 “Mailing 등록·발송 기능”이 아니라 “남아 있는 template/API 구현과 현재 미제공 범위”로 다시 작성해야 한다.

## 문서별 수정 규모

### 대폭 수정 또는 역사 문서로 전환

- `docs/decisions/ADR-003-step-hmac-token.md`
- `docs/features/abnormal-data.md`
- `docs/features/mailing.md`
- `docs/features/self-equipment.md`
- `docs/features/step-deeplink.md`
- `docs/operations/release-checklist.md`
- `docs/operations/runbook.md`
- `docs/operations/sensor-exclusion-config.md`
- `docs/operations/troubleshooting.md`
- `docs/system/architecture.md`
- `docs/system/data-flow.md`
- `docs/system/overview.md`
- `docs/system/security.md`
- `docs/user-manual/USER_MANUAL.md`
- `docs/user-manual/index.md`

특히 `self-equipment.md`는 MY EQP 부분을 제거하되, 사용자가 보존을 요청한 `13.1 Data References` 표는 그대로 유지해야 한다.

### 현재 내용은 유지하면서 부분 정정

- `docs/decisions/ADR-001-frontend-stack.md`: 등록 화면 범위와 Vite API 차이 설명 수정
- `docs/decisions/ADR-002-parquet-storage.md`: MY EQP DB 역할 제거, 사용자 노출 상태 구분
- `docs/decisions/ADR-004-scs-my-eqp-scope.md`: 개발예정 카드와 `/registration` 실제 동작 반영
- `docs/features/dashboard.md`: 오래된 commit, Mailing 범위, sensor 설정 상태 수정
- `docs/operations/backup-restore.md`: MY EQP·HMAC·Mailing 이론 부분 축소
- `docs/operations/systemd.md`: MY EQP readiness와 API 범위 수정
- `docs/system/deployment.md`: 기본 설정 파일과 서비스 노출 범위 수정
- `docs/system/environment-definition.md`: Vite API 범위, sensor 설정, 잔여 API 구분
- `docs/system/glossary.md`: MY EQP를 현재 용어에서 역사 용어로 변경

### 현재 기준과 대체로 일치

- `docs/operations/development-agent-workflow.md`

## 사용자 메뉴얼 이미지

현재 이미지는 재생성이 필요하다.

- `01-main-screen.png`: 공통부·Defect/L1/L3를 운영중으로 표시하는 과거 화면
- `03`, `04`: 현재 RECIPE_ID, 동일성 토글, 모아보기 UI 미반영
- `08`: 현재 필요한 STEP 필터가 없음
- `09`, `10`: 현재 메인에서 제공하지 않는 공통부 화면
- `02`, `07`, `08`, `10`, `15`: 본문에서 사용하지 않거나 기준이 오래됨

`scripts/generate-user-manual-screenshots.mjs`도 현재 `/common-anomaly`가 Under Construction인 상태를 반영하지 않아 함께 조정해야 한다.

## 제안하는 정리 기준

다음 기준으로 문서를 고치는 것이 안전하다.

- 운영 기능: Dashboard, 자설비, 동일성, 사용자 메뉴얼
- 개발예정 기능: 메인 화면의 개발예정 카드 전체
- 직접 호환 경로와 연결되지 않은 코드: “내부 잔여 구현·공식 서비스 아님”으로 명시
- MY EQP·HMAC 과거 분석: 현재 기능 문서에서 제거하고 ADR의 역사 기록으로만 보존
- `Data References`: `docs/features/self-equipment.md`에 그대로 유지
- 오래된 commit 고정값과 `mock-agent/Core Harness` 반복 설명은 축소
- 실제 확인된 코드·route·API gate를 기준으로 문서별 역할을 다시 분리

## 확인한 테스트 결과

관련 test file 12개 중 10개가 통과했고 2개가 현재 코드·파일 상태 불일치로 실패했다.

### 실패

1. `tests/unit/no-my-eqp-runtime.test.mjs`
   - `src/features/fdc-trend/pages/L0SpiderHomePage.jsx`
   - `src/features/fdc-trend/routes.jsx`
   - 위 두 파일의 MY EQP 개발예정 카드·route가 ADR 및 테스트 기대와 충돌한다.

2. `tests/contract/sensor-exclusions.contract.test.mjs`
   - `config/sensor-exclusions.json` 파일이 없어 `ENOENT`로 실패한다.

### 통과

- `tests/unit/under-construction-apps.test.mjs`
- `tests/unit/step-hmac.test.mjs`
- `tests/integration/step-deeplink.test.mjs`
- `server/dashboardData.test.mjs`
- `server/dashboardStats.test.mjs`
- `tests/contract/dashboard-api.contract.test.mjs`
- `tests/contract/dashboard-latest-date-api.contract.test.mjs`
- `tests/contract/mailing-summary.contract.test.mjs`
- `tests/contract/mapping-config.contract.test.mjs`
- `tests/contract/safe-api-error.contract.test.mjs`

## 다음 세션 권장 작업 순서

1. 현재 사용자 노출 범위와 내부 잔여 구현의 상태를 기준선으로 확정한다.
2. ADR-004와 Overview에서 MY EQP·개발예정 정책 충돌을 먼저 정리한다.
3. Self Equipment의 현재 계약을 다시 작성하되 `13.1 Data References`를 보존한다.
4. MY EQP·HMAC·Mailing 과거 설명을 현재 기능 문서에서 제거하거나 역사 문서로 전환한다.
5. architecture, data-flow, environment와 API gate 설명을 현재 코드로 갱신한다.
6. 운영 문서에서 Vite API 차이, MY EQP readiness와 존재하지 않는 sensor 설정 파일 전제를 제거한다.
7. 사용자 메뉴얼 본문과 화면 이미지를 현재 지원 기능에 맞게 갱신한다.
8. 문서 링크, `git diff --check`와 직접 관련된 contract·unit test를 실행한다.

## 작업 시 보존해야 할 사항

- `docs/features/self-equipment.md`의 `13.1 Data References` 표
- 기존 사용자 동작, API 및 데이터 호환성
- `/appdata` 운영 파일과 운영 DB의 비변경 원칙
- 실제 비밀번호, token, credential 및 `.env` 값 비노출 원칙
- 현재 제공 기능과 코드에만 남은 비노출 구현의 명확한 구분
