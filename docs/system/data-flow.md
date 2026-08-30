# L0 Spider SCS 데이터 흐름 및 화면-데이터 추적성

## 1. 공통 흐름

```text
사용자 선택 → React state/query → /api 요청 → data gate
  → Parquet·JSON·image 또는 DB helper → 정규화·집계 → JSON/image 응답 → 화면
```

## 2. 현재 운영 흐름

| Flow ID | 화면 | API | 주요 원천 |
|---|---|---|---|
| `DF-DASH-01` | Dashboard | `/api/dashboard-data`, `/api/dashboard-stats`, `/api/dashboard-latest-date` | `stats/{latest_date}_spider_step_stats.parquets`, `path/{latest_date}` |
| `DF-SELF-01` | 자설비 목록 | `/api/mapping-config`, `/api/self-equipment-data` | `mapping_config.json`, `path_xian/{line}/{sdwt}/df_path.parquet` |
| `DF-SELF-02` | 자설비 chart | `/api/erd-scatter-data`, `/api/erd-file` | 선택 경로의 `data.parquet`, image, `{eqp}.parquet` |
| `DF-SELF-03` | 자설비 이력 | `/api/current-user`, `/api/pass-history`, `/api/hit-history`, `/api/clicked-category-history` | 이력 DB |
| `DF-MATCH-01` | 동일성 이상감지 | `/api/latest-commonality-path`, `/api/commonality-data`, `/api/commonality-image` | `path_erd_commonality_xian`, `erd_commonality` image |
| `DF-MANUAL-01` | 사용자 메뉴얼 | 정적 Markdown import | `docs/user-manual/USER_MANUAL.md` |

## 3. 개발예정·잔여 흐름

| Flow ID | 상태 | 설명 |
|---|---|---|
| `DF-COMMON-RESIDUAL` | 공식 서비스 아님 | 공통부 API와 일부 직접 화면은 남아 있으나 메인에서는 개발예정이다. |
| `DF-MAIL-RESIDUAL` | 발송 미구현 | `lineDashboard.mailingSummary`, HTML template, 등록 API가 있으나 renderer·scheduler·sender가 없다. |
| `DF-MY-EQP-HISTORY` | 제거된 과거 흐름 | MY EQP API·등록 helper·`step=ALL` 흐름은 현재 runtime에 없다. |

## 4. Gate 흐름

1. `blockDisabledDataRequest`가 `/api/*`의 method와 기능별 gate를 확인한다.
2. Dashboard·자설비 read·동일성·공통부 일부는 각 기능 gate 기본값의 영향을 받는다.
3. DB API는 `SCS_DB_CONNECTIONS_ENABLED`와 읽을 수 있는 `DB_INFO_PATH`가 필요하다.
4. `SCS_DATA_CONNECTIONS_ENABLED=1`이면 전체 등록 API가 허용된다.
5. gate 통과 후에도 실제 파일·DB가 없으면 handler가 빈 결과 또는 안전한 오류를 반환한다.

## 5. Sensor 제외 흐름

`SENSOR_EXCLUSION_CONFIG_PATH`가 있으면 그 파일을, 없으면 `config/sensor-exclusions.json`을 읽는다. 저장소에는 예시 파일만 있으며 실제 파일이 없거나 유효하지 않으면 마지막 정상 cache 또는 빈 제외 규칙을 사용한다. 원천 데이터는 수정하지 않고 응답 row만 필터링한다.

## 6. 호환성과 오류

- query 이름, 응답 필드, 데이터 column의 기존 호환 alias는 명시적 변경 없이는 제거하지 않는다.
- 빈 결과, 데이터 연결 차단(503), 파일·DB 오류를 서로 구분한다.
- 실제 파일 경로와 credential은 사용자 오류 응답에 포함하지 않는다.
- cache는 원천의 최신성이나 소유권을 바꾸지 않는다.

## 7. 관련 문서

- [Dashboard](../features/dashboard.md)
- [자설비](../features/self-equipment.md)
- [이상 데이터](../features/abnormal-data.md)
- [Mailing 잔여 구현](../features/mailing.md)
- [환경 정의](environment-definition.md)
