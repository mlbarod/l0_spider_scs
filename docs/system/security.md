# L0 Spider SCS 시스템 보안 기준

## 1. 보호 대상

- `/appdata`의 분석 결과와 내부 파일 경로
- DB 연결 정보와 사용자·이력 데이터
- 환경변수, token, credential
- 사용자 식별값과 조회·SKIP·HIT·click 이력
- 서비스 가용성과 API·데이터 계약

## 2. 신뢰 경계

Browser query와 request body는 신뢰하지 않는다. Node handler가 method, 기능 gate, 값 형식과 path root를 검증한 뒤 파일 또는 DB에 접근한다.

## 3. API와 오류

- 허용되지 않은 API·method는 `blockDisabledDataRequest`에서 차단한다.
- DB API는 읽을 수 있는 `DB_INFO_PATH`와 DB gate가 필요하다.
- file endpoint는 허용 root 밖의 경로와 traversal을 거부해야 한다.
- 오류 응답에는 stack, 실제 credential, DB 세부정보와 불필요한 내부 경로를 포함하지 않는다.
- 운영 로그에도 secret과 실제 `.env` 값을 출력하지 않는다.

## 4. 파일과 운영 데이터

- `/appdata`는 읽기 원천으로 취급한다.
- 테스트 파일을 운영 경로에 만들지 않는다.
- 누락 파일을 조회 코드가 임의 생성·이동·덮어쓰기하지 않는다.
- 파일과 directory 권한은 service 실행 사용자에게 필요한 최소 읽기 권한만 부여한다.

## 5. DB와 개인정보

- DB credential은 `DB_INFO_PATH` 같은 운영 관리 자산으로 주입하고 Git에 기록하지 않는다.
- 현재 DB 사용 범위는 사용자 식별과 SKIP·HIT·click 이력이다.
- MY EQP 등록 DB를 현재 기능 또는 필수 보안 surface로 간주하지 않는다.
- 이력 변경 API의 사용자 식별·입력 검증과 최소 권한을 보존한다.

## 6. HMAC과 직접 링크

현재 `/self-equipment` query에는 HMAC 생성·검증이 구현되어 있지 않다. 과거 ADR과 test 이름을 구현된 무결성 통제로 해석하지 않는다. `STEP_HMAC_KEY`도 현재 필수 secret이 아니다.

서명 링크를 도입할 때는 생산자·검증자, 만료, canonicalization, key 회전, 로그 마스킹을 구현과 함께 결정한다.

## 7. Mailing 잔여 구현

HTML template과 등록 API가 남아 있지만 실제 renderer·sender는 확인되지 않는다. 재도입 시 recipient 간 데이터 격리, HTML auto-escaping, link 검증, sender credential, 중복 발송 방지와 audit log가 필요하다. 테스트에는 실제 운영 수신자를 사용하지 않는다.

## 8. 프론트엔드

- 사용자 메뉴얼 Markdown은 sanitize된 HTML로 렌더링하는 현재 경계를 유지한다.
- URL query와 서버 응답을 `dangerouslySetInnerHTML` 등에 직접 삽입하지 않는다.
- 개발예정 기능과 잔여 route를 운영 기능으로 오인시키지 않는다.

## 9. 변경 시 검증

인증·권한, path 처리, DB 쓰기, 공개 API 오류 shape 또는 mail 발송 경계를 바꾸면 관련 보안·contract test와 독립 검토 필요성을 평가한다.
