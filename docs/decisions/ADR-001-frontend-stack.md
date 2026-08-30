# ADR-001: 프론트엔드 기술 스택 기준선

## 상태

Accepted — 2026-08-30 현재 코드 기준으로 현행화했다.

## 컨텍스트

L0 Spider SCS는 React 단일 페이지 애플리케이션이다. 개발 서버와 통합 서버가 서로 다른 기능 범위를 제공한다는 과거 설명은 현재 코드와 맞지 않는다.

## 결정

- 화면은 React 19와 React Router 7을 유지한다.
- 개발·빌드는 Vite 6을 사용한다.
- 서버 상태 조회와 캐시는 TanStack Query를 사용한다.
- 공통 UI는 `src/components/ui/`의 Radix UI·Tailwind CSS 기반 컴포넌트를 우선 재사용한다.
- 차트는 화면 목적에 따라 Recharts와 Plotly를 사용한다.
- `npm run dev`의 Vite middleware와 `node server.mjs`는 같은 20개 API 경로를 등록한다. 개발 서버를 제한된 mock API로 분류하지 않는다.

## 현재 화면 범위

| 상태 | 기능 | 기본 진입 경로 |
|---|---|---|
| 운영중 | Dashboard | `/` |
| 운영중 | 자설비 이상감지 | `/self-equipment` |
| 운영중 | 동일성 이상감지 | `/matching-anomaly` |
| 운영중 | 사용자 메뉴얼 | `/manual` |
| 개발예정 | 공통부 이상감지, 공통부 동일성, MY EQP 등록, Hard Limit, Defect/L1/L3 | `/under-construction/:appId` |

`/common-commonality-anomaly`와 Defect/L1/L3 직접 route 등 일부 구현은 남아 있지만 메인 서비스가 제공하는 운영 기능으로 보지 않는다. `MailingRegistrationPage`도 route에 연결되어 있지 않다.

## 결과

- 프론트엔드 스택이나 route를 교체하는 변경은 별도 ADR과 회귀 검증이 필요하다.
- 개발 서버와 통합 서버 중 하나에 API를 추가하거나 제거하면 다른 쪽도 함께 갱신해야 한다.
- 연결되지 않은 컴포넌트의 존재만으로 사용자 제공 기능이라고 문서화하지 않는다.

## 근거

- `package.json`
- `vite.config.mjs`
- `server.mjs`
- `src/features/fdc-trend/routes.jsx`
- `src/features/fdc-trend/pages/L0SpiderHomePage.jsx`
