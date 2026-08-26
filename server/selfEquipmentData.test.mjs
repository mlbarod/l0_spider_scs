import assert from "node:assert/strict"
import test from "node:test"

import {
  SKIP_EXCLUSION_DURATION_MS,
  TEAM_ERD_COLUMNS,
  authorizeSelfEquipmentDataPath,
  buildSelfEquipmentPayload,
  excludeRecentlySkippedRows,
  filterMyEqpRows,
  handleErdScatterDataRequest,
  isSelfEquipmentDataPathAllowed,
  normalizeSelfEquipmentFilePath,
  resolveErdScatterProjection,
  resolveErdDataFilePath,
  resolveErdHistoryFilePath,
  resolveLatestSelfEquipmentDate,
  scopeSelfEquipmentRows,
} from "./selfEquipmentData.mjs"

const NOW = Date.parse("2026-07-16T12:00:00+09:00")

function createRow(overrides = {}) {
  return {
    line_rev: "P1L",
    sdwt: "SDWT-1",
    desc: "ETCH",
    ver: "V1",
    recipe_id: "R1",
    priority: "A",
    sensor: "TEMP",
    step: "10@MAIN",
    eqp: "EQP-1.png",
    file_path: "/appdata/abnormal_trend/pic/erd/2026-07-16/SDWT-1/ETCH/V1/R1/A/TEMP/10@MAIN/EQP-1.png",
    ...overrides,
  }
}

function createPassRecord(overrides = {}) {
  return {
    line_id: "P1L",
    sdwt: "SDWT-1",
    desc: "ETCH",
    ver: "V1",
    recipe_id: "R1",
    priority: "A",
    sensor: "TEMP",
    step: "10@MAIN",
    eqp: "EQP-1",
    exec_date: "2026-07-14T12:00:00+09:00",
    ...overrides,
  }
}

test("latest_date가 달라도 나머지 경로 식별값이 같으면 3일간 제외한다", () => {
  const olderLatestDateRow = createRow({
    file_path: "/appdata/abnormal_trend/pic/erd/2026-07-15/SDWT-1/ETCH/V1/R1/A/TEMP/10@MAIN/EQP-1.png",
  })

  assert.deepEqual(
    excludeRecentlySkippedRows([olderLatestDateRow], [createPassRecord()], NOW),
    [],
  )
})

test("latest_date 외의 경로 식별값이 다르면 제외하지 않는다", () => {
  const differentSensorRow = createRow({ sensor: "PRESSURE" })

  assert.deepEqual(
    excludeRecentlySkippedRows([differentSensorRow], [createPassRecord()], NOW),
    [differentSensorRow],
  )
})

test("SKIP 등록 후 정확히 3일이 지나면 일반 이상건수에 다시 포함한다", () => {
  const row = createRow()
  const expiredRecord = createPassRecord({
    exec_date: new Date(NOW - SKIP_EXCLUSION_DURATION_MS).toISOString(),
  })

  assert.deepEqual(excludeRecentlySkippedRows([row], [expiredRecord], NOW), [row])
})

test("My EQP는 등록된 sdwt와 eqp가 모두 일치하는 이상건만 남긴다", () => {
  const rows = [
    createRow({ sdwt: "SDWT-1", eqp: "EQP-1.png" }),
    createRow({ sdwt: "SDWT-2", eqp: "EQP-1.png" }),
    createRow({ sdwt: "SDWT-1", eqp: "EQP-2.png" }),
  ]
  const registrations = [{ sdwt: "sdwt-1", eqp: "eqp-1" }]

  assert.deepEqual(filterMyEqpRows(rows, registrations), [rows[0]])
})

test("SDWT 파일 경로가 매칭된 뒤에는 EQP의 구분자와 대소문자 차이를 허용한다", () => {
  const row = createRow({ sdwt: "원본-SDWT", eqp: "EQP-01_CH A.png" })
  const registrations = [{ sdwt: "화면 표시 SDWT", eqp: "eqp01-cha" }]

  assert.deepEqual(
    filterMyEqpRows([row], registrations, { sdwtMatchedBySource: true }),
    [row],
  )
})

test("My EQP 전체 Sensor Grade 조건에서는 모든 등급의 REICPE_ID를 제공한다", () => {
  const rows = [
    createRow({ priority: "A", recipe_id: "RECIPE-A" }),
    createRow({ priority: "D", recipe_id: "RECIPE-D", line_rev: "INTERNAL-LINE-NAME" }),
    createRow({ priority: "M", recipe_id: "RECIPE-M" }),
  ]
  const payload = buildSelfEquipmentPayload(rows, {
    line: "P1L",
    pathSdwt: "__MY_EQP__",
    sdwt: "MY EQP",
    includeAllLines: true,
    includeAllSdwt: true,
    priorities: ["A", "B", "D", "N", "M"],
    desc: "",
    eqpCh: "",
    sensor: "",
    chStep: "",
  })

  assert.deepEqual(payload.steps.map((step) => step.desc), ["RECIPE-A", "RECIPE-D", "RECIPE-M"])
})

test("My EQP STEP ALL은 선택 Grade 내 모든 EQP를 eqp_ch 선택지로 제공한다", () => {
  const rows = [
    createRow({ priority: "A", step: "STEP-A", eqp: "EQP-1.png" }),
    createRow({ priority: "D", step: "STEP-D", eqp: "EQP-2.png" }),
    createRow({ priority: "D", step: "STEP-E", eqp: "EQP-3.png" }),
  ]
  const payload = buildSelfEquipmentPayload(rows, {
    line: "P1L",
    pathSdwt: "__MY_EQP__",
    sdwt: "MY EQP",
    includeAllLines: true,
    includeAllSdwt: true,
    allowAllSteps: true,
    normalizeEqpCh: true,
    priorities: ["A", "D"],
    desc: "ALL",
    eqpCh: "",
    sensor: "",
    chStep: "",
  })

  assert.equal(payload.filters.desc, "ALL")
  assert.deepEqual(
    payload.eqpChannels.map((item) => item.eqpCh).sort(),
    ["EQP-1.png", "EQP-2.png", "EQP-3.png"],
  )
})

test("My EQP URL의 eqp_ch는 확장자와 표기 차이가 있어도 실제 EQP로 선택한다", () => {
  const rows = [createRow({ recipe_id: "RECIPE-A", eqp: "EQP-01_CH A.png" })]
  const payload = buildSelfEquipmentPayload(rows, {
    line: "P1L",
    pathSdwt: "__MY_EQP__",
    sdwt: "MY EQP",
    includeAllLines: true,
    includeAllSdwt: true,
    allowAllSteps: true,
    normalizeEqpCh: true,
    priorities: ["A"],
    desc: "RECIPE-A",
    eqpCh: "eqp01-cha",
    sensor: "",
    chStep: "",
  })

  assert.equal(payload.filters.eqpCh, "EQP-01_CH A.png")
})

test("eqp_ch ALL에서 Sensor ALL과 ch_step ALL을 선택하면 모든 센서 차트를 반환한다", () => {
  const rows = [
    createRow({ sensor: "TEMP", step: "10@MAIN", eqp: "EQP-1.png" }),
    createRow({ sensor: "PRESSURE", step: "10@MAIN", eqp: "EQP-2.png" }),
  ]
  const payload = buildSelfEquipmentPayload(rows, {
    line: "P1L",
    pathSdwt: "SDWT-1",
    sdwt: "SDWT-1",
    priorities: ["A"],
    desc: "R1",
    eqpCh: "ALL",
    sensor: "ALL",
    chStep: "ALL",
  })

  assert.equal(payload.filters.eqpCh, "ALL")
  assert.equal(payload.filters.sensor, "ALL")
  assert.equal(payload.filters.chStep, "ALL")
  assert.deepEqual(payload.rows.map((row) => row.sensor).sort(), ["PRESSURE", "TEMP"])
})

test("Sensor ALL에서는 개별 ch_step 선택을 허용하지 않는다", () => {
  const rows = [
    createRow({ sensor: "TEMP", step: "10@MAIN" }),
    createRow({ sensor: "PRESSURE", step: "10@MAIN" }),
  ]
  const payload = buildSelfEquipmentPayload(rows, {
    line: "P1L",
    pathSdwt: "SDWT-1",
    sdwt: "SDWT-1",
    priorities: ["A"],
    desc: "R1",
    eqpCh: "EQP-1.png",
    sensor: "ALL",
    chStep: "10@MAIN",
  })

  assert.equal(payload.filters.sensor, "ALL")
  assert.equal(payload.filters.chStep, "")
  assert.deepEqual(payload.rows, [])
})

test("path_xian 최신 파일은 날짜와 시각이 가장 큰 이름을 선택한다", () => {
  assert.equal(resolveLatestSelfEquipmentDate([
    "README.txt",
    "2026-08-24",
    "2026-08-25 09:00:00",
    "2026-08-25 18:30:00",
  ]), "2026-08-25 18:30:00")
})

test("path_xian index는 REICPE_ID를 포함한 7개 컬럼만 projection한다", () => {
  assert.deepEqual(TEAM_ERD_COLUMNS, [
    "sdwt",
    "REICPE_ID",
    "priority",
    "sensor",
    "step",
    "eqp",
    "file_path",
  ])
})

test("ERD scatter는 실제 schema의 underscore axis와 eqp_cb를 선택한다", () => {
  assert.deepEqual(resolveErdScatterProjection([
    "act_time",
    "eqp_cb",
    "eqp_id",
    "TEMP_10@MAIN",
  ], {
    sensor: "TEMP",
    chStep: "10@MAIN",
  }), {
    axisColumn: "TEMP_10@MAIN",
    equipmentColumn: "eqp_cb",
    columns: ["act_time", "eqp_cb", "eqp_id", "TEMP_10@MAIN"],
  })
})

test("ERD scatter는 star axis와 eqp schema도 호환한다", () => {
  assert.deepEqual(resolveErdScatterProjection([
    "act_time",
    "eqp",
    "wafer_id",
    "TEMP*10@MAIN",
  ], {
    sensor: "TEMP",
    chStep: "10@MAIN",
  }), {
    axisColumn: "TEMP*10@MAIN",
    equipmentColumn: "eqp",
    columns: ["act_time", "eqp", "wafer_id", "TEMP*10@MAIN"],
  })
})

test("ERD identity는 eqp 없이 eqp_cb group 전체를 읽을 수 있다", () => {
  assert.deepEqual(resolveErdScatterProjection([
    "act_time",
    "eqp_cb",
    "TEMP_10@MAIN",
  ], {
    sensor: "TEMP",
    chStep: "10@MAIN",
    identity: true,
  }), {
    axisColumn: "TEMP_10@MAIN",
    equipmentColumn: "",
    columns: ["act_time", "eqp_cb", "TEMP_10@MAIN"],
  })
})

test("자설비 경로의 pic_server2 segment만 pic로 정규화한다", () => {
  assert.equal(
    normalizeSelfEquipmentFilePath("/appdata/abnormal_trend/pic_server2/erd/2026-08-25/EQP-1"),
    "/appdata/abnormal_trend/pic/erd/2026-08-25/EQP-1",
  )
})

test("ERD file_path 디렉터리에서 data와 EQP 이력 parquet 경로 기준을 만든다", () => {
  const resolved = resolveErdDataFilePath(
    "/appdata/abnormal_trend/pic_server2/erd/2026-08-25/SDWT-1/EQP-1",
  )
  assert.deepEqual(
    resolved,
    {
      filePath: "/appdata/abnormal_trend/pic/erd/2026-08-25/SDWT-1/EQP-1/data.parquet",
      latestDate: "2026-08-25",
      sensor: "",
      chStep: "",
    },
  )
  assert.equal(
    resolveErdHistoryFilePath(resolved.filePath, "EQP-1"),
    "/appdata/abnormal_trend/pic/erd/2026-08-25/SDWT-1/EQP-1/EQP-1.parquet",
  )
})

test("ERD data 경로는 backup root와 하위만 거부하고 이름이 비슷한 형제는 허용한다", () => {
  assert.throws(
    () => resolveErdDataFilePath("/appdata/abnormal_trend/pic/backup"),
    /허용되지 않은 ERD 데이터 경로/,
  )
  assert.throws(
    () => resolveErdDataFilePath("/appdata/abnormal_trend/pic/backup/2026-08-25/EQP-1"),
    /허용되지 않은 ERD 데이터 경로/,
  )
  assert.throws(
    () => resolveErdDataFilePath("/appdata/abnormal_trend/outside/EQP-1"),
    /허용되지 않은 ERD 데이터 경로/,
  )
  assert.equal(
    resolveErdDataFilePath("/appdata/abnormal_trend/pic/backup2/EQP-1").filePath,
    "/appdata/abnormal_trend/pic/backup2/EQP-1/data.parquet",
  )
})

test("전역 path_xian row는 mapping의 Line과 SDWT 범위로 제한한다", () => {
  const rows = [
    createRow({ sdwt: "RAW-1" }),
    createRow({ sdwt: "RAW-2" }),
  ]
  const mapping = {
    line_mapping: { "RAW-1": "P1L", "RAW-2": "P2L" },
    sdwt_mapping: { "RAW-1": "SDWT-1", "RAW-2": "SDWT-2" },
  }

  const scoped = scopeSelfEquipmentRows(rows, {
    line: "P1L",
    pathSdwt: "RAW-1",
    sdwt: "SDWT-1",
    mapping,
  })

  assert.equal(scoped.length, 1)
  assert.equal(scoped[0].line_rev, "P1L")
  assert.equal(scoped[0].path_sdwt, "RAW-1")
  assert.equal(scoped[0].sdwt, "SDWT-1")
})

test("자설비 chart 경로는 최신 scoped index의 path·EQP·sensor·step이 모두 일치해야 한다", () => {
  const rows = [createRow({
    eqp: "EQP-1",
    latest_date: "2026-08-25",
    file_path: "/appdata/abnormal_trend/pic/self/2026-08-25/EQP-1",
  })]
  const request = {
    dataDirectoryPath: "/appdata/abnormal_trend/pic_server2/self/2026-08-25/EQP-1",
    eqp: "EQP-1",
    latestDate: "2026-08-25",
    sensor: "TEMP",
    step: "10@MAIN",
  }

  assert.equal(isSelfEquipmentDataPathAllowed(rows, request), true)
  assert.equal(isSelfEquipmentDataPathAllowed(rows, {
    ...request,
    dataDirectoryPath: "/appdata/abnormal_trend/pic/common/2026-08-25/EQP-1",
  }), false)
  assert.equal(isSelfEquipmentDataPathAllowed(rows, { ...request, sensor: "PRESSURE" }), false)
  assert.equal(isSelfEquipmentDataPathAllowed(rows, { ...request, step: "20@MAIN" }), false)
  assert.equal(isSelfEquipmentDataPathAllowed(rows, { ...request, eqp: "EQP-2" }), false)
  assert.equal(isSelfEquipmentDataPathAllowed(rows, {
    ...request,
    latestDate: "2026-08-24",
  }), false)
})

test("Self chart authorization은 다른 App 경로를 handler read 전에 거부한다", async () => {
  const indexRows = [createRow({
    sdwt: "RAW-1",
    eqp: "EQP-1",
    latest_date: "2026-08-25",
    file_path: "/appdata/abnormal_trend/pic/self/2026-08-25/EQP-1",
  })]
  const dependencies = {
    readIndex: async () => ({ latestDate: "2026-08-25", rows: indexRows }),
    readMapping: async () => ({
      line_mapping: { "RAW-1": "P1L" },
      sdwt_mapping: { "RAW-1": "SDWT-1" },
    }),
  }

  assert.equal(await authorizeSelfEquipmentDataPath({
    dataDirectoryPath: "/appdata/abnormal_trend/pic/self/2026-08-25/EQP-1",
    eqp: "EQP-1",
    latestDate: "2026-08-25",
    line: "P1L",
    pathSdwt: "RAW-1",
    sensor: "TEMP",
    step: "10@MAIN",
  }, dependencies), true)
  assert.equal(await authorizeSelfEquipmentDataPath({
    dataDirectoryPath: "/appdata/abnormal_trend/pic/common/2026-08-25/EQP-1",
    eqp: "EQP-1",
    latestDate: "2026-08-25",
    line: "P1L",
    pathSdwt: "RAW-1",
    sensor: "TEMP",
    step: "10@MAIN",
  }, dependencies), false)
})

test("chart handler는 다른 App 경로를 Parquet read 전에 403으로 거부한다", async () => {
  let authorizationRequest = null
  const response = {
    statusCode: null,
    body: "",
    writeHead(statusCode) {
      this.statusCode = statusCode
    },
    end(body = "") {
      this.body = body
    },
  }
  const url = new URL(
    "http://localhost/api/erd-scatter-data?path=/appdata/abnormal_trend/pic/common/2026-08-25/EQP-1&eqp=EQP-1&sensor=TEMP&chStep=10%40MAIN&latestDate=2026-08-25&line=P1L&pathSdwt=RAW-1",
  )

  await handleErdScatterDataRequest({ method: "GET" }, response, url, {
    authorizeDataPath: async (request) => {
      authorizationRequest = request
      return false
    },
  })

  assert.equal(response.statusCode, 403)
  assert.equal(authorizationRequest.sensor, "TEMP")
  assert.equal(authorizationRequest.step, "10@MAIN")
})

test("SDWT scope 비교는 구분자를 제거해 다른 index row를 섞지 않는다", () => {
  const rows = [
    createRow({ sdwt: "TEAM-A" }),
    createRow({ sdwt: "TEAMA" }),
  ]
  const mapping = {
    line_mapping: { "TEAM-A": "P1L" },
    sdwt_mapping: { "TEAM-A": "TEAM-A" },
  }

  const scoped = scopeSelfEquipmentRows(rows, {
    line: "P1L",
    pathSdwt: "TEAM-A",
    sdwt: "TEAM-A",
    mapping,
  })

  assert.equal(scoped.length, 1)
  assert.equal(scoped[0].file_path, rows[0].file_path)
})

test("요청 sdwt 값은 mapping으로 정한 index scope를 확장하지 않는다", () => {
  const rows = [
    createRow({ sdwt: "RAW-1", eqp: "EQP-1" }),
    createRow({ sdwt: "RAW-2", eqp: "EQP-2" }),
  ]
  const mapping = {
    line_mapping: { "RAW-1": "P1L", "RAW-2": "P2L" },
    sdwt_mapping: { "RAW-1": "SDWT-1", "RAW-2": "SDWT-2" },
  }

  const scoped = scopeSelfEquipmentRows(rows, {
    line: "P1L",
    pathSdwt: "RAW-1",
    sdwt: "RAW-2",
    mapping,
  })

  assert.deepEqual(scoped.map((row) => row.eqp), ["EQP-1"])
})

test("sdwt display mapping이 없어도 요청 sdwt를 index scope에 추가하지 않는다", () => {
  const rows = [
    createRow({ sdwt: "RAW-1", eqp: "EQP-1" }),
    createRow({ sdwt: "RAW-2", eqp: "EQP-2" }),
  ]
  const mapping = {
    line_mapping: { "RAW-1": "P1L" },
    sdwt_mapping: {},
  }

  const scoped = scopeSelfEquipmentRows(rows, {
    line: "P1L",
    pathSdwt: "RAW-1",
    sdwt: "RAW-2",
    mapping,
  })

  assert.deepEqual(scoped.map((row) => row.eqp), ["EQP-1"])
  assert.equal(scoped[0].sdwt, "RAW-1")
})

test("다른 Line과 중복되는 display SDWT는 global index scope와 chart authorization에서 제외한다", async () => {
  const ambiguousPath = "/appdata/abnormal_trend/pic/erd/2026-08-25/SHARED"
  const mapping = {
    line_mapping: { "RAW-1": "P1L", "RAW-2": "P2L" },
    sdwt_mapping: { "RAW-1": "SHARED", "RAW-2": "SHARED" },
  }
  const rows = [createRow({
    sdwt: "SHARED",
    eqp: "EQP-2",
    file_path: ambiguousPath,
    latest_date: "2026-08-25",
  })]

  assert.deepEqual(scopeSelfEquipmentRows(rows, {
    line: "P1L",
    pathSdwt: "RAW-1",
    mapping,
  }), [])
  assert.equal(await authorizeSelfEquipmentDataPath({
    dataDirectoryPath: ambiguousPath,
    eqp: "EQP-2",
    latestDate: "2026-08-25",
    line: "P1L",
    pathSdwt: "RAW-1",
    sensor: "TEMP",
    step: "10@MAIN",
  }, {
    readIndex: async () => ({ latestDate: "2026-08-25", rows }),
    readMapping: async () => mapping,
  }), false)
})

test("REICPE_ID 필터는 ch_step용 step과 분리된 index 값을 사용한다", () => {
  const row = createRow({ desc: "LEGACY-DESC", recipe_id: "INDEX-RECIPE", step: "INDEX-STEP" })
  const payload = buildSelfEquipmentPayload([row], {
    line: "P1L",
    pathSdwt: "SDWT-1",
    sdwt: "SDWT-1",
    priorities: ["A"],
    desc: "INDEX-RECIPE",
    eqpCh: "",
    sensor: "",
    chStep: "",
  })

  assert.deepEqual(payload.steps.map((item) => item.desc), ["INDEX-RECIPE"])
  assert.equal(payload.filters.desc, "INDEX-RECIPE")
})

test("chart API는 path_xian latestDate 형식이 잘못되면 파일을 읽기 전에 거부한다", async () => {
  const response = {
    statusCode: null,
    body: "",
    writeHead(statusCode) {
      this.statusCode = statusCode
    },
    end(body = "") {
      this.body = body
    },
  }
  const url = new URL(
    "http://localhost/api/erd-scatter-data?path=/appdata/abnormal_trend/pic/erd/data&eqp=EQP-1&sensor=TEMP&chStep=STEP-1&latestDate=invalid",
  )

  await handleErdScatterDataRequest({ method: "GET" }, response, url)

  assert.equal(response.statusCode, 400)
  assert.match(JSON.parse(response.body).error, /latestDate/)
})
