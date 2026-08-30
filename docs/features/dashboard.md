# L0 Spider 대시보드 기능 및 API 계약 기준

## 1. 기능 범위

Dashboard는 `/`와 `/fdc_trend`에서 제공되는 운영 기능이다. 최신 알고리즘 수행 시각, KPI, Line별 요약과 기간 추이를 표시한다.

메일 발송 화면이나 등록 기능을 제공하지 않는다. 응답의 `lineDashboard.mailingSummary`는 대시보드 집계 결과 중 남아 있는 데이터 계약이며 실제 메일 renderer·scheduler·sender의 존재를 뜻하지 않는다.

## 2. API

| Method | 경로 | 용도 |
|---|---|---|
| `GET`, `HEAD` | `/api/dashboard-data` | 기간·Line 조건이 적용된 전체 대시보드 응답 |
| `GET`, `HEAD` | `/api/dashboard-stats` | 최신 통계 KPI와 `lineDashboard` |
| `GET`, `HEAD` | `/api/dashboard-latest-date` | 마지막 알고리즘 수행 시각 |

`npm run dev`와 `node server.mjs` 모두 이 API를 제공한다.

## 3. 요청 계약

- `startDate`, `endDate`: 선택적 날짜 범위
- `line`: 반복 가능한 Line 필터
- 값이 없으면 서버의 기본 최신 범위를 사용한다.

프론트엔드는 성공 응답을 받은 뒤 `assertDashboardIntegrity`로 요청 조건과 응답의 교차 불변조건을 확인한다.

## 4. 응답 계약

상위 응답은 최신 시각과 KPI를 포함하고 `lineDashboard`는 다음 범주를 제공한다.

- 사용 가능한 필터와 선택 상태
- 전체 요약 및 grade별 건수
- Line·날짜 추이
- 상세 집계
- `mailingSummary`
- 원천과 최신성 판단에 필요한 meta

정확한 필드·type은 `harness/contracts/dashboard-api.schema.json`과 `harness/contracts/dashboard-latest-date-api.schema.json`을 기준으로 한다. 집계 규칙을 바꿀 때는 Schema, fixture, contract test, 프론트엔드 무결성 검사를 함께 검토한다.

## 5. 데이터 원천과 집계

- 통계: `/appdata/abnormal_trend/pic/stats/{latest_date}_spider_step_stats.parquets`
- 상세: `/appdata/abnormal_trend/pic/path/{latest_date}`
- Line 표시와 범위: `/appdata/l0_spider_scs/mapping_config.json`

`monitoringSensorTotal`, grade 건수, 전일 대비와 상세 고유 건수는 서버 집계 결과를 사용한다. 프론트엔드나 메일 템플릿에서 독립적으로 다시 계산해 의미를 바꾸지 않는다.

## 6. 오류와 빈 데이터

- 조회 중에는 loading 상태를 표시한다.
- 정상 응답이지만 조건에 맞는 결과가 없으면 빈 상태를 표시한다.
- 원천 파일 누락, 읽기 실패, 잘못된 응답은 오류 상태로 처리한다.
- 안전한 API 오류 shape를 유지하고 내부 경로나 stack을 사용자 응답에 넣지 않는다.

## 7. Sensor 제외 설정

저장소에는 예시 파일 `config/sensor-exclusions.example.json`만 있다. 실제 `config/sensor-exclusions.json`이 없으면 대시보드와 관련 조회는 빈 제외 규칙을 사용한다. 운영 적용 절차는 [Sensor 제외 설정](../operations/sensor-exclusion-config.md)을 따른다.

## 8. 검증 자산

- `server/dashboardData.test.mjs`
- `server/dashboardStats.test.mjs`
- `tests/contract/dashboard-api.contract.test.mjs`
- `tests/contract/dashboard-latest-date-api.contract.test.mjs`
- `tests/contract/mailing-summary.contract.test.mjs`
