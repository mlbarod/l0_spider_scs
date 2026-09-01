import assert from "node:assert/strict"
import test from "node:test"

import {
  EQP_REFERENCE_COLUMNS,
  SKIP_EXCLUSION_DURATION_MS,
  TEAM_ERD_COLUMNS,
  authorizeSelfEquipmentDataPath,
  buildSelfEquipmentPayload,
  excludeRecentlySkippedRows,
  getSelfEquipmentLatestDateFromFilePath,
  getTeamErdEqpJoinKey,
  handleErdScatterDataRequest,
  isDirectSkipListErdPathAllowed,
  isSelfEquipmentDataPathAllowed,
  joinTeamErdRowsWithEqpReference,
  normalizeSelfEquipmentFilePath,
  normalizeTeamErdRow,
  readOptionalPassHistoryRecords,
  resolveErdScatterProjection,
  resolveErdDataFilePath,
  resolveErdHistoryFilePath,
  resolveTeamErdPath,
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

test("path_xian row는 file_path 재파싱 없이 chart row 식별값으로 활성 SKIP을 제외한다", () => {
  const row = createRow({
    desc: "R1",
    ver: "",
    latest_date: "2026-08-27 13:00:00",
  })

  assert.deepEqual(excludeRecentlySkippedRows([row], [createPassRecord({
    desc: "R1",
    ver: "",
  })], NOW), [])
})

test("과거 빈 ver SKIP은 ver가 있는 분임조 ERD row도 계속 제외한다", () => {
  const row = createRow({ ver: "V7" })
  const legacyRecord = {
    line_id: row.line_rev,
    ver: "",
    sdwt: row.sdwt,
    desc: row.desc,
    recipe_id: row.recipe_id,
    priority: row.priority,
    sensor: row.sensor,
    step: row.step,
    eqp: row.eqp,
    exec_date: new Date(NOW - 1_000).toISOString(),
  }

  assert.deepEqual(excludeRecentlySkippedRows([row], [legacyRecord], NOW), [])
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

test("분임조별 path_xian 테이블은 ver를 포함한 원본 컬럼을 projection한다", () => {
  assert.deepEqual(TEAM_ERD_COLUMNS, [
    "sdwt",
    "desc",
    "ver",
    "recipe_id",
    "priority",
    "sensor",
    "step",
    "eqp",
    "file_path",
    "line_rev",
  ])
})

test("eqp 기준정보는 운영 parquet의 지정 컬럼만 projection한다", () => {
  assert.deepEqual(EQP_REFERENCE_COLUMNS, [
    "line_no",
    "fdc_model",
    "main",
    "disp_name",
    "sdwt_prod",
    "prc_group",
  ])
})

test("경로 테이블 eqp의 첫 하이픈 앞 값을 eqp 기준정보 main과 결합한다", () => {
  const rows = joinTeamErdRowsWithEqpReference([
    createRow({ eqp: "EQP01-CH1.png" }),
    createRow({ eqp: "EQP02-CH2.png" }),
    createRow({ eqp: "UNKNOWN-CH1.png" }),
  ], [
    { main: "EQP01", prc_group: "ETCH" },
    { main: "EQP02", prc_group: "CLEAN" },
  ])

  assert.equal(getTeamErdEqpJoinKey(" EQP01-CH1.png "), "EQP01")
  assert.deepEqual(rows.map((row) => row.prc_group), ["ETCH", "CLEAN", ""])
})

test("분임조별 path_xian row는 ver를 경로 추정 없이 원본 컬럼에서 정규화한다", () => {
  assert.deepEqual(normalizeTeamErdRow({
    sdwt: " SDWT-1 ",
    desc: " ETCH ",
    ver: " V7 ",
    recipe_id: " RECIPE-1 ",
    priority: " A ",
    sensor: " TEMP ",
    step: " 10@MAIN ",
    eqp: " EQP-1 ",
    file_path: "/appdata/abnormal_trend/pic_server2/erd/2026-08-27/SDWT-1/ETCH/V7/RECIPE-1/A/TEMP/10@MAIN/EQP-1.png",
  }, {
    line: "P1L",
    pathSdwt: "RAW-SDWT-1",
    displaySdwt: "SDWT-1",
  }), {
    sdwt: "SDWT-1",
    desc: "ETCH",
    ver: "V7",
    recipe_id: "RECIPE-1",
    priority: "A",
    sensor: "TEMP",
    step: "10@MAIN",
    eqp: "EQP-1",
    prc_group: "",
    file_path: "/appdata/abnormal_trend/pic/erd/2026-08-27/SDWT-1/ETCH/V7/RECIPE-1/A/TEMP/10@MAIN/EQP-1.png",
    line_rev: "P1L",
    path_sdwt: "RAW-SDWT-1",
    latest_date: "2026-08-27",
  })
})

test("분임조별 ERD 경로는 pic/path가 아니라 pic/path_xian을 사용한다", () => {
  assert.equal(
    resolveTeamErdPath({ line: "P1L", pathSdwt: "RAW-SDWT-1" }),
    "/appdata/abnormal_trend/pic/path_xian/P1L/RAW-SDWT-1/df_path.parquet",
  )
  assert.equal(
    resolveTeamErdPath(
      { line: "P1L", pathSdwt: "RAW-SDWT-1" },
      "/mounted/path_xian",
    ),
    "/mounted/path_xian/P1L/RAW-SDWT-1/df_path.parquet",
  )
})

test("latest_date는 최신 index가 아니라 선택한 분임조 ERD row의 file_path에서 얻는다", () => {
  assert.equal(
    getSelfEquipmentLatestDateFromFilePath(
      "/appdata/abnormal_trend/pic/erd/2026-08-27 13:00:00/SDWT-1/ETCH/V7/R1/A/TEMP/10@MAIN/EQP-1.png",
    ),
    "2026-08-27 13:00:00",
  )
})

test("DB PASS 이력 조회 실패도 자설비 RECIPE_ID 원천 조회와 분리한다", async () => {
  const passRecords = await readOptionalPassHistoryRecords({ lineId: "P1L" }, {
    dbConnectionsEnabled: true,
    readRecords: async () => {
      throw new Error("synthetic DB failure")
    },
  })
  const payload = buildSelfEquipmentPayload(
    excludeRecentlySkippedRows([createRow({ recipe_id: "RECIPE-AVAILABLE" })], passRecords),
    {
      line: "P1L",
      sdwt: "SDWT-1",
      priorities: ["A"],
      desc: "",
      eqpCh: "",
      sensor: "",
      chStep: "",
    },
  )

  assert.deepEqual(passRecords, [])
  assert.deepEqual(payload.steps.map((item) => item.desc), ["RECIPE-AVAILABLE"])
})

test("ERD scatter는 실제 schema의 underscore axis와 eqp_cb를 선택한다", () => {
  assert.deepEqual(resolveErdScatterProjection([
    "act_time",
    "ver",
    "eqp_cb",
    "eqp_id",
    "TEMP_10@MAIN",
  ], {
    sensor: "TEMP",
    chStep: "10@MAIN",
  }), {
    axisColumn: "TEMP_10@MAIN",
    equipmentColumn: "eqp_cb",
    columns: ["act_time", "ver", "eqp_cb", "eqp_id", "TEMP_10@MAIN"],
  })
})

test("ERD scatter는 star axis와 eqp schema도 호환한다", () => {
  assert.deepEqual(resolveErdScatterProjection([
    "act_time",
    "ver",
    "eqp",
    "wafer_id",
    "TEMP*10@MAIN",
  ], {
    sensor: "TEMP",
    chStep: "10@MAIN",
  }), {
    axisColumn: "TEMP*10@MAIN",
    equipmentColumn: "eqp",
    columns: ["act_time", "ver", "eqp", "wafer_id", "TEMP*10@MAIN"],
  })
})

test("ERD identity는 eqp 없이 eqp_cb group 전체를 읽을 수 있다", () => {
  assert.deepEqual(resolveErdScatterProjection([
    "act_time",
    "ver",
    "eqp_cb",
    "TEMP_10@MAIN",
  ], {
    sensor: "TEMP",
    chStep: "10@MAIN",
    identity: true,
  }), {
    axisColumn: "TEMP_10@MAIN",
    equipmentColumn: "",
    columns: ["act_time", "ver", "eqp_cb", "TEMP_10@MAIN"],
  })
})

test("ERD 단일설비 data.parquet에 ver 컬럼이 없어도 차트 projection을 만든다", () => {
  assert.deepEqual(resolveErdScatterProjection([
    "act_time",
    "eqp",
    "TEMP_10@MAIN",
  ], {
    sensor: "TEMP",
    chStep: "10@MAIN",
  }), {
    axisColumn: "TEMP_10@MAIN",
    equipmentColumn: "eqp",
    columns: ["act_time", "eqp", "TEMP_10@MAIN"],
  })
})

test("ERD identity data.parquet에 ver 컬럼이 없어도 eqp_cb projection을 만든다", () => {
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

test("ERD file_path가 EQP png이면 같은 디렉터리의 data와 이력 parquet를 참조한다", () => {
  const resolved = resolveErdDataFilePath(
    "/appdata/abnormal_trend/pic_server2/erd/2026-08-25/SDWT-1/ETCH/V1/R1/A/TEMP/10@MAIN/EQP-1.png",
  )

  assert.equal(
    resolved.filePath,
    "/appdata/abnormal_trend/pic/erd/2026-08-25/SDWT-1/ETCH/V1/R1/A/TEMP/10@MAIN/data.parquet",
  )
  assert.equal(
    resolveErdHistoryFilePath(resolved.filePath, "EQP-1"),
    "/appdata/abnormal_trend/pic/erd/2026-08-25/SDWT-1/ETCH/V1/R1/A/TEMP/10@MAIN/EQP-1.parquet",
  )
})

test("ERD file_path가 data.parquet이면 중복으로 파일명을 붙이지 않는다", () => {
  assert.equal(
    resolveErdDataFilePath(
      "/appdata/abnormal_trend/pic/erd/2026-08-25/SDWT-1/ETCH/V1/R1/A/TEMP/10@MAIN/data.parquet",
    ).filePath,
    "/appdata/abnormal_trend/pic/erd/2026-08-25/SDWT-1/ETCH/V1/R1/A/TEMP/10@MAIN/data.parquet",
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

test("선택한 Line과 SDWT의 분임조별 path_xian row를 직접 사용한다", () => {
  const rows = [
    createRow({ sdwt: "RAW-1" }),
    createRow({ sdwt: "RAW-1", eqp: "EQP-2" }),
  ]
  const mapping = {
    line_mapping: { "RAW-1": "P1L" },
    sdwt_mapping: { "RAW-1": "SDWT-1" },
  }

  const scoped = scopeSelfEquipmentRows(rows, {
    line: "P1L",
    pathSdwt: "RAW-1",
    sdwt: "SDWT-1",
    mapping,
  })

  assert.equal(scoped.length, 2)
  assert.ok(scoped.every((row) => row.line_rev === "P1L"))
  assert.ok(scoped.every((row) => row.path_sdwt === "RAW-1"))
  assert.ok(scoped.every((row) => row.sdwt === "SDWT-1"))
  assert.ok(scoped.every((row) => row.ver === "V1"))
})

test("자설비 chart 경로는 분임조별 row의 path·EQP·sensor·step·ver가 모두 일치해야 한다", () => {
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
    ver: "V1",
  }

  assert.equal(isSelfEquipmentDataPathAllowed(rows, request), true)
  assert.equal(isSelfEquipmentDataPathAllowed(rows, {
    ...request,
    dataDirectoryPath: "/appdata/abnormal_trend/pic/common/2026-08-25/EQP-1",
  }), false)
  assert.equal(isSelfEquipmentDataPathAllowed(rows, { ...request, sensor: "PRESSURE" }), false)
  assert.equal(isSelfEquipmentDataPathAllowed(rows, { ...request, step: "20@MAIN" }), false)
  assert.equal(isSelfEquipmentDataPathAllowed(rows, { ...request, ver: "V2" }), false)
  assert.equal(isSelfEquipmentDataPathAllowed(rows, { ...request, eqp: "EQP-2" }), false)
  assert.equal(isSelfEquipmentDataPathAllowed(rows, {
    ...request,
    latestDate: "2026-08-24",
  }), false)
})

test("Self chart authorization은 선택한 분임조별 path_xian row만 허용한다", async () => {
  const teamRows = [createRow({
    sdwt: "RAW-1",
    eqp: "EQP-1",
    latest_date: "2026-08-25",
    file_path: "/appdata/abnormal_trend/pic/self/2026-08-25/EQP-1",
  })]
  const dependencies = {
    readRows: async () => ({ rows: teamRows }),
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
    ver: "V1",
  }, dependencies), true)
  assert.equal(await authorizeSelfEquipmentDataPath({
    dataDirectoryPath: "/appdata/abnormal_trend/pic/common/2026-08-25/EQP-1",
    eqp: "EQP-1",
    latestDate: "2026-08-25",
    line: "P1L",
    pathSdwt: "RAW-1",
    sensor: "TEMP",
    step: "10@MAIN",
    ver: "V1",
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
    "http://localhost/api/erd-scatter-data?path=/appdata/abnormal_trend/pic/common/2026-08-25/EQP-1&eqp=EQP-1&sensor=TEMP&chStep=10%40MAIN&ver=V1&latestDate=2026-08-25&line=P1L&pathSdwt=RAW-1",
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
  assert.equal(authorizationRequest.ver, "V1")
})

test("SKIP LIST Scatter와 동일성 chart는 전달된 ERD file_path를 그대로 읽는다", async () => {
  let normalAuthorizationCalled = false
  const readRequests = []
  const imagePath = "/appdata/abnormal_trend/pic/erd_xian/2026-07-16/SDWT-1/ETCH/V1/R1/A/TEMP/10@MAIN/EQP-1.png"

  for (const mode of ["scatter", "identity"]) {
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
      `http://localhost/api/erd-scatter-data?path=${encodeURIComponent(imagePath)}&eqp=EQP-1&sensor=TEMP&chStep=10%40MAIN&mode=${mode}&pathSdwt=__SKIP_LIST__`,
    )

    await handleErdScatterDataRequest({ method: "GET" }, response, url, {
      authorizeDataPath: async () => {
        normalAuthorizationCalled = true
        return false
      },
      readScatterData: async (filePath, options) => {
        readRequests.push({ filePath, options })
        return {
          axisColumn: "TEMP_10@MAIN",
          equipmentColumn: "eqp",
          rows: [{
            act_time: "2026-07-16 01:00:00",
            eqp: "EQP-1",
            eqp_cb: "EQP-1",
            "TEMP_10@MAIN": 1,
          }],
        }
      },
      readHistoryData: async () => [],
    })

    assert.equal(response.statusCode, 200)
  }

  assert.equal(normalAuthorizationCalled, false)
  assert.deepEqual(readRequests.map((request) => request.filePath), [
    "/appdata/abnormal_trend/pic/erd_xian/2026-07-16/SDWT-1/ETCH/V1/R1/A/TEMP/10@MAIN/data.parquet",
    "/appdata/abnormal_trend/pic/erd_xian/2026-07-16/SDWT-1/ETCH/V1/R1/A/TEMP/10@MAIN/data.parquet",
  ])
  assert.deepEqual(readRequests.map((request) => request.options.identity), [undefined, true])
})

test("SKIP LIST 직접 읽기는 ERD root 밖의 경로를 거부한다", () => {
  assert.equal(isDirectSkipListErdPathAllowed(
    "/appdata/abnormal_trend/pic/erd_xian/2026-07-16/chart.png",
  ), true)
  assert.equal(isDirectSkipListErdPathAllowed(
    "/appdata/abnormal_trend/pic/erd/2026-07-16/chart.png",
  ), false)
})

test("RECIPE_ID 필터는 분임조별 table의 recipe_id를 사용하고 desc·ver를 보존한다", () => {
  const row = createRow({ desc: "ETCH", ver: "V7", recipe_id: "TEAM-RECIPE", step: "TEAM-STEP" })
  const payload = buildSelfEquipmentPayload([row], {
    line: "P1L",
    pathSdwt: "SDWT-1",
    sdwt: "SDWT-1",
    priorities: ["A"],
    desc: "TEAM-RECIPE",
    eqpCh: "",
    sensor: "",
    chStep: "",
  })

  assert.deepEqual(payload.steps.map((item) => item.desc), ["TEAM-RECIPE"])
  assert.equal(payload.filters.desc, "TEAM-RECIPE")
  assert.equal(payload.rows.length, 0)
})

test("PRC_Group 필터는 결합된 prc_group으로 이후 eqp 후보를 제한한다", () => {
  const rows = [
    createRow({ eqp: "EQP-1.png", recipe_id: "R1", prc_group: "ETCH" }),
    createRow({ eqp: "EQP-2.png", recipe_id: "R2", prc_group: "CLEAN" }),
  ]
  const payload = buildSelfEquipmentPayload(rows, {
    line: "P1L",
    pathSdwt: "SDWT-1",
    sdwt: "SDWT-1",
    priorities: ["A"],
    prcGroup: "ETCH",
    desc: "",
    eqpCh: "",
    sensor: "",
    chStep: "",
  })

  assert.deepEqual(payload.prcGroups.map((item) => item.prcGroup), ["CLEAN", "ETCH"])
  assert.equal(payload.filters.prcGroup, "ETCH")
  assert.deepEqual(payload.eqpChannels.map((item) => item.eqpCh), ["EQP-1.png"])
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
