import assert from "node:assert/strict"
import test from "node:test"
import { parseEnv } from "node:util"
import { getDefectFailListPath, resolveDefectFailListPath } from "./defectSpiderConfig.mjs"
import { buildDefectFilters, handleDefectFiltersRequest, handleDefectFileRequest, scopeDefectRows, selectDefectRows } from "./defectSpiderData.mjs"
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
const environment = { DEFECT_SPIDER_LINE_DEVICES: JSON.stringify({ L1: "DEVICE-A", L2: "DEVICE-B" }) }
const dependencies = {
  readMapping: async () => mapping,
  readRows: async () => rows,
  resolvePath: (line) => resolveDefectFailListPath(line, environment),
}
function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers) },
    end(body) { this.body = JSON.parse(body) },
  }
}

test("선택한 Line에 종속된 device로 경로를 만들고 서버 환경변수가 우선한다", () => {
  assert.equal(resolveDefectFailListPath("L1", environment), "/appdata/abnormal_trend/pic/defect/L1/DEVICE-A/fail_list.parquet")
  assert.equal(resolveDefectFailListPath("L2", environment), "/appdata/abnormal_trend/pic/defect/L2/DEVICE-B/fail_list.parquet")
  assert.equal(getDefectFailListPath("L2", environment), resolveDefectFailListPath("L2", environment))
})

test("정상 JSON은 .env와 작은따옴표가 남은 서버 환경변수 모두에서 처리한다", () => {
  const value = `'${JSON.stringify({ "라인명": "디바이스" })}'`
  const envFile = parseEnv(`DEFECT_SPIDER_LINE_DEVICES=${value}`)
  const expected = "/appdata/abnormal_trend/pic/defect/라인명/디바이스/fail_list.parquet"
  assert.equal(resolveDefectFailListPath("라인명", envFile), expected)
  assert.equal(resolveDefectFailListPath("라인명", { DEFECT_SPIDER_LINE_DEVICES: value }), expected)
})

test("설정 오류는 JSON 문법·타입·Line 누락·device·경로 문제를 구분한다", () => {
  const check = (value, pattern) => assert.throws(() => resolveDefectFailListPath("L1", {
    DEFECT_SPIDER_LINE_DEVICES: value,
  }), pattern)
  check("", /설정값이 비어/)
  check('{"L1":}', /JSON 문법/)
  check("[]", /JSON 객체/)
  check('{"L2":"DEVICE-B"}', /Line "L1"의 device가 등록되지/)
  check('{"L1":""}', /비어 있지 않은 문자열/)
  check('{"L1":"A/B"}', /폴더 이름/)
  assert.throws(() => getDefectFailListPath("L3", environment), /서버 환경변수가.*우선 적용/)
})

test("미설정 Line, 잘못된 JSON·device·경로는 다른 Line으로 대체하지 않고 거부한다", () => {
  const invalid = { code: "DEFECT_CONFIG_INVALID" }
  assert.throws(() => resolveDefectFailListPath("L3", environment), invalid)
  assert.throws(() => resolveDefectFailListPath("L1", {}), invalid)
  for (const value of ["invalid", "null", "[]", '"text"', '{"L1": []}', '{"L1": 123}']) {
    assert.throws(() => resolveDefectFailListPath("L1", { DEFECT_SPIDER_LINE_DEVICES: value }), invalid)
  }
  for (const value of ["", "..", ".", "A/B", "A\\B", "A\0B"]) {
    assert.throws(() => resolveDefectFailListPath("L1", {
      DEFECT_SPIDER_LINE_DEVICES: JSON.stringify({ L1: value }),
    }), invalid)
    assert.throws(() => resolveDefectFailListPath(value, {
      DEFECT_SPIDER_LINE_DEVICES: JSON.stringify({ [value]: "DEVICE-A" }),
    }), invalid)
  }
})

test("API는 선택한 Line의 device 파일을 읽는다", async () => {
  for (const [line, pathSdwt, device] of [["L1", "RAW-A", "DEVICE-A"], ["L2", "RAW-C", "DEVICE-B"]]) {
    const res = response()
    let actualPath
    await handleDefectFiltersRequest({ method: "GET" }, res,
      new URL(`http://localhost/api/defect-filters?line=${line}&pathSdwt=${pathSdwt}`), {
        ...dependencies, readRows: async (filePath) => { actualPath = filePath; return rows },
      })
    assert.equal(res.status, 200)
    assert.equal(actualPath, `/appdata/abnormal_trend/pic/defect/${line}/${device}/fail_list.parquet`)
    assert.equal(res.body.source_path, actualPath)
  }
})

test("Line의 device가 미설정이면 파일을 읽지 않고 설정 오류를 표시한다", async () => {
  const res = response()
  await handleDefectFiltersRequest({ method: "GET" }, res,
    new URL("http://localhost/api/defect-filters?line=L1&pathSdwt=RAW-A"), {
      ...dependencies,
      resolvePath: (line) => resolveDefectFailListPath(line, {}),
      readRows: () => assert.fail("must not read files"),
    })
  assert.equal(res.status, 503)
  assert.match(res.body.error, /DEFECT_SPIDER_LINE_DEVICES/)
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
  assert.deepEqual(res.body, { files: [], source_path: resolveDefectFailListPath("L1", environment), filters: { prc_group: ["CLEAN", "ETCH"], main_seq: ["2", "10"], met_seq: ["2"] } })
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
  assert.equal(res.body.source_path, resolveDefectFailListPath("L1", environment))
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
  { sdwt: "TEAM-A", prc_group: "ETCH", main_seq: "10", met_seq: "20", path: "/fixture/fail_dir/fail_1.parquet" },
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
      readFile: async (path) => { readPath = path; return { row_count: 3, columns: ["x", "y"] } },
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

test("PM이력은 허용된 FAIL의 eqp_ch에만 연결하고 ALL·허용되지 않은 파일에서는 읽지 않는다", async () => {
  const { buildDefectPmHistory } = await import("./defectPmHistory.mjs")
  const history = buildDefectPmHistory([
    { asset: "XXXX12-YY", inprt_dt: "2026-10-01", work_type: "PM" },
    { asset: "OTHER1-AA", inprt_dt: "2026-10-01", work_type: "PM" },
  ], ["asset", "inprt_dt", "work_type"])
  for (const filePath of [fileRows[0].path, "/fixture/fail_dir/all_1.parquet", "/fixture/fail_other.parquet"]) {
    let pmReads = 0
    const res = response()
    const params = new URLSearchParams({ line: "L1", pathSdwt: "RAW-A", prcGroup: "ETCH", mainSeq: "10", metAll: "1", filePath })
    await handleDefectFileRequest({ method: "GET" }, res, new URL(`http://localhost/api/defect-file?${params}`), {
      ...dependencies, readRows: async () => fileRows,
      readFile: async () => ({ points: [], eqp_ch_groups: [{ eqp_ch: "XXXX12_YY" }] }),
      readPmHistory: async () => { pmReads += 1; return history },
    })
    assert.equal(pmReads, filePath === fileRows[0].path ? 1 : 0)
    if (pmReads) {
      assert.equal(res.status, 200)
      assert.equal(res.body.pm_history.rows.length, 1)
      assert.equal(res.body.pm_history.rows[0].raw.asset, "XXXX12-YY")
      assert.equal(res.body.pm_history.source_path, "/appdata/abnormal_trend/pic/xian_change_point/pm_code_info.parquet")
    } else assert.equal(res.body.pm_history, undefined)
  }
})

test("변경점 파일 실패는 산점도 로드를 막지 않으며 내부 오류 상세는 숨긴다", async () => {
  const res = response()
  const params = new URLSearchParams({ line: "L1", pathSdwt: "RAW-A", prcGroup: "ETCH", mainSeq: "10", metAll: "1", filePath: fileRows[0].path })
  const points = [{ eqp_ch: "X_Y", tkout_time: 1, fab_value: 2 }]
  await handleDefectFileRequest({ method: "GET" }, res, new URL(`http://localhost/api/defect-file?${params}`), {
    ...dependencies, readRows: async () => fileRows,
    readFile: async () => ({ points, eqp_ch_groups: [{ eqp_ch: "X_Y" }] }),
    readPmHistory: async () => { throw new Error("private details") },
  })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.points, points)
  assert.match(res.body.pm_history.error, /변경점 파일/)
  assert.equal(res.body.pm_history.source_path, "/appdata/abnormal_trend/pic/xian_change_point/pm_code_info.parquet")
  assert.doesNotMatch(res.body.pm_history.error, /private/)
})
