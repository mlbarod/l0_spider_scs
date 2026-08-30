# L0 Spider SCS 시스템 아키텍처

## 1. 구조

```text
Browser
  └─ React SPA
       └─ /api/*
            ├─ Vite middleware (`npm run dev`)
            └─ integrated Node server (`server.mjs`)
                 ├─ Parquet·JSON·image under /appdata
                 └─ DB history helpers (readiness gate 적용)
```

Vite와 통합 서버는 동일한 handler를 import해 20개 API 경로를 등록한다. 정적 자산 제공 방식만 실행 모드에 따라 다르다.

## 2. 프론트엔드와 route

`src/features/fdc-trend/routes.jsx`가 root와 `/fdc_trend` alias의 자식 route를 정의한다. 메인 화면의 `운영중`·`개발예정` 상태가 공식 사용자 기능 범위의 기준이다. 직접 route나 컴포넌트가 남아 있다는 이유만으로 운영 기능으로 분류하지 않는다.

## 3. API 인벤토리

| 영역 | 경로 |
|---|---|
| Dashboard | `/api/dashboard-data`, `/api/dashboard-stats`, `/api/dashboard-latest-date` |
| 사용자·이력 | `/api/current-user`, `/api/hit-history`, `/api/clicked-category-history`, `/api/pass-history` |
| 자설비·매핑 | `/api/mapping-config`, `/api/self-equipment-data`, `/api/erd-scatter-data`, `/api/erd-file` |
| 동일성 | `/api/latest-commonality-path`, `/api/commonality-data`, `/api/commonality-image` |
| 공통부 잔여 구현 | `/api/common-anomaly-data`, `/api/common-anomaly-scatter-data`, `/api/common-anomaly-image`, `/api/common-commonality-data`, `/api/common-commonality-image` |
| Mailing 잔여 구현 | `/api/mailing-registration` |

등록 여부와 호출 허용 여부는 다르다. `server/dataConnections.mjs`가 method와 환경별 gate를 적용하며, 일부 잔여 API와 file stream은 전체 gate 없이는 차단될 수 있다.

## 4. 데이터 접근

- Dashboard: stats와 날짜별 상세 Parquet
- 자설비: `path_xian` index, chart Parquet, 이미지·변경점 파일
- 동일성: `path_erd_commonality_xian` index와 `erd_commonality` 이미지
- 공통부 잔여 구현: `path_common`, `common`, `path_common_commonality`
- 공통 설정: mapping JSON, 선택적 Sensor 제외 JSON
- DB: `pass_history`, `hit_history`, `clicked_category_history` 등 현재 이력 helper

서버는 운영 분석 파일의 소비자다. 조회 중 운영 파일을 생성하거나 수정하지 않는다.

## 5. 신뢰 경계

- Browser 입력은 신뢰하지 않고 API에서 다시 검증한다.
- 파일 query는 허용 root와 정규화 검사를 통과해야 한다.
- DB 연결은 `DB_INFO_PATH` 파일의 가독성과 gate를 확인한다.
- 오류 응답은 안전한 shape를 사용하고 경로·stack·credential을 노출하지 않는다.
- HMAC과 실제 메일 발송은 현재 신뢰 경계의 구현된 통제가 아니다.

## 6. 변경 규칙

- Vite와 `server.mjs`의 API 목록은 함께 변경한다.
- route 상태, 메인 카드와 사용자 메뉴얼을 일치시킨다.
- 경로·Schema·집계 변경 시 직접 관련 contract와 기능 테스트를 갱신한다.
- 호환 route와 잔여 API 제거는 기존 사용 여부를 확인한 별도 변경으로 수행한다.
