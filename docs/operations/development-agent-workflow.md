# L0 Spider 개발 에이전트 최종 검수 workflow

> 문서 목적: 구현 중간의 반복 검수를 없애고, 안정된 최종 diff에 대한 단 한 번의 독립 검수 기준을 관리한다.<br>
> 문서 상태: `Active`<br>
> 기준 branch: `main`<br>
> 정책 개정일: 2026-08-26<br>
> 적용 상태: 최종 검수 1회 상한은 `Implemented`; `specialist-validator` 자동·수동 호출은 `Disabled`

## 1. 개정 배경

2026-08-26 자설비 이상감지 App 연결 업무는 구현 요청부터 완료 보고까지 약 1시간 30분 45초가 걸렸다. 기록상 사전 검토는 11회, Security·Operations 전문 검토는 2회 호출됐고 검토 프로세스 실행 시간만 약 42분 34초였다. 첫 검토 시점부터 마지막 전문 검토까지는 약 1시간 18분이었다.

중복 SDWT 권한 범위와 exact `backup` root 처리 결함은 실제 수정 가치가 있었다. 다만 아래 진행은 불필요한 반복으로 판단한다.

- 쓰기 가능한 권한으로 검토를 호출해 내용 검토 없이 `Blocked`가 발생한 호출
- 안정된 최종 diff 전에 검토를 시작하고 수정할 때마다 전체 diff를 다시 검토한 호출
- README, 사용자 매뉴얼, data-flow, glossary 등의 연관 불일치를 한 번에 모으지 않고 여러 번에 나눠 보고한 검토
- 이미 `PASS`한 뒤 비차단 문서를 수정하고 독립 검토를 다시 실행한 호출
- 직접 영향 변경 없이 같은 focused test를 반복 실행한 호출

이 회고에 따라 기존의 상시 pre-build gate와 조건부 전문 검증 정책을 중단한다. 이 문서가 이전 도입 계획·시범 리포트보다 현재 실행 절차에 우선한다.

## 2. 현재 정책

### 2.1 최종 diff 확정 전

메인 개발 에이전트가 아래 업무를 모두 수행한다.

1. 요구사항과 영향 경로를 조사한다.
2. 코드, 계약, test와 필요한 문서를 일괄 구현한다.
3. 직접 영향받는 기준 문서를 한 번에 검색해 stale 표현과 계약 불일치를 정리한다.
4. 확인된 focused test, lint, build, unit·contract와 가능한 실행·차트 확인을 수행한다.
5. 실행할 수 없는 운영 자원은 재시도하지 않고 `Not Run`, `Partial`, `Blocked` 또는 `Unknown`으로 분리한다.
6. `git diff --check`와 변경 범위를 확인한 뒤 편집을 중단하고 최종 diff를 확정한다.

이 단계에서는 `pre-build-review`와 `specialist-validator`를 호출하지 않는다.

### 2.2 최종 독립 검수

- 최종 독립 검수는 업무당 최대 1회다.
- 검수 전에 원 요구사항, 승인 범위, branch·commit, 안정된 diff, 메인 검증 결과와 `Not Run`을 함께 제공한다.
- 검수자는 읽기 전용으로 전체 diff와 직접 영향 경로를 끝까지 본 후 모든 발견 사항을 한 번의 보고서에 모은다.
- 첫 번째 `BLOCKER`에서 조기 종료하거나, 문서별 발견 사항을 나눠 후속 호출로 넘기지 않는다.
- 실제 읽기 전용 권한을 확인할 수 없거나 환경이 준비되지 않으면 `Not Run` 또는 `Blocked`로 종료한다. 권한 설정을 바꾸거나 다른 agent·CLI로 자동 재시도하지 않는다.
- 검수 호출 후에는 비차단 문서 정리를 위해 diff를 다시 변경하지 않는다.

### 2.3 검수 결과 처리

| 결과 | 처리 |
|---|---|
| `PASS` | 비차단 `WARNING`과 잔여 `Unknown`을 기록하고 완료 보고로 이동 |
| `BLOCKER` | 발견 사항 전체를 메인 에이전트가 일괄 수정하고 focused 검증 수행 |
| `Not Run` / `Blocked` | 재호출 없이 사유와 미검수 상태를 최종 보고 |

`BLOCKER` 수정 후에는 자동 독립 재검수를 실행하지 않는다. 메인 에이전트는 수정한 항목과 실행한 검증을 보고하고, 독립 `PASS`가 수정 후 diff에 유효하다고 주장하지 않는다. 사용자가 후속 검수를 새 업무로 명시적으로 요청한 경우만 별도로 수행한다.

## 3. 전문 검수 금지

`specialist-validator`는 자동·수동 모두 호출하지 않는다. 다음 조건도 호출 근거가 되지 않는다.

- 공유 API·Schema·집계 변경
- 보안·운영 경계 변경
- cross-layer 공통 모듈 변경
- browser·비동기·성능·메모리 확인 필요
- 최종 검수의 전문 검수 권장 또는 `SPECIALIST_REQUIRED`

위험이 남으면 메인 에이전트가 허용된 비파괴적 확인을 수행하고 `Unknown`, `Partial`, `Blocked` 또는 사용자 확인 필요 상태로 보고한다. 전문 agent 호출을 우회해 일반 agent나 별도 Codex CLI에 동일한 전문 검수를 요청하지 않는다.

## 4. 실행 상한

- 독립 검수 agent: 업무당 최대 1회
- 전문 검수 agent: 0회
- 권한·환경 실패 후 자동 재시도: 0회
- 수정 후 독립 재검수: 0회
- 같은 목적의 focused test: 직접 영향 변경 후 1회만 재실행
- browser·운영 자원 확인: 실패 원인 진단 후 1회만 재시도하고 다시 실패하면 `Not Run` 또는 `Blocked`로 종료

상한에 도달하면 다른 agent, CLI, sandbox 변경 또는 호출 방식을 바꿔 우회하지 않는다. 현재 결과와 남은 제약을 보고하고 업무를 종료한다.

## 5. 최종 검수자 범위와 출력

최종 검수자는 다음만 정적으로 확인한다.

- 원 요구사항 누락과 범위 밖 변경
- 기존 사용자 동작과 API·데이터 계약 회귀
- 비밀정보·운영 자원·`main`·`mock-agent` 경계 위반
- 필요한 test, Schema, fixture와 기준 문서 누락
- 메인 에이전트가 제공한 검증 결과와 미실행 상태의 과장 여부

출력은 다음으로 제한한다.

1. `Gate`: `PASS` 또는 `BLOCKER`
2. 검수 범위와 branch·commit·diff
3. 모든 발견 사항의 ID, 심각도, 근거 상태, 영향, 파일·행 근거와 권장 조치
4. 비차단 `WARNING`, `Unknown`, `Not Run`과 제약
5. 호출 전후 workspace 무변경 확인

`SPECIALIST_REQUIRED`는 현재 gate로 사용하지 않는다. 정적 범위에서 판단할 수 없는 항목은 `Unknown`과 영향을 기록한다.

## 6. 운영·branch 경계

- `main`에서는 운영 자원에 의존하지 않는 확인만 수행한다.
- mock server·data·DB, Playwright Browser QA와 mock 성능 측정은 `mock-agent` 범위다.
- 검수에 운영 DB, `/appdata`, 실제 mail·recipient, 실제 secret, 내부 주소, 운영 service와 network를 사용하지 않는다.
- 검수자는 commit, push, merge, rebase, branch 전환과 사용자 변경 되돌리기를 수행하지 않는다.
- 실제 수정과 검증은 메인 에이전트가 수행한다.

## 7. 관련 문서

- [프로젝트 지침](../../AGENTS.md)
- [시스템 개요](../system/overview.md)
- [릴리스 체크리스트](release-checklist.md)
- [개발 검증 서브에이전트 도입 계획](../../reports/development-validation-subagent-adoption-plan.md) — 과거 도입 기록
- [개발 검증 서브에이전트 도입 리포트](../../reports/development-validation-subagent-workflow.md) — 과거 시범 기록
