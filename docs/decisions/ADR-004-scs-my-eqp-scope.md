# ADR-004: SCS MY EQP 기능 범위

## 상태

Accepted — 2026-08-30 현재 사용자 노출 상태를 반영한다.

## 결정

- MY EQP 등록·조회·메일 발송은 현재 운영 기능이 아니다.
- 메인 화면의 `MY EQP 등록` 카드는 `개발예정` 상태로 노출하며 `/under-construction/my-eqp-registration`으로 이동한다.
- `/registration`과 `/recipients`도 호환을 위해 같은 개발예정 화면을 표시한다.
- 과거 `/api/my-eqp-*`, `myeqp_regist`, `my_eqp_registration.py`, `step=ALL` MY EQP 흐름은 현재 계약에서 제외한다.
- `MailingRegistrationPage`와 `/api/mailing-registration`처럼 코드에 남은 구현은 공식 사용자 진입점이 아니다. 존재 자체를 MY EQP 제공 근거로 사용하지 않는다.

## 호환성 원칙

개발예정 카드와 호환 route를 제거하려면 별도의 사용자 영향 검토가 필요하다. 기능을 다시 제공할 때는 route, API, 데이터 저장, 권한, 운영 절차, 테스트를 하나의 명시적 변경으로 정의한다.

## 검증

- `src/features/fdc-trend/pages/L0SpiderHomePage.jsx`
- `src/features/fdc-trend/routes.jsx`
- `src/features/fdc-trend/utils/underConstructionApps.mjs`
- [사용자 메뉴얼](../user-manual/USER_MANUAL.md)
