# ADR-003: 과거 STEP HMAC token 제안 기록

## 상태

Superseded — 현재 runtime 계약이 아닌 역사 기록이다.

## 배경

이 ADR은 과거 MY EQP 메일 링크가 `step=ALL`, `eqpCh`, HMAC token을 사용한다는 전제에서 작성되었다. 현재 저장소에는 MY EQP API·helper·메일 renderer·sender와 HMAC 생성·검증 구현이 없다. 따라서 이 설계를 현재 기능이나 보안 통제로 설명할 수 없다.

## 현재 결정

- `/self-equipment`의 일반 query 호환은 유지하되 HMAC 보호를 제공한다고 주장하지 않는다.
- `step=ALL`, MY EQP 조회, MY EQP Mailing Report는 현재 지원 기능이 아니다.
- `STEP_HMAC_KEY` 같은 비밀키를 현재 필수 환경변수 또는 readiness 조건으로 두지 않는다.
- HMAC이 다시 필요해지면 생산자·검증자·canonicalization·만료·회전·오류 계약을 새 ADR로 결정하고 구현과 테스트를 함께 추가한다.

## 보존 이유

URL에 서명을 추가할 경우 다음 항목을 빠뜨리지 않기 위한 역사적 설계 참고 자료로만 남긴다.

- 서명 대상 query의 정확한 목록과 정렬 규칙
- URL encoding 전후 중 어느 값을 서명하는지
- 만료와 재사용 방지 정책
- secret 저장·회전·로그 마스킹
- 기존 비서명 링크의 전환과 호환 기간

이 목록은 구현 완료를 뜻하지 않는다.

## 근거

- [STEP 직접 진입](../features/step-deeplink.md)
- [보안 기준](../system/security.md)
- [ADR-004](ADR-004-scs-my-eqp-scope.md)
- `tests/unit/step-hmac.test.mjs`
- `tests/integration/step-deeplink.test.mjs`
