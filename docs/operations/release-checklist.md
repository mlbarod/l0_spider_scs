# L0 Spider SCS 릴리스 체크리스트

## 1. 범위와 변경 확인

- [ ] 사용자 요청과 직접 관련된 변경만 포함했다.
- [ ] 기존 route, 사용자 동작, API와 데이터 호환성을 검토했다.
- [ ] 사용자 변경·미추적 파일을 덮어쓰거나 되돌리지 않았다.
- [ ] 운영중·개발예정·호환 route·잔여 구현을 구분했다.

## 2. 문서와 계약

- [ ] 변경된 화면·API·데이터의 관련 문서만 갱신했다.
- [ ] Dashboard Schema·fixture·contract 변경 필요성을 확인했다.
- [ ] Vite와 `server.mjs`의 API 목록이 일치한다.
- [ ] MY EQP·HMAC·Mailing을 현재 제공 기능으로 잘못 기술하지 않았다.
- [ ] `self-equipment.md`의 `13.1 Data References`를 보존했다.

## 3. 환경과 데이터

- [ ] 필요한 `/appdata` root와 mapping 파일을 읽기 전용으로 확인할 계획이 있다.
- [ ] `DB_INFO_PATH`와 gate를 확인하되 credential을 출력하지 않았다.
- [ ] Sensor 제외가 필요하면 후보 파일을 validate했다.
- [ ] `config/sensor-exclusions.json`이 없을 때 빈 규칙 fallback임을 확인했다.
- [ ] 운영 DB 쓰기·DDL, `/appdata` 변경, 실제 메일 발송을 수행하지 않았다.

## 4. 검증

- [ ] 변경 범위에 가장 가까운 unit·integration·contract test를 실행했다.
- [ ] 필요한 경우 `npm run build`를 실행했다.
- [ ] 문서의 상대 링크와 참조 파일 존재를 확인했다.
- [ ] `git diff --check`를 실행했다.
- [ ] 실행하지 못한 중요한 검증과 이유를 기록했다.

## 5. 배포 준비

- [ ] 실제 application root, service/unit, host·port와 owner를 확인했다.
- [ ] `LIVE_RELOAD`, `BUILD_ON_START`와 `dist/` 준비 상태가 일치한다.
- [ ] 변경된 환경변수와 설정의 rollback 방법이 있다.
- [ ] 운영 데이터·DB는 애플리케이션 artifact와 분리했다.
- [ ] secret·token·실제 `.env` 값이 diff와 로그에 없다.

## 6. 배포 후 확인

- [ ] process·listener·정적 화면이 정상이다.
- [ ] Dashboard, 자설비, 동일성과 사용자 메뉴얼에 진입할 수 있다.
- [ ] 개발예정 카드는 `/under-construction/:appId`로 이동한다.
- [ ] 필요한 API read와 DB 이력 기능만 정상임을 확인했다.
- [ ] 오류율, restart loop와 민감정보 노출이 없다.

## 7. 중단·Rollback 조건

다음 중 하나면 추가 반영을 중단하고 승인된 rollback 또는 owner escalation을 수행한다.

- 운영중 route 또는 기존 API 계약 회귀
- 데이터 경로·Schema의 의도하지 않은 변경
- `/appdata` 또는 운영 DB 변경 위험
- secret·개인정보 노출
- 반복 restart, 전체 접속 불가 또는 안전하지 않은 오류 응답

상세 절차는 [배포 기준](../system/deployment.md), [Runbook](runbook.md), [백업·복구](backup-restore.md)를 따른다.
