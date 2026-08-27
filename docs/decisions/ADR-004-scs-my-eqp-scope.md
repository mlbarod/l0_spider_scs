# ADR-004: SCS My EQP 기능 제외

- 상태: Accepted
- 결정일: 2026-08-27

## 결정

`l0_spider_scs`는 My EQP 기능을 제공하지 않는다.

- 메인 메뉴와 등록 화면에서 My EQP를 노출하지 않는다.
- 자설비 SDWT 선택 목록에 My EQP 가상 항목을 만들지 않는다.
- `/my-eqp` route와 `/api/my-eqp-*` API를 제공하지 않는다.
- `myeqp_regist`, My EQP 기준정보 helper와 My EQP 메일 Report를 사용하지 않는다.
- `/registration`과 `/recipients`는 Mailing 등록 화면만 제공한다.
- SKIP, HIT, 클릭이력과 이력저장은 기존 접속 IP 식별 구조를 유지한다.

기존 문서의 My EQP 분석은 제거 전 구조의 역사적 기록이며 현재 런타임 계약이 아니다.

## 검증

`tests/unit/no-my-eqp-runtime.test.mjs`가 주요 런타임 진입점에 My EQP 메뉴·route·API·report가
다시 추가되지 않는지 확인한다.
