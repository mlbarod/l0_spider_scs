# ADR-002: Parquet·이미지 기반 분석 결과 저장 및 조회

## 상태

Accepted — 2026-08-30 현재 코드 기준으로 현행화했다.

## 컨텍스트

분석 결과는 `/appdata` 아래의 Parquet·이미지 파일로 제공되고, 애플리케이션은 이를 읽어 화면과 API 응답으로 변환한다. 과거 문서가 설명한 MY EQP 등록 DB와 MY EQP 전용 조회는 현재 사용자 기능 및 runtime helper에 없다.

## 결정

- 분석 결과의 기준 저장소는 기존 `/appdata/abnormal_trend/pic` 파일 구조를 유지한다.
- 대시보드, 자설비, 동일성 및 코드에 남은 공통부 API는 서버가 허용된 경로를 읽어 응답한다.
- 브라우저에 임의의 서버 파일 경로를 직접 노출하거나 임의 경로 읽기를 허용하지 않는다.
- DB는 `pass_history`, `hit_history`, `clicked_category_history` 같은 현재 이력 기능에만 사용한다. MY EQP 등록 저장소를 현재 계약으로 간주하지 않는다.
- 애플리케이션은 분석 산출물의 생성자가 아니다. 운영 데이터 생성·보존 정책은 외부 소유 영역이다.

## 주요 파일 원천

| 기능 | 주요 원천 |
|---|---|
| Dashboard | `stats/{latest_date}_spider_step_stats.parquets`, `path/{latest_date}` |
| 자설비 | `path_xian/{line}/{sdwt}/df_path.parquet`, 선택 경로의 `data.parquet`·이미지·이력 Parquet |
| 동일성 | `path_erd_commonality_xian/{latest_date}`, `erd_commonality/.../img.png` |
| 공통부 잔여 API | `path_common/.../df_path.parquet`, `common/.../data.parquet`, `path_common_commonality/...` |
| 매핑 | `/appdata/l0_spider_scs/mapping_config.json` |

정확한 템플릿은 `src/config/spiderDataPaths.mjs`를 기준으로 한다.

## 호환성과 장애 처리

- 기존 경로·column·응답 shape 변경은 사용자 동작과 API 호환성 검토가 필요하다.
- 파일이 없거나 읽을 수 없을 때 운영 파일을 자동 생성·이동·수정하지 않는다.
- 빈 결과와 서버 오류를 구분하고, 실제 경로·credential을 오류 응답에 노출하지 않는다.
- cache는 응답 속도를 위한 보조 수단이며 원천 파일의 소유권이나 최신성 기준을 바꾸지 않는다.

## 근거

- `src/config/spiderDataPaths.mjs`
- `server/dashboardData.mjs`
- `server/selfEquipmentData.mjs`
- `server/commonalityData.mjs`
- `server/commonAnomalyData.mjs`
- `server/commonCommonalityData.mjs`
- [데이터 흐름](../system/data-flow.md)
