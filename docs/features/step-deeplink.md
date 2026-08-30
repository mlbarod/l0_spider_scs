# L0 Spider 자설비 직접 진입 query 기준

## 1. 현재 범위

`/self-equipment` URL의 query parameter는 기존 링크에서 자설비 화면의 초기 필터를 선택하는 호환 입력이다. 현재 저장소에는 이 URL을 생성하는 메일 sender나 HMAC 생성·검증 구현이 없다.

과거 `step=ALL`, MY EQP 전체 설비 조회, `eqpCh`를 HMAC으로 보호한 Mailing 링크 설명은 현재 기능 계약이 아니다.

## 2. 처리 원칙

- query는 화면이 지원하는 일반 자설비 필터로만 해석한다.
- 지원하지 않거나 데이터와 일치하지 않는 값은 권한 부여 수단으로 사용하지 않는다.
- query가 없으면 일반 화면 기본값으로 시작한다.
- 입력값은 API에서 다시 검증하며 파일 경로나 DB 권한을 직접 결정하지 않는다.
- URL에 credential, HMAC secret 또는 개인정보를 넣지 않는다.

정확한 parameter alias와 초기 상태 결정은 `src/features/fdc-trend/utils/selfEquipmentUrlFilters.mjs` 및 관련 integration test를 기준으로 한다.

## 3. HMAC 상태

HMAC은 구현된 통제가 아니다. `tests/unit/step-hmac.test.mjs`라는 이름이나 과거 ADR이 실제 서명 생산자·검증자의 존재를 보장하지 않는다. 운영 환경에 `STEP_HMAC_KEY`가 필요하다고 문서화하거나 readiness 실패 조건으로 사용하지 않는다.

향후 서명 링크를 도입하려면 다음을 새 계약으로 정의한다.

- 서명 생산자와 검증자
- canonical query와 encoding 규칙
- 만료·재사용·key 회전
- 비서명 기존 링크의 호환 정책
- 오류 응답과 로그 마스킹

## 4. 실패 처리

- 잘못된 query로 화면 전체가 중단되지 않아야 한다.
- 매핑되지 않는 값은 빈 결과 또는 사용 가능한 기본 선택으로 처리한다.
- 서버 오류와 정상 빈 결과를 구분한다.
- 원본 URL을 로그에 남길 때 민감한 값이 추가되지 않았는지 확인한다.

## 5. 근거

- `src/features/fdc-trend/utils/selfEquipmentUrlFilters.mjs`
- `src/features/fdc-trend/pages/FdcTrendPage.jsx`
- `tests/integration/step-deeplink.test.mjs`
- [과거 HMAC ADR](../decisions/ADR-003-step-hmac-token.md)
- [자설비 기능](self-equipment.md)
