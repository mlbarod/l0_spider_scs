# ADR-004: SCS MY EQP 기능 범위

## 상태

Updated — 2026-10-16 사용자 요청에 따라 MY EQP 등록·조회 기능을 제공한다.

## 결정

- `l0_spider`의 MY EQP 등록·설비 조회 흐름을 SCS에 이식한다.
- 홈의 MY EQP 등록 카드는 운영 기능으로 전환하고 `/registration`, `/recipients`에 등록 화면을 연결한다. 과거 개발예정 URL도 등록 화면으로 연결한다.
- `/api/my-eqp-reference`, `/api/my-eqp-registration`, `/api/my-eqp-equipment-data`와 `myeqp_regist`를 현재 계약에 포함한다.
- SCS의 IP 기반 사용자 식별, PRC Group 기반 자설비 조회, 경로·SKIP·Sensor 제외 계약은 유지한다.
- 기존 원본의 자동 ALTER TABLE은 이식하지 않는다. 관리자가 준비 SQL을 검토·적용한다.
- 메일 발송·예약 작업·HMAC 기반 과거 링크 설계는 이번 변경에 포함하지 않는다.

세부 사용자 동작·API·DB 준비는 [MY EQP](../features/my-eqp.md)를 따른다.
