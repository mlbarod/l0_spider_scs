# Defect SPIDER 몰림PC 이상감지

코드: `server/defectClusterPc.mjs` + `src/features/fdc-trend/pages/DefectClusterPcPage.jsx` (웹 화면)

l0_spider의 같은 기능을 그대로 옮겼다(2026-11-19). 몰림 판정 알고리즘(일일 배치)은 이 프로젝트에서 돌리지 않는다. l0_spider 배치가 만든 결과 파일을 읽어 화면에 그리기만 한다. 파일을 읽는 구조는 l0_spider와 같고, l0_spider의 `/appdata/hadoop/code/eads` 경로만 `/appdata/abnormal_trend/pic/defect`로 바꿨다.

## 웹 화면 (Defect SPIDER > 몰림PC 이상감지)

- 위치: 홈의 Defect SPIDER 카드를 누르면 팝업이 열린다. "챔버별 이상감지"(기존 Defect 화면, `/defect-spider`)와 "몰림PC 이상감지"(이 화면, `/defect-spider/cluster-pc`) 버튼이 있다.
- 데이터: `/appdata/abnormal_trend/pic/defect/fail_list_all_scs`(`server/defectClusterPc.mjs`의 `DEFECT_CLUSTER_PC_CONFIG`) 아래 `{YYYY-MM-DD HH:MM}` 폴더 중 `fail_list_bias_pc.parquet`가 있는 가장 최근 폴더를 읽는다. 결과 기준 시각은 화면 제목 아래에 표시한다.
- 필터(2026-11-19 변경): Line Name → SDWT → PRC_Group 순서로 단계 선택한다. Line Name과 SDWT는 하나를 골라야 하고(ALL 없음), PRC_Group은 ALL이 기본값이다. 위 필터를 바꾸면 아래 필터는 처음 값으로 돌아간다.
  - 결과의 `sdwt`, `prc_group`이 `A,B`처럼 여러 값이면 선택지에 따로 보여주고, 둘 중 하나를 고르면 그 wafer가 나온다.
  - 값이 비어 있는 wafer(배치의 장비 정보 미매칭, 이전 결과 파일)는 `(None)` 선택지로 본다(화면에는 언어별로 `(없음)`, `(None)`, `（无）`로 표시).
- wafer map: Line Name과 SDWT를 고르면 조건에 맞는 몰림 wafer를 EQPID별로 묶어 `lot_wf` 단위로 그린다.
  - PRC_Group 선택과 관계없이(2026-11-19) PRC_Group별 카드 안에서 EQP별, 다시 챔버(EQPID)별로 묶어 한 줄 5칸 격자에 그린다. eqpid는 `_` 앞이 EQP, 뒤가 챔버다. 챔버는 `Chamber: {chamber}`로 표시한다(예: `EQA01_1` → `EQA01` / `Chamber: 1`, `EQA01_PM1` → `Chamber: PM1`, 2026-11-20).
  - 챔버 묶음은 wafer 수만큼, EQP 묶음은 그 안 챔버 칸 수 합만큼 칸을 차지한다(둘 다 최대 5칸, 넘치면 그 묶음 안에서 다음 줄로). 그래서 1매짜리 EQP는 한 줄에 5개, 5매짜리 EQP는 한 줄에 1개가 들어간다. 묶음 순서는 이름순이라 줄 끝 칸이 빌 수 있다.
  - `_`가 없는 eqpid는 EQP와 챔버 이름을 eqpid 그대로 쓴다. 여러 장비가 섞인 wafer(`EQA01_PM2,EQB02_PM1`)는 EQP `EQA01,EQB02` 묶음에 넣고 챔버 칸에 eqpid 전체를 쓴다. prc_group이 여러 값인 wafer는 `ETCH,CVD` 같은 묶음 하나에 넣고, `(None)` 묶음은 맨 뒤에 둔다.
  - PRC_Group을 하나 고르면 그 값을 포함한 wafer만 나온다. 예: CVD를 고르면 `CVD` 카드와 `ETCH,CVD` 카드가 나온다. 좌표는 결과의 `path` 파일에서 `lot_wf`, `coorx`, `coory` 컬럼을 읽는다. 같은 파일의 `tkout_time`(wafer의 가장 늦은 값, `YYYY-MM-DD HH:MM:SS`), `root_lot_id`도 읽는다. map 좌측 상단에 "설비 진행시간", `device`를, 우측 상단에 `main_step`(main_seq), `met_step`(met_seq), `root_lot_id`, `slot`을 표시한다(2026-11-20, 값이 없으면 `-`). `slot`은 `lot_wf`의 마지막 `_` 뒤 값이다(예: `ABC1234.1_05` → `05`). map 우측 하단에는 defect 수를 `UCC:{n}개`로 표시한다.
- 과거 7일내 이상건수(2026-11-20): 챔버 이름(`Chamber: {chamber}`) 옆에 "과거 7일내 이상건수:{n}건"을 표시한다.
  - 기간: 서버 날짜 기준 오늘 이전 7일(예: 11-20이면 11-13 ~ 11-19) 결과 폴더. 최신 결과 폴더는 빼고, `fail_list_bias_pc.parquet`가 없는 폴더는 이력이 없는 것으로 본다. 읽지 못한 이력 파일은 건너뛴다.
  - 건수: 같은 line에서 eqpid 값이 하나라도 겹치는 결과 행(wafer) 수다. eqpid가 빈 wafer는 표시하지 않는다.
  - 중복 제거(2026-11-20): 일일 배치가 2일치씩 적재해 같은 감지가 여러 결과 폴더에 다시 나온다. line + `lot_wf` + 설비 진행시간(원본 좌표 파일의 `tkout_time`)이 같으면 한 건으로 세고(가장 최근 결과 행을 남김), 최신 결과에도 있는 감지는 이력에서 뺀다. 진행시간을 읽지 못한 행은 중복으로 보지 않는다. 팝업 목록도 같은 기준이다.
  - 1건 이상이면 건수를 눌러 그 wafer map들을 팝업으로 본다(최근 결과부터, 최대 400매, 카드에 결과 기준 시각 표시, 판정 버튼 없음). 원본 좌표 파일이 지워졌으면 그 카드에 오류만 보인다.
  - API: `maps` 응답에 `history: { eqpid: 건수 }`를 더했다. 팝업은 `GET /api/defect-spider/cluster-pc/history?snapshot=&line=&eqpid=`(최신 결과 시각이 다르면 410).
- 한 번에 최대 400매까지 표시하고, 넘으면 필터를 좁히라는 안내를 띄운다.
- 빠르게 그리기: 서버가 좌표를 0.1mm 정수 배열로 줄여 보내고(gzip), 화면은 canvas에 직접 그린다. 화면에 보이는 wafer만 먼저 그리고 나머지는 스크롤할 때 그린다.
  - 측정(synthetic, 개발 PC): 400매(wafer당 480~3,000점) 응답 약 0.4~0.5초, 클릭 후 첫 화면 약 1.1초
- API: `GET /api/defect-spider/cluster-pc/catalog`(필터 값만, 파일 경로 미노출), `GET /api/defect-spider/cluster-pc/maps?snapshot=&line=&sdwt=&prcGroup=`(`line`, `sdwt` 필수). catalog의 행은 `[line, sdwt 값 목록, prc_group 값 목록]`이다.
  - 화면에서 받은 값은 파일 경로로 쓰지 않는다. 결과 파일의 `path`만 읽는다. `path`가 l0_spider 경로(`/appdata/hadoop/code/eads/...`)이면 앞부분을 `/appdata/abnormal_trend/pic/defect`로 바꿔 읽고, 바꾼 경로도 `/appdata/abnormal_trend/pic/defect` 안쪽일 때만 읽는다.
  - 화면이 본 결과 시각(`snapshot`)과 서버의 최신 결과가 다르면 410으로 새로고침을 요청한다.
- 몰림 근거 표시(2026-11-19): 결과의 `clusters` 값으로 map 위에 그린다.
  - wafer map을 처음 그릴 때는 점만 그린다. EQP 이름 옆 "몰림PC 판정 사유" 버튼을 누르면 그 EQP의 wafer map에 아래 원과 음영을 그리고, 다시 누르면 지운다. 필터를 바꾸거나 새로 조회하면 모두 꺼진 상태로 돌아간다.
  - 파란 원은 군집 창이다(실제 반경). 1.5mm 창은 map에서 너무 작아 최소 4px로 그린다. 판정 근거가 아닌 군집(비교 배수 미달)은 회색 점선이다.
  - 파란 음영은 판정 근거 군집의 비교 영역이다. 방향 비교는 45° 부채꼴, 링 비교는 가장 안쪽 원(약 53mm)이다.
  - 카드 아래에는 가장 배수가 큰 근거 군집을 `r 25mm · 60개 · 방향 3.9배`처럼 표시한다. 마우스를 올리면 모든 군집이 보인다.
  - `clusters` 컬럼이 없는 이전 결과 파일은 점만 그린다.

### 판정 피드백 ("몰림PC 맞음" / "몰림PC 아님", 2026-11-19)

- wafer 카드마다 두 버튼이 있다. 누르면 그 wafer의 판정과 판정 사유(`clusters`)를 DB에 저장한다. 오탐 분석과 알고리즘 튜닝용이다.
- 저장 단위: 결과 시각 + line + device + main_seq + met_seq + lot_wf당 1행이다. 다른 판정을 누르면(다른 사용자 포함) 마지막 판정으로 덮어쓰고, 저장자와 시각도 바뀐다. 눌린 판정을 다시 누르면 눌림이 풀리고 그 판정 행을 지운다(그 사이 다른 판정으로 바뀐 행은 지우지 않는다).
- 화면은 wafer 식별값과 판정만 보낸다. 서버는 화면이 본 결과 시각이 최신 결과와 같은지(아니면 410), 그 wafer가 결과에 있는지(없으면 404) 확인한다. 그다음 결과 파일의 `clusters` 원문과 접속 IP로 등록된 사용자(`knox_id`, 현재 사용자 확인과 같은 방식)로 저장한다. 등록되지 않은 사용자는 저장할 수 없다.
- 저장 경로: `POST /api/defect-spider/cluster-pc/feedback`(본문 `{ snapshot, line, device, mainSeq, metSeq, lotWf, verdict: "correct" | "wrong" }`) → `scripts/defect_cluster_pc_feedback.py`가 클릭이력과 같은 DB(`db_info.pkl`)에 `pymysql`로 저장한다. 취소는 같은 본문으로 `DELETE`를 보낸다.
- 눌린 버튼 표시는 이 화면을 보는 동안만 유지한다. 새로고침하면 저장된 판정을 다시 불러오지 않는다.
- 저장하지 않는 것: eqpid, prc_group, sdwt, 좌표 원본. 필요하면 식별값으로 그날 결과 파일과 원본 parquet을 찾는다(원본 보관 기간 안에서만).
- 테이블 생성문: [`scripts/defect_cluster_pc_feedback.sql`](../../scripts/defect_cluster_pc_feedback.sql)을 운영 DB에서 한 번 수동 실행한다. 앱 DB 계정에 INSERT, UPDATE 권한이 필요하다.
- 서버는 컬럼 길이를 넘는 식별값을 400으로 거부한다(`server/defectClusterPc.mjs`의 `FEEDBACK_FIELDS`). 컬럼 길이를 바꾸면 이 값도 함께 바꾼다.


## 챔버별 이상감지: 이상 wafer map보기 (2026-11-23)

- 챔버별 이상감지(`/defect-spider`) 차트 카드에 빨간 점(NG)이 있으면 "이상 wafer map보기" 버튼이 나온다. 누르면 그 카드(eqp_ch)의 빨간 점 wafer map을 팝업에 한 번에 그린다. map 모양은 몰림PC 이상감지 카드와 같다(판정 버튼·판정 사유 없음).
- 빨간 점 기준은 차트와 같다(`final_decision` NG, `anomaly_type=std`이면서 `std_result` NG, 같은 lot/wafer 보호 포함). wafer는 `lot_wf` 단위로 한 번씩 그리고, 최근 설비 진행시간부터 보여준다(최대 400매).
- 좌표: 차트 카드의 fail 파일이 쓴 `main_seq`·`met_seq`로 좌표 파일을 찾는다(`locateDefectMapWafers`). 경로는 `/appdata/abnormal_trend/pic/defect/{line}/defect_map/{device}/{문자+main_seq 숫자}/{met_seq}_RANDOM_PC/{yyyy-mm-dd}/{main_seq 숫자}_measure_data_xy.parquet`이다.
  - main_seq 폴더는 이름에서 알파벳과 `%`를 뺀 숫자가 main_seq 숫자와 같은 폴더다(예: `U%100` → `100`). 파일 이름 앞 숫자도 이 값이다.
  - 날짜 폴더는 미리 알 수 없어서, wafer의 가장 이른 설비 진행일(`tkout_time`) 하루 전부터 7일 뒤까지의 폴더를 이른 날짜부터 보고, 좌표 파일의 `lot_wf` 컬럼에 그 wafer가 처음 나온 파일을 쓴다(`MAP_DATE_WINDOW`). 후보 파일은 `lot_wf` 컬럼만 읽고 파일 버전이 같으면 다시 읽지 않는다.
  - fail 파일 행에 `device`가 없으면 `defect_map` 아래 모든 device 폴더에서 찾는다.
- 좌표 파일을 찾지 못했거나 좌표가 없는 wafer는 빼고 보여준다. 그릴 wafer가 하나도 없으면 "표시할 wafer map이 없습니다."가 보인다.
- 빠진 wafer가 있으면 팝업 아래에 이유별 매수를 보여준다: 좌표 파일 없음(읽을 수 있는 후보 파일이 하나도 없음), lot_wf 불일치(파일은 읽었지만 그 lot_wf가 없음), 좌표 없음(lot_wf는 있지만 좌표를 읽지 못함). lot_wf 불일치면 그 wafer의 lot_wf와 찾아본 날짜 범위를 최대 20매까지 보여준다. 찾아본 경로와 파일 안 lot_wf 예시는 API 응답(`diagnostics`)에만 있고 화면에는 보이지 않는다(2026-11-24 요청).
  - 이름이 `.`으로 시작하는 숨김 폴더(예: Jupyter의 `.ipynb_checkpoints`)는 device·main_seq·날짜 폴더 후보에서 뺀다.
- API: `GET /api/defect-map?line=&pathSdwt=&step=&prcGroup=&mainSeq=&metSeq=&filePath=&eqpCh=`(`server/defectSpiderData.mjs`의 `handleDefectMapRequest`). `filePath`와 `eqpCh`는 선택 조건의 fail 파일·eqpid와 맞을 때만 받는다. 응답 `{ total, limit, wafers, diagnostics }`의 wafer 형식은 몰림PC `maps`와 같다. `diagnostics`는 `{ checked, notFound, lotWfMismatch, lotWfMismatches: [{ lotWf, from, to, files, fileTotal, samples }], noCoords, missingPaths: [{ path, from, to }], missingPathTotal }`이고, 경로는 좌표 파일을 찾지 못했거나 lot_wf가 맞지 않은 경우에만 보낸다.
