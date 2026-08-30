# L0 Spider Mailing 잔여 구현 기준

## 1. 현재 판정

L0 Spider SCS는 현재 사용자 기능으로 메일 등록·생성·예약 발송을 제공하지 않는다. 다음 자산만 저장소에 남아 있다.

| 자산 | 현재 의미 |
|---|---|
| `lineDashboard.mailingSummary` | 대시보드 응답의 메일용 요약 데이터 shape |
| `public/mailing-report.html` | 독립적으로 렌더링되지 않는 HTML/Jinja 호환 템플릿 |
| `MailingRegistrationPage` | route에 연결되지 않은 화면 구현 |
| `/api/mailing-registration` | 전체 API gate 뒤에 남아 있는 등록 API |

실제 renderer, scheduler, sender, SMTP/API 연결, retry와 발송 관찰성은 저장소에서 확인되지 않는다.

## 2. 사용자 노출 경계

- 메인 화면과 사용자 메뉴얼에 Mailing을 운영 기능으로 표시하지 않는다.
- `MY EQP 등록` 카드는 Mailing 등록 화면이 아니라 개발예정 안내로 이동한다.
- `/registration`과 `/recipients`도 개발예정 화면이다.
- 잔여 페이지나 API에 직접 접근할 수 있다는 사실을 공식 서비스 제공으로 해석하지 않는다.

## 3. 남아 있는 데이터 계약

`lineDashboard.mailingSummary`는 Dashboard와 같은 집계 원천 및 고유 조합 규칙을 사용한다. 계약은 `harness/contracts/mailing-summary.schema.json`과 `tests/contract/mailing-summary.contract.test.mjs`가 보호한다.

템플릿의 KPI 값은 서버가 계산한 대시보드 값을 그대로 받아야 하며 템플릿에서 재집계하지 않는다. 다만 현재 저장소에는 이 템플릿을 실제 recipient별로 렌더링하고 전송하는 실행 경로가 없다.

## 4. 재도입 조건

Mailing을 사용자 기능으로 다시 제공하려면 최소한 다음을 명시적으로 결정하고 함께 구현한다.

- 사용자 진입 route와 등록 권한
- recipient별 데이터 격리와 개인정보 처리
- renderer의 auto-escaping과 link 생성 규칙
- scheduler·sender·credential 관리
- 중복 발송 방지, retry, audit log와 장애 대응
- 실제 발송이 아닌 안전한 synthetic 대상 검증

MY EQP 또는 HMAC 과거 설계를 자동으로 복원하지 않는다.

## 5. 근거

- `public/mailing-report.html`
- `src/features/fdc-trend/pages/MailingRegistrationPage.jsx`
- `src/features/fdc-trend/routes.jsx`
- `server/mailingRegistration.mjs`
- `server/dashboardData.mjs`
