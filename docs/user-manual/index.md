# L0 Spider SCS 사용자 메뉴얼 인덱스

## 1. 현재 사용자 문서

| 사용자 작업 | 안내 | 화면 경로 |
|---|---|---|
| 첫 접속·언어·메인 화면 | [시작하기](USER_MANUAL.ko.md#1-시작하기) | `/` |
| 필터·검색·ALL 공통 조작 | [공통 조작](USER_MANUAL.ko.md#2-공통-조작) | 각 조회 화면 |
| Line별 현황 조회 | [라인별 이상감지 대시보드](USER_MANUAL.ko.md#3-라인별-이상감지-대시보드) | `/` |
| 설비별 차트·SKIP | [설비별 SPEC내 이상감지](USER_MANUAL.ko.md#4-설비별-spec내-이상감지) | `/self-equipment` |
| 동일성 그래프 조회 | [동일성 이상감지](USER_MANUAL.ko.md#5-동일성-이상감지) | `/matching-anomaly` |
| Defect 차트 조회 | [Defect SPIDER 사용법](USER_MANUAL.ko.md#6-defect-spider-사용법) | `/defect-spider` |
| 저장한 차트 확인 | [이력저장 게시판](USER_MANUAL.ko.md#7-이력저장-게시판) | `/history` |
| 집중 모니터링 설비 등록 | [MY EQP 등록](USER_MANUAL.ko.md#8-my-eqp-등록) | `/registration` |
| 오류 대응 | [문제 해결](USER_MANUAL.ko.md#9-문제-해결) | 현재 화면 |

영문 `USER_MANUAL.md`, 중문 `USER_MANUAL.zh-CN.md`는 같은 장 구성을 유지한다.

## 2. Route 상태

- 운영중: `/`, `/self-equipment`, `/matching-anomaly`, `/defect-spider`, `/history`, `/registration`, `/manual`
- `/recipients`는 `/registration`과 같은 MY EQP 등록 화면을 표시한다.
- 호환·잔여 경로: `/common-anomaly`, `/common-commonality-anomaly`, `/l1-spider`, `/l3-spider`, `/under-construction/:appId`는 메인 카드에 노출되지 않으며 사용자 매뉴얼 대상이 아니다.

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
