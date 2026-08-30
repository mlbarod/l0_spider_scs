# L0 Spider SCS 용어 사전

## 1. 상태 용어

| 용어 | 의미 |
|---|---|
| 운영중 | 메인 화면에서 정상 사용자 진입점으로 제공되는 기능 |
| 개발예정 | 메인에서 상태만 안내하고 `/under-construction/:appId`로 이동하는 기능 |
| 호환 route | 메인 진입점과 별도로 직접 접근 가능한 과거·호환 경로 |
| 잔여 구현 | route에 연결되지 않았거나 공식 서비스 범위 밖에 남은 화면·API·template |

## 2. 기능 용어

| UI 명칭 | 코드·데이터 명칭 | 현재 상태 |
|---|---|---|
| Dashboard | `lineDashboard` | 운영중 |
| 자설비 이상감지 | Self Equipment | 운영중 |
| 동일성 이상감지 | commonality | 운영중 |
| 공통부 이상감지 | common anomaly | 개발예정; API 잔여 구현 존재 |
| 공통부 동일성 이상감지 | common commonality | 개발예정; 직접 호환 route 존재 |
| MY EQP 등록 | my-eqp-registration | 개발예정 |
| Mailing | `mailingSummary`, template, registration API | 사용자 발송 기능 미제공 |

## 3. 데이터 용어

| 용어 | 설명 |
|---|---|
| Line | 사용자 화면의 생산 Line; mapping config로 내부 범위와 연결 |
| SDWT | 분임조/팀 선택값 |
| RECIPE_ID | 화면 표시명; 일부 기존 API·원천의 `desc`/`recipe_id`와 호환 |
| Sensor | 분석 신호명 |
| STEP / `chStep` | 공정 STEP 또는 Sensor channel-step 선택값 |
| Grade / `priority` | 이상 등급 필터 |
| `eqpCh` | 자설비 EQP 선택에 쓰이는 기존 query/API 명칭 |
| `latest_date` | 분석 산출물의 최신 기준 시각·directory 이름 |

## 4. 역사 용어

- `step=ALL`: 과거 MY EQP 전체 STEP 흐름에서 사용한 표현으로 현재 지원 계약이 아니다.
- STEP HMAC token: 과거 제안된 링크 서명 설계이며 현재 구현된 통제가 아니다.
- `myeqp_regist`, `/api/my-eqp-*`: 현재 runtime에 없는 MY EQP 등록 자산 명칭이다.

용어 변경 시 실제 route, API parameter, 데이터 column과 [사용자 메뉴얼](../user-manual/USER_MANUAL.md)을 함께 확인한다.
