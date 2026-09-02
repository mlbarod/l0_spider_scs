# L0 Spider 이상 데이터 및 결과 조회 기준

## 1. 범위

이 문서는 자설비·동일성 분석 결과와 코드에 남아 있는 공통부 데이터 경계를 설명한다. 사용자에게 제공되는 상태는 route가 존재하는지만으로 판단하지 않고 메인 화면의 상태와 공식 진입 경로를 함께 본다.

## 2. 기능 상태

| 기능 | 사용자 상태 | 화면·route | 데이터 API |
|---|---|---|---|
| 자설비 이상감지 | 운영중 | `/self-equipment` | `/api/self-equipment-data`, `/api/erd-scatter-data`, `/api/erd-file` |
| 동일성 이상감지 | 운영중 | `/matching-anomaly` | `/api/commonality-data`, `/api/commonality-image` |
| 공통부 이상감지 | 개발예정 | 메인에서는 `/under-construction/common-anomaly`; `/common-anomaly`도 개발예정 화면 | `/api/common-anomaly-*`는 잔여 구현 |
| 공통부 동일성 | 개발예정 | 메인에서는 `/under-construction/common-commonality`; `/common-commonality-anomaly`는 직접 접속 가능한 호환 화면 | `/api/common-commonality-*`는 잔여 구현 |

Defect/L1/L3 직접 route는 mock data 기반 화면이 남아 있지만 공식 운영 기능이 아니다.

## 3. 자설비 데이터

자설비는 `path_xian/{line}/{sdwt}/df_path.parquet`에서 필터와 실제 데이터 경로를 얻고, 선택 경로의 `data.parquet`과 이미지·EQP 이력 Parquet을 읽는다. 주요 선택값은 Line, 분임조, Grade, PRC_Group, EQP, Sensor, STEP이다.

MY EQP 전용 조회, `/api/my-eqp-*`, `step=ALL` 등록 설비 흐름은 현재 계약에 없다. 상세 내용과 보존된 데이터 참조 표는 [self-equipment.md](self-equipment.md)를 따른다.

## 4. 동일성 데이터

동일성 화면은 Line과 SDWT를 매핑한 뒤 STEP(`stepSeq`), Sensor, `chStep` 조건으로 `/api/commonality-data`를 조회한다. 응답의 허용된 이미지 경로는 `/api/commonality-image`로 전달한다.

파일 원천은 다음과 같다.

- `/appdata/abnormal_trend/pic/path_erd_commonality_xian/{latest_date}`
- `/appdata/abnormal_trend/pic/erd_commonality/{latest_date}/.../img.png`

## 5. 공통부 잔여 구현

공통부 API와 화면 코드는 향후 개발 및 호환을 위해 남아 있다. 기본 서비스에서 운영중으로 표시하지 않으며 사용자 매뉴얼의 정상 사용 절차에도 포함하지 않는다. 직접 호환 경로를 변경하거나 제거할 때는 기존 링크 사용 여부를 별도로 확인한다.

## 6. 공통 처리 규칙

- 파일 없음과 조건에 맞는 행이 없는 경우를 구분한다.
- path query는 서버가 허용한 root 안에서만 처리한다.
- Sensor 제외 규칙은 유효한 설정 파일이 있을 때만 적용하며, 파일이 없으면 빈 규칙으로 fallback한다.
- 운영 파일과 운영 DB는 조회 과정에서 생성·이동·수정하지 않는다.
- 응답 오류에는 실제 파일 경로, credential, 내부 stack을 노출하지 않는다.

## 7. 근거

- `src/features/fdc-trend/routes.jsx`
- `src/features/fdc-trend/api/selfEquipmentApi.js`
- `src/features/fdc-trend/api/commonalityApi.js`
- `src/features/fdc-trend/api/commonAnomalyApi.js`
- `src/features/fdc-trend/api/commonCommonalityApi.js`
- `src/config/spiderDataPaths.mjs`
