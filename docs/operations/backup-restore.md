# L0 Spider SCS 백업·복구 기준

## 1. 자산 구분

| 자산 | 기준 복구 원천 | 주의사항 |
|---|---|---|
| 애플리케이션 소스·문서 | Git의 승인 commit | 사용자 변경과 미추적 파일 보존 |
| 의존성 | `package-lock.json` | 대상 Node/npm 호환 확인 |
| build artifact | 승인 소스에서 재생성 또는 보관 artifact | `dist/`와 commit 일치 확인 |
| `/appdata` 분석 파일 | 데이터 pipeline·운영 백업 | 애플리케이션 복구 중 변경 금지 |
| mapping·Sensor 설정 | 운영 설정 백업 | 환경별 파일과 예시 파일 구분 |
| DB 정보·credential | 비밀정보 관리 체계 | 내용 출력·Git 기록 금지 |
| 이력 DB | DB 운영 백업 | 애플리케이션 test 쓰기 금지 |

## 2. 제외된 과거 전제

MY EQP 등록 DB, HMAC key와 mail sender 설정은 현재 서비스의 필수 복구 자산이 아니다. 코드에 남은 `/api/mailing-registration`을 이유로 실제 발송 체계를 복구 범위에 포함하지 않는다.

## 3. 백업 원칙

- RPO, RTO, 보존 기간과 backup owner는 운영 정책으로 확정한다.
- credential과 DB 정보 파일은 일반 source artifact와 분리한다.
- `/appdata`의 대용량 분석 결과는 Git에 넣지 않는다.
- restore 시험은 synthetic 또는 승인된 비운영 위치에서 수행한다.

## 4. 복구 순서

1. incident 범위와 복구 대상·시점을 확정한다.
2. 현재 상태와 사용자 미추적 변경을 보존한다.
3. 승인된 소스·artifact를 복구한다.
4. 환경변수와 비밀정보를 운영 관리 체계에서 주입한다.
5. 필요한 mapping과 선택적 Sensor 설정을 복구한다.
6. `/appdata`와 DB는 각 owner 절차로 복구한다.
7. build, process, listener, 화면과 읽기 API를 순서대로 확인한다.

## 5. 복구 후 검증

- 운영중 네 기능의 route 상태가 맞다.
- Vite와 통합 서버의 API handler 범위가 일치한다.
- Dashboard·자설비·동일성 read가 정상이다.
- 필요한 DB 이력 기능만 readiness를 통과한다.
- Sensor 실제 파일이 없으면 빈 규칙 fallback을 승인한다.
- 로그와 오류 응답에 secret·내부 경로가 노출되지 않는다.

배포·rollback은 [배포 기준](../system/deployment.md)을 따른다.
