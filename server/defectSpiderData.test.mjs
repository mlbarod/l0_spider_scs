import assert from "node:assert/strict"
import test from "node:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildDefectFilters, handleDefectFiltersRequest, handleDefectFileRequest, handleDefectMapRequest, locateDefectMapWafers, mainSeqNumber, readDefectMapWafers, scopeDefectRows, selectDefectMapWafers, selectDefectRows } from "./defectSpiderData.mjs"
import { buildDefectFilePairs } from "./defectFiles.mjs"
import { blockDisabledDataRequest } from "./dataConnections.mjs"

const rows = [
  { sdwt: "TEAM-A", prc_group: "ETCH", main_seq: 10, met_seq: 2, eqpid: "E1", path: "/example/a" },
  { sdwt: "TEAM-A", prc_group: "ETCH", main_seq: 10, met_seq: 2, eqpid: "E2", path: "/example/b" },
  { sdwt: "TEAM-A", prc_group: "ETCH", main_seq: 2, met_seq: 0, eqpid: "E3", path: "/example/c" },
  { sdwt: "RAW-A", prc_group: "CLEAN", main_seq: 10, met_seq: 9 },
  { sdwt: "TEAM-B", prc_group: "OTHER-TEAM", main_seq: 10, met_seq: 99 },
  { sdwt: "TEAM-A", prc_group: null, main_seq: null, met_seq: null },
]
const mapping = { line_mapping: { "RAW-A": "L1", "RAW-B": "L1", "RAW-C": "L2" }, sdwt_mapping: { "RAW-A": "TEAM-A", "RAW-B": "TEAM-B" } }
const listPath = "/appdata/abnormal_trend/pic/defect/fail_list_all_scs/2026-10-31 15:30/fail_list.parquet"
const dependencies = {
  readMapping: async () => mapping,
  readRows: async () => rows,
  resolvePath: async () => listPath,
}
function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers) },
    end(body) { this.body = JSON.parse(body) },
  }
}

test("API는 Line과 무관하게 오늘의 공통 목록 파일을 읽는다", async () => {
  for (const [line, pathSdwt] of [["L1", "RAW-A"], ["L2", "RAW-C"]]) {
    const res = response()
    let actualPath
    await handleDefectFiltersRequest({ method: "GET" }, res,
      new URL(`http://localhost/api/defect-filters?line=${line}&pathSdwt=${pathSdwt}`), {
        ...dependencies, readRows: async (filePath) => { actualPath = filePath; return rows },
      })
    assert.equal(res.status, 200)
    assert.equal(actualPath, listPath)
    assert.equal(res.body.source_path, actualPath)
  }
})

test("오늘의 폴더가 없으면 파일을 읽지 않고 오류를 표시한다", async () => {
  const res = response()
  await handleDefectFiltersRequest({ method: "GET" }, res,
    new URL("http://localhost/api/defect-filters?line=L1&pathSdwt=RAW-A"), {
      ...dependencies,
      resolvePath: async () => { throw Object.assign(new Error("오늘의 이상감지 목록 폴더가 없습니다."), { code: "DEFECT_LIST_UNAVAILABLE" }) },
      readRows: () => assert.fail("must not read files"),
    })
  assert.equal(res.status, 503)
  assert.match(res.body.error, /오늘.*폴더/)
  assert.equal(res.body.source_path, "")
})

test("line 컬럼 없는 파일에서 SDWT로 제한하고 단계별 유니크값과 숫자 0을 유지한다", () => {
  const scoped = scopeDefectRows(rows, { sdwt: "TEAM-A", pathSdwt: "RAW-A" })
  assert.deepEqual(buildDefectFilters(scoped), { prc_group: ["CLEAN", "ETCH"], main_seq: [], met_seq: [] })
  assert.deepEqual(buildDefectFilters(scoped, { prcGroup: "ETCH" }), {
    prc_group: ["CLEAN", "ETCH"], main_seq: ["2", "10"], met_seq: [],
  })
  assert.deepEqual(buildDefectFilters(scoped, { prcGroup: "ETCH", mainSeq: "10" }).met_seq, ["2"])
  assert.deepEqual(buildDefectFilters(scoped, { prcGroup: "ETCH", mainSeq: "2" }).met_seq, ["0"])
  assert.deepEqual(buildDefectFilters(scoped, { prcGroup: "UNKNOWN", mainSeq: "10" }).met_seq, [])
  assert.deepEqual(buildDefectFilters([]), { prc_group: [], main_seq: [], met_seq: [] })
})

test("파일에 line 컬럼이 남아 있어도 값과 무관하게 SDWT만 적용한다", () => {
  const withLine = rows.map((row) => ({ ...row, line: "IGNORED-LINE" }))
  const scope = { sdwt: "TEAM-A", pathSdwt: "RAW-A" }
  assert.deepEqual(buildDefectFilters(scopeDefectRows(withLine, scope)), {
    prc_group: ["CLEAN", "ETCH"], main_seq: [], met_seq: [],
  })
})

test("API는 매핑 범위 내 후보만 반환하고 eqpid·path를 노출하지 않는다", async () => {
  const res = response()
  await handleDefectFiltersRequest({ method: "GET" }, res,
    new URL("http://localhost/api/defect-filters?line=L1&pathSdwt=RAW-A&prcGroup=ETCH&mainSeq=10"), dependencies)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { files: [], source_path: listPath, filters: { prc_group: ["CLEAN", "ETCH"], main_seq: ["2", "10"], met_seq: ["2"] } })
})

test("잘못된 Line·SDWT 조합은 파일 조회 전에 거부한다", async () => {
  const res = response()
  await handleDefectFiltersRequest({ method: "GET" }, res,
    new URL("http://localhost/api/defect-filters?line=L2&pathSdwt=RAW-A"), {
      ...dependencies, readRows: () => assert.fail("must not read files"),
    })
  assert.equal(res.status, 400)
})

test("파일 읽기 오류에도 실제 시도 경로를 반환하고 내부 오류 상세는 숨긴다", async () => {
  const res = response()
  await handleDefectFiltersRequest({ method: "GET" }, res,
    new URL("http://localhost/api/defect-filters?line=L1&pathSdwt=RAW-A"), {
      ...dependencies, readRows: () => { throw new Error("ENOENT /private/example") },
    })
  assert.equal(res.status, 503)
  assert.doesNotMatch(res.body.error, /private/)
  assert.equal(res.body.source_path, listPath)
})

test("Defect 조회 gate는 GET만 기본 허용하고 명시적으로 차단 가능하다", () => {
  const req = { method: "GET", url: "/api/defect-filters" }
  assert.equal(blockDisabledDataRequest(req, response(), {}, () => {}, () => false), false)
  assert.equal(blockDisabledDataRequest(req, response(), { SCS_DEFECT_DATA_ENABLED: "0" }, () => {}, () => false), true)
  assert.equal(blockDisabledDataRequest({ ...req, method: "POST" }, response(), {}, () => {}, () => false), true)
})

test("API는 GET 외 메서드를 거부한다", async () => {
  const res = response()
  await handleDefectFiltersRequest({ method: "POST" }, res, new URL("http://localhost/api/defect-filters"), dependencies)
  assert.equal(res.status, 405)
  assert.equal(res.headers.Allow, "GET")
})

const fileRows = [
  { sdwt: "TEAM-A", prc_group: "ETCH", main_seq: "10", met_seq: "20", eqpid: "XXXX12_YY", path: "/fixture/fail_dir/fail_1.parquet" },
  { sdwt: "TEAM-A", prc_group: "ETCH", main_seq: "11", met_seq: "21", path: "/fixture/fail_2.parquet" },
  { sdwt: "TEAM-B", prc_group: "ETCH", main_seq: "10", met_seq: "20", path: "/fixture/fail_other.parquet" },
]

test("main_seq ALL은 PRC_Group 내 met_seq 전체를, met_seq ALL은 현재 main 범위만 선택한다", () => {
  const scoped = scopeDefectRows(fileRows, { sdwt: "TEAM-A", pathSdwt: "RAW-A" })
  assert.deepEqual(buildDefectFilters(scoped, { prcGroup: "ETCH", mainAll: true }).met_seq, ["20", "21"])
  assert.equal(selectDefectRows(scoped, { prcGroup: "ETCH", mainAll: true, metAll: true }).length, 2)
  assert.equal(selectDefectRows(scoped, { prcGroup: "ETCH", mainSeq: "10", metAll: true }).length, 1)
  assert.equal(selectDefectRows(scoped, { prcGroup: "ETCH", mainAll: true, metSeq: "21" })[0].main_seq, "11")
  assert.deepEqual(selectDefectRows(scoped, { prcGroup: "ETCH", mainAll: true }), [])
})

test("path를 그대로 표시하고 파일명 접두사 fail_만 all_로 바꾸며 중복은 한 번만 로드한다", () => {
  const pairs = buildDefectFilePairs([fileRows[0], fileRows[0]])
  assert.deepEqual(pairs, [{ path: fileRows[0].path, main_seq: "10", met_seq: "20", fail_path: fileRows[0].path,
    all_path: "/fixture/fail_dir/all_1.parquet", error: "" }])
  for (const path of ["", "/fixture/other.parquet", "relative/fail_1.parquet", "/fixture/../fail_1.parquet"]) {
    const [pair] = buildDefectFilePairs([{ path }])
    assert.equal(pair.path, path)
    assert.equal(pair.fail_path, "")
    assert.equal(pair.all_path, "")
    assert.ok(pair.error)
  }
})

test("필터 API는 ALL 조건의 경로 쌍을 반환하고 다른 SDWT의 파일을 제외한다", async () => {
  const res = response()
  await handleDefectFiltersRequest({ method: "GET" }, res,
    new URL("http://localhost/api/defect-filters?line=L1&pathSdwt=RAW-A&prcGroup=ETCH&mainAll=1&metAll=1"),
    { ...dependencies, readRows: async () => fileRows })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.files, buildDefectFilePairs(fileRows.slice(0, 2)))
})

test("파일 API는 현재 범위의 fail과 all을 모두 읽고 임의 파일·다른 SDWT는 거부한다", async () => {
  for (const [filePath, status] of [[fileRows[0].path, 200], ["/fixture/fail_dir/all_1.parquet", 200],
    ["/fixture/fail_other.parquet", 400], ["/etc/passwd", 400], ["/fixture/fail_2.parquet", 400]]) {
    const res = response()
    let readPath
    const params = new URLSearchParams({ line: "L1", pathSdwt: "RAW-A", prcGroup: "ETCH", mainSeq: "10", metAll: "1", filePath })
    await handleDefectFileRequest({ method: "GET" }, res, new URL(`http://localhost/api/defect-file?${params}`), {
      ...dependencies, readRows: async () => fileRows,
      readFile: async (path) => { readPath = path; return { row_count: 3, columns: ["x", "y"], eqp_ch_groups: [{ eqp_ch: "XXXX12_YY", row_count: 3 }] } },
    })
    assert.equal(res.status, status)
    assert.equal(readPath, status === 200 ? filePath : undefined)
    if (status === 200) assert.equal(res.body.row_count, 3)
  }
})

test("파일 누락 오류를 해당 파일에만 반환한다", async () => {
  const res = response()
  const params = new URLSearchParams({ line: "L1", pathSdwt: "RAW-A", prcGroup: "ETCH", mainAll: "1", metAll: "1", filePath: fileRows[0].path })
  await handleDefectFileRequest({ method: "GET" }, res, new URL(`http://localhost/api/defect-file?${params}`), {
    ...dependencies, readRows: async () => fileRows,
    readFile: async () => { throw Object.assign(new Error("private detail"), { code: "ENOENT" }) },
  })
  assert.equal(res.status, 503)
  assert.equal(res.body.error, "파일이 없습니다.")
})

test("FAIL은 파일·SDWT·PRC·단계별 eqpid로 제한하고 ALL은 원본 전체를 반환한다", async () => {
  const first = { ...fileRows[0], eqpid: "EQ01" }
  const list = [
    first, { ...first, eqpid: "EQ02" },
    { ...first, eqpid: "EQ03", main_seq: "11" },
    { ...first, eqpid: "EQ04", sdwt: "TEAM-B" },
    { ...first, eqpid: "EQ05", prc_group: "CLEAN" },
    { ...first, eqpid: "EQ06", met_seq: "21" },
    { ...first, eqpid: "EQ07", path: "/fixture/fail_other.parquet" },
  ]
  const eqps = ["EQ01", "EQ01_A", "EQ02", "EQ03", "EQ04", "EQ05", "EQ06", "EQ07"]
  const summary = {
    row_count: eqps.length, columns: ["eqp_ch", "tkout_time", "fab_value"],
    eqp_ch_groups: eqps.map((eqp_ch) => ({ eqp_ch, row_count: 1 })),
    points: eqps.map((eqp_ch) => ({ eqp_ch, tkout_time: 1, fab_value: 2 })),
    invalid_point_count: 0, unassigned_row_count: 0,
  }
  const original = structuredClone(summary)
  for (const [filePath, mainSeq, expected] of [
    [first.path, "10", ["EQ01", "EQ02"]],
    [first.path, "11", ["EQ03"]],
    ["/fixture/fail_dir/all_1.parquet", "10", eqps],
  ]) {
    const res = response()
    const params = new URLSearchParams({ line: "L1", pathSdwt: "RAW-A", prcGroup: "ETCH", mainSeq, metSeq: "20", filePath })
    await handleDefectFileRequest({ method: "GET" }, res, new URL(`http://localhost/api/defect-file?${params}`), {
      ...dependencies, readRows: async () => list,
      readFile: async () => summary,
      readPmHistory: async () => ({ columns: [], byEquipment: new Map() }),
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.points.map((point) => point.eqp_ch), expected)
    assert.deepEqual(res.body.eqp_ch_groups.map((group) => group.eqp_ch), expected)
    assert.equal(res.body.row_count, expected.length)
    if (filePath.includes("/all_")) assert.deepEqual(res.body, { source_path: filePath, ...original })
    assert.deepEqual(summary, original)
  }
})

test("변환된 FAIL·ALL 경로를 실제 읽기에 전달하고 FAIL의 eqpid 필터를 유지한다", async () => {
  const sourcePath = "/appdata/hadoop/code/eads/P1L/DEVICE_A/fail_1.parquet"
  const failPath = "/appdata/abnormal_trend/pic/defect/P1L/DEVICE_A/fail_1.parquet"
  const allPath = "/appdata/abnormal_trend/pic/defect/P1L/DEVICE_A/all_1.parquet"
  const points = ["EQ01", "EQ02"].map((eqp_ch) => ({ eqp_ch, tkout_time: 1, fab_value: 2 }))
  const summary = { points, eqp_ch_groups: points.map(({ eqp_ch }) => ({ eqp_ch, row_count: 1 })), row_count: 2 }
  const reads = []
  const deps = {
    ...dependencies,
    readRows: async () => [{ ...fileRows[0], path: sourcePath, eqpid: "EQ01" }],
    readFile: async (path) => { reads.push(path); return summary },
    readPmHistory: async () => ({ columns: [], byEquipment: new Map() }),
  }
  const params = new URLSearchParams({ line: "L1", pathSdwt: "RAW-A", prcGroup: "ETCH", mainSeq: "10", metSeq: "20" })
  const filters = response()
  await handleDefectFiltersRequest({ method: "GET" }, filters, new URL(`http://localhost/api/defect-filters?${params}`), deps)
  assert.equal(filters.status, 200)
  assert.equal(filters.body.files[0].fail_path, failPath)
  assert.equal(filters.body.files[0].all_path, allPath)
  for (const filePath of [failPath, allPath, sourcePath]) {
    params.set("filePath", filePath)
    const res = response()
    await handleDefectFileRequest({ method: "GET" }, res, new URL(`http://localhost/api/defect-file?${params}`), deps)
    assert.equal(res.status, filePath === sourcePath ? 400 : 200)
    if (filePath === failPath) {
      assert.equal(res.body.source_path, failPath)
      assert.deepEqual(res.body.points, [points[0]])
      assert.deepEqual(res.body.eqp_ch_groups, [{ eqp_ch: "EQ01", row_count: 1 }])
    }
    if (filePath === allPath) assert.deepEqual(res.body, { source_path: allPath, ...summary })
  }
  assert.deepEqual(reads, [failPath, allPath])
})

test("PM이력은 허용된 FAIL의 eqp_ch에만 연결하고 ALL·허용되지 않은 파일에서는 읽지 않는다", async () => {
  const { buildDefectPmHistory } = await import("./defectPmHistory.mjs")
  const history = buildDefectPmHistory([
    { asset: "XXXX12-YY", inprg_dt: "2026-10-01", work_type: "PM" },
    { asset: "OTHER1-AA", inprg_dt: "2026-10-01", work_type: "PM" },
  ], ["asset", "inprg_dt", "work_type"])
  for (const filePath of [fileRows[0].path, "/fixture/fail_dir/all_1.parquet", "/fixture/fail_other.parquet"]) {
    let pmReads = 0
    const res = response()
    const params = new URLSearchParams({ line: "L1", pathSdwt: "RAW-A", prcGroup: "ETCH", mainSeq: "10", metAll: "1", filePath })
    await handleDefectFileRequest({ method: "GET" }, res, new URL(`http://localhost/api/defect-file?${params}`), {
      ...dependencies, readRows: async () => fileRows,
      readFile: async () => ({ points: [], eqp_ch_groups: [{ eqp_ch: "XXXX12_YY", row_count: 1 }] }),
      readPmHistory: async () => { pmReads += 1; return history },
    })
    assert.equal(pmReads, filePath === fileRows[0].path ? 1 : 0)
    if (pmReads) {
      assert.equal(res.status, 200)
      assert.equal(res.body.pm_history.rows.length, 1)
      assert.equal(res.body.pm_history.rows[0].raw.asset, "XXXX12-YY")
      assert.equal(res.body.pm_history.source_path, "/appdata/abnormal_trend/pic/xian_change_point/pm_code_info.parquet")
      assert.deepEqual(res.body.pm_history.source_paths, ["/appdata/abnormal_trend/pic/xian_change_point/pm_code_info.parquet", "/appdata/abnormal_trend/pic/xian_change_point/mnu_code_info.parquet"])
    } else assert.equal(res.body.pm_history, undefined)
  }
})

test("변경점 파일 실패는 산점도 로드를 막지 않으며 내부 오류 상세는 숨긴다", async () => {
  const res = response()
  const params = new URLSearchParams({ line: "L1", pathSdwt: "RAW-A", prcGroup: "ETCH", mainSeq: "10", metAll: "1", filePath: fileRows[0].path })
  const points = [{ eqp_ch: "XXXX12_YY", tkout_time: 1, fab_value: 2 }]
  await handleDefectFileRequest({ method: "GET" }, res, new URL(`http://localhost/api/defect-file?${params}`), {
    ...dependencies, readRows: async () => fileRows,
    readFile: async () => ({ points, eqp_ch_groups: [{ eqp_ch: "XXXX12_YY", row_count: 1 }] }),
    readPmHistory: async () => { throw new Error("private details") },
  })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.points, points)
  assert.match(res.body.pm_history.error, /변경점 파일/)
  assert.equal(res.body.pm_history.source_path, "/appdata/abnormal_trend/pic/xian_change_point/pm_code_info.parquet")
  assert.doesNotMatch(res.body.pm_history.error, /private/)
})

test("두 API는 step 값을 목록 경로 결정에 전달한다", async () => {
  const steps = []
  const resolvePath = async (_line, { step }) => { steps.push(step); return listPath }
  for (const query of ["", "&step=depo"]) {
    await handleDefectFiltersRequest({ method: "GET" }, response(),
      new URL(`http://localhost/api/defect-filters?line=L1&pathSdwt=RAW-A${query}`), { ...dependencies, resolvePath })
    await handleDefectFileRequest({ method: "GET" }, response(),
      new URL(`http://localhost/api/defect-file?line=L1&pathSdwt=RAW-A${query}`), { ...dependencies, resolvePath })
  }
  assert.deepEqual(steps, ["", "", "depo", "depo"])
})

// 이상 wafer map: 차트 빨간 점과 같은 기준의 NG wafer만 고른다.
const mapPoint = (lot_wf, extra = {}) => ({ tkout_time: 1, fab_value: 1, eqp_ch: "EQ01", lot_wf, wafer_id: lot_wf.slice(-2), device: "D1", ...extra })

test("이상 wafer map은 선택 eqp_ch의 빨간 점(NG, 같은 lot/wafer 보호 포함) wafer를 한 번씩 고른다", () => {
  const points = [
    mapPoint("LOT1_01", { final_decision: "NG" }), mapPoint("LOT1_01", { final_decision: "NG" }),
    mapPoint("LOT1_02", { final_decision: "NG", step_seq: "A" }), mapPoint("LOT1_02", { final_decision: "OK", step_seq: "B" }),
    mapPoint("LOT1_03", { final_decision: "OK" }),
    mapPoint("LOT1_04", { anomaly_type: "std", std_result: "NG" }),
    mapPoint("LOT1_05", { final_decision: "NG", lot_wf: "" }),
    mapPoint("LOT1_06", { final_decision: "NG", eqp_ch: "EQ02" }),
  ]
  assert.deepEqual(selectDefectMapWafers(points, "EQ01").map((wafer) => wafer.lotWf), ["LOT1_01", "LOT1_02", "LOT1_04"])
  assert.deepEqual(selectDefectMapWafers(points, "EQ01")[0], { lotWf: "LOT1_01", device: "D1", tkoutTime: 1 })
})

test("main_seq 폴더 숫자는 알파벳과 %를 뺀 값이다", () => {
  assert.equal(mainSeqNumber("U%100"), "100")
  assert.equal(mainSeqNumber("AB%%1234"), "1234")
  assert.equal(mainSeqNumber("100"), "100")
})

test("이상 wafer map 좌표 파일은 main_seq 폴더·met_seq_RANDOM_PC·진행일 범위의 날짜 폴더에서 lot_wf로 찾는다", async () => {
  const root = await mkdtemp(join(tmpdir(), "defect-locate-"))
  try {
    const met = (device, mainDir) => join(root, "L1", "defect_map", device, mainDir, "200_RANDOM_PC")
    const files = {
      [join(met("D1", "U%100"), "2026-11-19")]: ["W0"],
      [join(met("D1", "U%100"), "2026-11-20")]: ["W1"],
      [join(met("D1", "U%100"), "2026-11-21")]: ["W1", "W2"],
      [join(met("D1", "U%100"), "2026-11-30")]: ["W3"],
      [join(met("D1", "U%1000"), "2026-11-20")]: ["W4"],
      [join(root, "L1", "defect_map", "D1", "U%100", "200", "2026-11-20")]: ["W5"],
      [join(met("D2", "X%100"), "2026-11-20")]: ["W6"],
    }
    const lotWfs = new Map()
    for (const [dir, values] of Object.entries(files)) {
      await mkdir(dir, { recursive: true })
      const path = join(dir, "100_measure_data_xy.parquet")
      await writeFile(path, "")
      lotWfs.set(path, new Set(values))
    }
    const reads = []
    const readLotWfs = async (path) => { reads.push(path); return lotWfs.get(path) }
    const at = (date) => Date.parse(`${date}T10:00:00Z`)
    const wafers = [
      { lotWf: "W1", device: "D1", tkoutTime: at("2026-11-20") }, { lotWf: "W2", device: "D1", tkoutTime: at("2026-11-20") },
      { lotWf: "W0", device: "D1", tkoutTime: at("2026-11-20") }, { lotWf: "W3", device: "D1", tkoutTime: at("2026-11-20") },
      { lotWf: "W4", device: "D1", tkoutTime: at("2026-11-20") }, { lotWf: "W5", device: "D1", tkoutTime: at("2026-11-20") },
      { lotWf: "W6", device: "", tkoutTime: at("2026-11-20") },
      { lotWf: "W7", device: "D9", tkoutTime: at("2026-11-20") }, { lotWf: "W8", device: "D1", tkoutTime: at("2026-10-01") },
    ]
    const result = await locateDefectMapWafers(wafers, { line: "L1", mainSeq: "100", metSeq: "200" }, { root, readLotWfs })
    const file = (device, mainDir, date) => join(met(device, mainDir), date, "100_measure_data_xy.parquet")
    // W0: 하루 전 폴더, W1: 가장 이른 날짜 파일, W3: 7일 뒤 범위 밖, W4: 숫자가 다른 main_seq 폴더, W5: _RANDOM_PC가 없는 폴더, W6: device가 없으면 모든 device에서 찾는다.
    assert.deepEqual(result.wafers, [
      { lotWf: "W1", device: "D1", path: file("D1", "U%100", "2026-11-20") },
      { lotWf: "W2", device: "D1", path: file("D1", "U%100", "2026-11-21") },
      { lotWf: "W0", device: "D1", path: file("D1", "U%100", "2026-11-19") },
      { lotWf: "W6", device: "D2", path: file("D2", "X%100", "2026-11-20") },
    ])
    assert.equal(reads.includes(file("D1", "U%100", "2026-11-30")), false)
    // W3·W4·W5: 파일은 읽었지만 lot_wf 없음. W7: device 폴더 없음, W8: 범위 안 날짜 폴더 없음 -> 찾아본 경로를 남긴다.
    assert.deepEqual({ ...result, wafers: undefined }, {
      wafers: undefined, notFound: 2, lotWfMismatch: 3, missingPathTotal: 2,
      missingPaths: [
        { path: join(met("D1", "U%100"), "{yyyy-mm-dd}", "100_measure_data_xy.parquet"), from: "2026-09-30", to: "2026-10-08" },
        { path: join(root, "L1", "defect_map", "D9", "*100", "200_RANDOM_PC", "{yyyy-mm-dd}", "100_measure_data_xy.parquet"), from: "2026-11-19", to: "2026-11-27" },
      ],
    })
    const invalid = await locateDefectMapWafers(wafers, { line: "../L1", mainSeq: "100", metSeq: "200" }, { root, readLotWfs })
    assert.deepEqual([invalid.wafers, invalid.notFound], [[], wafers.length])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("이상 wafer map은 좌표가 없거나 읽지 못한 wafer를 빼고 같은 좌표 파일은 한 번만 읽는다", async () => {
  const base = await mkdtemp(join(tmpdir(), "defect-map-"))
  try {
    const root = join(base, "defect")
    await mkdir(root)
    const shared = join(root, "100_measure_data_xy.parquet")
    await writeFile(shared, "")
    const outside = join(base, "outside.parquet")
    await writeFile(outside, "")
    const reads = []
    const readSource = async (path) => { reads.push(path); return [
      { lot_wf: "W1", coorx: 1000, coory: -2000, tkout_time: "2026-11-20 10:00:00", root_lot_id: "R1" },
      { lot_wf: "W2", coorx: 500, coory: 500, tkout_time: "2026-11-21 10:00:00", root_lot_id: "R1" },
    ] }
    const wafers = [
      { lotWf: "W1", device: "D1", path: shared }, { lotWf: "W2", device: "D1", path: shared },
      { lotWf: "W3", device: "D1", path: shared },
      { lotWf: "W4", device: "D1", path: join(root, "missing.parquet") },
      { lotWf: "W5", device: "D1", path: outside },
    ]
    const result = await readDefectMapWafers(wafers, { mainSeq: "U%100", metSeq: "200_RANDOM_PC" }, readSource, [root])
    assert.deepEqual(reads, [shared])
    assert.deepEqual(result.map((wafer) => [wafer.lotWf, wafer.tkoutTime, wafer.xy]), [["W2", "2026-11-21 10:00:00", [5, 5]], ["W1", "2026-11-20 10:00:00", [10, -20]]])
    assert.deepEqual({ ...result[1], xy: undefined }, { lotWf: "W1", device: "D1", mainSeq: "U%100", metSeq: "200", tkoutTime: "2026-11-20 10:00:00", rootLotId: "R1", slot: "", xy: undefined, clusters: [] })
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test("이상 wafer map API는 선택 조건의 fail 파일과 eqp_ch만 받는다", async () => {
  const list = [{ ...fileRows[0], eqpid: "EQ01" }, ...fileRows.slice(1)]
  const request = (filePath, eqpCh) => new URL(`http://localhost/api/defect-map?${new URLSearchParams({ line: "L1", pathSdwt: "RAW-A", prcGroup: "ETCH", mainAll: "1", metAll: "1", filePath, eqpCh })}`)
  for (const [filePath, eqpCh, status] of [[fileRows[0].path, "EQ01", 200], [fileRows[0].path, "EQ09", 400], [fileRows[0].path, "", 400],
    ["/fixture/fail_dir/all_1.parquet", "EQ01", 400], ["/fixture/fail_other.parquet", "EQ01", 400], ["/etc/passwd", "EQ01", 400]]) {
    const res = response()
    let readPath
    await handleDefectMapRequest({ method: "GET" }, res, request(filePath, eqpCh), {
      ...dependencies, readRows: async () => list,
      readMapPoints: async (path) => { readPath = path; return [mapPoint("W1", { final_decision: "NG" })] },
      locate: { root: "/nonexistent-defect-root", readLotWfs: async () => { throw new Error("no coordinate file") } },
      readSource: async () => { throw new Error("must not read a missing coordinate file") },
    })
    assert.equal(res.status, status, `${filePath} ${eqpCh}`)
    assert.equal(readPath, status === 200 ? filePath : undefined)
    // 좌표 파일을 찾지 못한 wafer는 문구 없이 뺀다.
    if (status === 200) assert.deepEqual(res.body, { total: 1, limit: 400, wafers: [], diagnostics: {
      checked: 1, notFound: 1, lotWfMismatch: 0, noCoords: 0, missingPathTotal: 1,
      missingPaths: [{ path: "/nonexistent-defect-root/L1/defect_map/D1/*10/20_RANDOM_PC/{yyyy-mm-dd}/10_measure_data_xy.parquet", from: "1969-12-31", to: "1970-01-08" }],
    } })
  }
})
