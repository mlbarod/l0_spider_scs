# L0 Spider SCS 시스템 개요

## 1. 목적

L0 Spider SCS는 SCS ETCH 분석 결과를 Dashboard와 이상감지 화면에서 조회하는 운영 웹서비스다. 브라우저가 Node 기반 API를 호출하고, 서버가 `/appdata`의 Parquet·이미지와 필요한 이력 DB를 읽는다.

## 2. 사용자 기능 기준선

| 상태 | 기능 | 기본 경로 |
|---|---|---|
| 운영중 | Dashboard | `/` |
| 운영중 | 자설비 이상감지 | `/self-equipment` |
| 운영중 | 동일성 이상감지 | `/matching-anomaly` |
| 운영중 | 사용자 메뉴얼 | `/manual` |
| 개발예정 | 공통부 이상감지 | `/under-construction/common-anomaly` |
| 개발예정 | 공통부 동일성 이상감지 | `/under-construction/common-commonality` |
| 개발예정 | MY EQP 등록 | `/under-construction/my-eqp-registration` |
| 개발예정 | FDC Hard Limit, Defect/L1/L3 | 각 `/under-construction/:appId` |

## 3. 호환·잔여 구현 경계

- `/common-commonality-anomaly`는 직접 접속 가능한 호환 화면이지만 메인에서는 개발예정으로 안내한다.
- `/defect-spider`, `/l1-spider`, `/l3-spider`는 mock data 기반 화면이 남아 있지만 공식 운영 기능이 아니다.
- `CommonAnomalyPage`, `MailingRegistrationPage` 등 route에 연결되지 않거나 기본 진입점과 다른 구현이 있다.
- 공통부 API와 `/api/mailing-registration`이 서버에 남아 있어도 사용자 기능 제공을 뜻하지 않는다.
- MY EQP API·helper, 메일 renderer·scheduler·sender, HMAC 생성·검증은 현재 구현에서 확인되지 않는다.

## 4. 주요 구성

- Frontend: React, React Router, TanStack Query, Tailwind CSS, Radix UI, Recharts·Plotly
- Development: Vite middleware와 동일 API handler
- Integrated server: `server.mjs`, Vite live reload 또는 `dist/` 정적 제공
- Data: `/appdata/abnormal_trend/pic` 분석 파일과 mapping JSON
- DB: 현재 사용자 및 SKIP·HIT·click 이력

## 5. 실행 모드

- `npm run dev`: Vite 개발 서버와 20개 API 경로
- `npm start` 또는 `npm run preview`: `server.mjs`; 기본은 live reload
- `LIVE_RELOAD=0 npm start`: 필요하면 build 후 `dist/` 정적 제공

두 서버 모드는 동일한 handler 범위를 등록한다. 실제 호출 가능 여부는 데이터 연결 gate와 파일·DB readiness가 결정한다.

## 6. 관련 문서

- [아키텍처](architecture.md)
- [데이터 흐름](data-flow.md)
- [환경 정의](environment-definition.md)
- [사용자 메뉴얼](../user-manual/USER_MANUAL.md)
- [운영 Runbook](../operations/runbook.md)
