# L0 Spider SCS 사용자 메뉴얼 인덱스

## 1. 현재 사용자 문서

| 사용자 작업 | 안내 | 화면 경로 | 기능 기준 |
|---|---|---|---|
| Dashboard 조회 | [Dashboard 사용법](USER_MANUAL.md#2-dashboard-사용법) | `/` | [dashboard.md](../features/dashboard.md) |
| 자설비 조회·차트·SKIP | [자설비 이상감지](USER_MANUAL.md#3-자설비-이상감지) | `/self-equipment` | [self-equipment.md](../features/self-equipment.md) |
| 동일성 그래프 조회 | [동일성 이상감지](USER_MANUAL.md#4-동일성-이상감지) | `/matching-anomaly` | [abnormal-data.md](../features/abnormal-data.md) |
| 개발예정 상태 확인 | [개발예정 기능](USER_MANUAL.md#5-개발예정-기능) | `/under-construction/:appId` | [시스템 개요](../system/overview.md) |
| 오류 대응 | [문제 해결](USER_MANUAL.md#6-문제-해결과-주의사항) | 현재 화면 | [troubleshooting.md](../operations/troubleshooting.md) |

## 2. Route 상태

- 운영중: `/`, `/self-equipment`, `/matching-anomaly`, `/manual`
- 개발예정: 메인 카드가 연결하는 `/under-construction/:appId`
- 호환·잔여 경로: `/common-commonality-anomaly`, `/defect-spider`, `/l1-spider`, `/l3-spider` 등은 직접 접근 가능 여부와 관계없이 공식 사용자 기능이 아니다.
- `/registration`, `/recipients`는 MY EQP 개발예정 화면을 표시한다.

## 3. 이미지 자산 상태

`docs/user-manual/images/`의 기존 PNG 11개는 과거 화면을 담고 있어 현재 메뉴얼 본문에서 사용하지 않는다. 특히 다음 차이가 확인되었다.

- `01-main-screen.png`: 개발예정 기능을 운영중으로 표시한 과거 메인
- `03`, `04`: 현재 RECIPE_ID, 동일성 toggle, 모아보기 UI 미반영
- `08`: 현재 동일성 화면의 STEP 필터 미반영
- `09`, `10`: 현재 기본 서비스에서 제공하지 않는 공통부 화면
- `15`: 문서 기준일이 오래됨

현재 UI 기준으로 screenshot generator가 정비되고 이미지가 다시 생성되기 전에는 이 파일을 사용자 절차의 근거로 사용하지 않는다.

## 4. 유지보수 기준

- 메인 카드의 상태, `routes.jsx`와 사용자 메뉴얼을 함께 확인한다.
- 화면 label이나 순서가 바뀌면 관련 절만 수정한다.
- 운영중과 개발예정, 호환 route, 연결되지 않은 구현을 구분한다.
- 이미지를 다시 사용할 때는 현재 화면에서 생성했는지와 본문 참조 여부를 함께 확인한다.
- 용어는 [용어 사전](../system/glossary.md)을 따른다.
