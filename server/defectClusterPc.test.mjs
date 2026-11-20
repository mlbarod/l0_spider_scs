import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { createClusterPcService, createDefectClusterPcHandler, DEFECT_CLUSTER_PC_CONFIG, MAX_WAFERS, clusterRows, sourcePath, metSeqNumber, NO_VALUE, packPoints, formatTkout, waferInfo, historySnapshots, historyCounts, uniqueHistoryRows, parseClusters, splitValues } from "./defectClusterPc.mjs"
import { clusterFilterOptions, clusterLabel, eqpSpan, groupByEqp, groupByPrcEqp, splitEqpid } from "../src/features/fdc-trend/utils/defectClusterPc.mjs"

const url = (path) => new URL(`/api/defect-spider/cluster-pc/${path}`, "http://localhost")

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "cluster-pc-"))
  const listRoot = join(base, "fail_list_all_scs"), eads = join(base, "eads"), outside = join(base, "outside")
  for (const dir of [join(listRoot, "2026-11-17 09:00"), join(listRoot, "2026-11-18 09:00"), join(listRoot, "2026-11-18 10:00"), eads, outside]) await mkdir(dir, { recursive: true })
  // 가장 최근 폴더(10:00)에는 결과 파일이 없으므로 09:00 결과를 써야 한다.
  await writeFile(join(listRoot, "2026-11-17 09:00", "fail_list_bias_pc.parquet"), "")
  await writeFile(join(listRoot, "2026-11-18 09:00", "fail_list_bias_pc.parquet"), "")
  await writeFile(join(eads, "a.parquet"), "")
  await writeFile(join(outside, "b.parquet"), "")
  const config = { listRoot, rawRoots: [eads] }
  return { base, config, eads, outside }
}

test("met_seq는 _RANDOM_PC를 뺀 값만 쓴다", () => {
  assert.equal(metSeqNumber("200_RANDOM_PC"), "200")
  assert.equal(metSeqNumber(" 3001_random_pc "), "3001")
  assert.equal(metSeqNumber("200"), "200")
})

test("좌표는 lot_wf가 같은 행만 0.1mm 정수로 묶고 숫자가 아닌 좌표는 버린다", () => {
  const rows = [
    { lot_wf: "L1", coorx: 12345, coory: -6789 }, { lot_wf: "L2", coorx: 1, coory: 1 },
    { lot_wf: "L1", coorx: null, coory: 1 }, { lot_wf: "L1", coorx: "abc", coory: 1 }, { lot_wf: "L1", coorx: 0, coory: 150000 },
  ]
  assert.deepEqual(packPoints(rows, "L1"), [123, -68, 0, 1500])
})

test("카드 상단 정보는 wafer의 가장 늦은 tkout_time과 root_lot_id를 쓰고 slot은 lot_wf의 _ 뒤 값이다", () => {
  assert.equal(formatTkout(new Date("2026-10-01T02:03:04Z")), "2026-10-01 02:03:04")
  assert.equal(formatTkout("2026-10-01T02:03:04.123+09:00"), "2026-10-01 02:03:04")
  assert.equal(formatTkout("2026-10-01 02:03"), "2026-10-01 02:03:00")
  assert.equal(formatTkout(null), "")
  assert.equal(formatTkout("invalid"), "")
  const rows = [
    { lot_wf: "L1_05", tkout_time: "2026-10-01 02:00:00", root_lot_id: "R1" },
    { lot_wf: "L1_05", tkout_time: "2026-10-01 03:00:00", root_lot_id: "R1" },
    { lot_wf: "L2_06", tkout_time: "2026-10-02 00:00:00", root_lot_id: "R2" },
  ]
  assert.deepEqual(waferInfo(rows, "L1_05"), { tkoutTime: "2026-10-01 03:00:00", rootLotId: "R1", slot: "05" })
  assert.equal(waferInfo([], "A_B.1_12").slot, "12")
  assert.deepEqual(waferInfo([{ lot_wf: "L1" }], "L1"), { tkoutTime: "", rootLotId: "", slot: "" })
})

test("catalog은 결과가 있는 가장 최근 폴더를 읽고 파일 경로는 보내지 않는다", async () => {
  const { base, config, eads } = await fixture()
  try {
    const reads = []
    const service = createClusterPcService({
      readList: async (path) => { reads.push(path); return [{ line: "L", device: "D", sdwt: "S1,S2", prc_group: "ETCH", main_seq: "U%100", met_seq: "200_RANDOM_PC", eqpid: "EQ1", lot_wf: "W1", path: join(eads, "a.parquet") }] },
    })
    const body = await service({ method: "GET" }, url("catalog"), config)
    assert.equal(body.snapshot, "2026-11-18 09:00")
    assert.match(reads[0], /2026-11-18 09:00/)
    assert.deepEqual(body.rows, [["L", ["S1", "S2"], ["ETCH"]]])
    assert.doesNotMatch(JSON.stringify(body), /a\.parquet/)
  } finally { await rm(base, { recursive: true, force: true }) }
})

test("maps는 필터에 맞는 wafer만 읽고, 허용 폴더 밖 경로와 갱신된 결과는 거부한다", async () => {
  const { base, config, eads, outside } = await fixture()
  try {
    const list = [
      { line: "L", device: "D", sdwt: "S1", prc_group: "ETCH,CVD", main_seq: "U%100", met_seq: "200_RANDOM_PC", eqpid: "EQ1", lot_wf: "W1", path: join(eads, "a.parquet") },
      { line: "L", device: "D", sdwt: "S1", prc_group: "PHOTO", main_seq: "U%100", met_seq: "200_RANDOM_PC", eqpid: "EQ2", lot_wf: "W2", path: join(eads, "a.parquet") },
      { line: "L", device: "D", sdwt: "S2,S1", prc_group: "CVD", main_seq: "U%100", met_seq: "200_RANDOM_PC", eqpid: "EQ1", lot_wf: "W3", path: join(outside, "b.parquet") },
      { line: "M", device: "D", sdwt: "S1", prc_group: "CVD", main_seq: "U%100", met_seq: "200_RANDOM_PC", eqpid: "EQ1", lot_wf: "W4", path: join(eads, "a.parquet") },
      { line: "L", device: "D", sdwt: "S3", prc_group: "CVD", main_seq: "U%100", met_seq: "200_RANDOM_PC", eqpid: "EQ1", lot_wf: "W5", path: join(eads, "a.parquet") },
    ]
    const sourceReads = []
    const service = createClusterPcService({
      readList: async () => list,
      readSource: async (path) => { sourceReads.push(path); return [{ lot_wf: "W1", coorx: 1000, coory: 2000, tkout_time: "2026-11-18 01:02:03", root_lot_id: "R1" }, { lot_wf: "W2", coorx: -1000, coory: 0 }] },
      // 과거 7일 이력 폴더가 없는 날짜로 고정해 필터에 맞는 wafer 읽기만 센다.
      now: () => new Date(2026, 11, 31),
    })
    const params = new URLSearchParams({ snapshot: "2026-11-18 09:00", line: "L", sdwt: "S1", prcGroup: "CVD" })
    const body = await service({ method: "GET" }, url(`maps?${params}`), config)
    assert.equal(body.total, 2)
    assert.deepEqual(body.wafers.map((wafer) => [wafer.lotWf, wafer.xy, wafer.error]), [["W1", [10, 20], undefined], ["W3", [], "Path is not allowed."]])
    assert.deepEqual([body.wafers[0].tkoutTime, body.wafers[0].rootLotId, body.wafers[0].slot], ["2026-11-18 01:02:03", "R1", ""])
    assert.equal(sourceReads.length, 1)

    params.set("prcGroup", "ALL")
    const all = await service({ method: "GET" }, url(`maps?${params}`), config)
    assert.deepEqual(all.wafers.map((wafer) => wafer.lotWf), ["W1", "W2", "W3"])

    params.delete("sdwt")
    await assert.rejects(service({ method: "GET" }, url(`maps?${params}`), config), { status: 400 })
    params.set("sdwt", "S1")
    params.set("snapshot", "2026-11-17 09:00")
    await assert.rejects(service({ method: "GET" }, url(`maps?${params}`), config), { status: 410 })
    params.delete("line")
    await assert.rejects(service({ method: "GET" }, url(`maps?${params}`), config), { status: 400 })
    await assert.rejects(service({ method: "POST" }, url("catalog"), config), { status: 405 })
    await assert.rejects(service({ method: "GET" }, url("other"), config), { status: 404 })
  } finally { await rm(base, { recursive: true, force: true }) }
})

test("maps는 한 번에 최대 MAX_WAFERS매만 읽는다", async () => {
  const { base, config, eads } = await fixture()
  try {
    const list = Array.from({ length: MAX_WAFERS + 5 }, (_, i) => ({ line: "L", device: "D", main_seq: "S", met_seq: "1_RANDOM_PC", eqpid: "E", lot_wf: `W${i}`, path: join(eads, "a.parquet") }))
    const service = createClusterPcService({ readList: async () => list, readSource: async () => [] })
    const body = await service({ method: "GET" }, url(`maps?${new URLSearchParams({ snapshot: "2026-11-18 09:00", line: "L", sdwt: NO_VALUE })}`), config)
    assert.equal(body.total, MAX_WAFERS + 5)
    assert.equal(body.wafers.length, MAX_WAFERS)
  } finally { await rm(base, { recursive: true, force: true }) }
})

test("결과 폴더가 없으면 설정 대기 상태로 응답한다", async () => {
  const service = createClusterPcService({ readList: async () => [] })
  const body = await service({ method: "GET" }, url("catalog"), { listRoot: join(tmpdir(), "cluster-pc-missing-root"), rawRoots: [] })
  assert.deepEqual(body, { ok: true, configured: false, snapshot: "", rows: [] })
})

test("sdwt, prc_group은 쉼표로 나누고 빈 값은 NO_VALUE로 둔다", () => {
  assert.deepEqual(splitValues("S1, S2,S1"), ["S1", "S2"])
  assert.deepEqual(splitValues(null), [NO_VALUE])
  assert.deepEqual(splitValues(" "), [NO_VALUE])
})

test("필터 선택지는 위쪽 선택값으로 좁히고, wafer는 EQPID별로 묶는다", () => {
  const rows = [["L", ["S1"], ["ETCH", "CVD"]], ["L", ["S2", "S1"], ["PHOTO"]], ["L", ["S3"], ["DIFF"]], ["M", ["S9"], ["CMP"]]]
  assert.deepEqual(clusterFilterOptions(rows, { line: "L", sdwt: "S1", prcGroup: "ALL" }),
    { line: ["L", "M"], sdwt: ["S1", "S2", "S3"], prcGroup: ["CVD", "ETCH", "PHOTO"] })
  assert.deepEqual(clusterFilterOptions(rows, { line: "L", sdwt: "", prcGroup: "ALL" }).prcGroup, ["CVD", "DIFF", "ETCH", "PHOTO"])
  const groups = groupByEqp([{ eqpid: "E2", lotWf: "W10", metSeq: "1" }, { eqpid: "E1", lotWf: "W2", metSeq: "1" }, { eqpid: "E2", lotWf: "W9", metSeq: "1" }, { eqpid: "", lotWf: "W1", metSeq: "1" }])
  assert.deepEqual(groups.map(([key, list]) => [key, list.map((wafer) => wafer.lotWf)]), [["(No EQPID)", ["W1"]], ["E1", ["W2"]], ["E2", ["W9", "W10"]]])
})

test("clusters 컬럼은 숫자를 검증해 화면용으로 바꾸고, 없거나 깨진 값은 빈 배열로 둔다", () => {
  const raw = JSON.stringify([
    { r: 1.5, x: 124.55, y: -21.32, k: 5, zone: "sector", zone_ratio: 3.5, hit: true, deg: 350.3, width: 45 },
    { r: 25, x: 10, y: 5, k: 12, zone: "ring", zone_ratio: 2.1, hit: false, zone_r: 53.03 },
    { r: "x", x: 1, y: 1 },
  ])
  assert.deepEqual(parseClusters(raw), [
    { r: 1.5, x: 124.55, y: -21.32, k: 5, zoneRatio: 3.5, hit: true, zone: "sector", deg: 350.3, width: 45 },
    { r: 25, x: 10, y: 5, k: 12, zoneRatio: 2.1, hit: false, zone: "ring", zoneR: 53.03 },
  ])
  assert.deepEqual(parseClusters(undefined), [])
  assert.deepEqual(parseClusters("{broken"), [])
  assert.deepEqual(parseClusters("{}"), [])
  assert.equal(clusterLabel(parseClusters(raw)[0]), "r 1.5mm · 5개 · 방향 3.5배")
  assert.equal(clusterLabel(parseClusters(raw)[1]), "r 25mm · 12개 · 링 2.1배")
  assert.equal(clusterLabel(parseClusters(raw)[0], "en"), "r 1.5mm · 5 pts · sector 3.5x")
  assert.equal(clusterLabel(parseClusters(raw)[1], "zh-CN"), "r 25mm · 12个 · 环形 2.1倍")
})

test("maps는 wafer별 군집 정보를 함께 보내고 catalog에는 넣지 않는다", async () => {
  const { base, config, eads } = await fixture()
  try {
    const clusters = JSON.stringify([{ r: 10, x: 100, y: 0, k: 8, zone: "sector", zone_ratio: 4, hit: true, deg: 0, width: 45 }])
    const service = createClusterPcService({
      readList: async () => [
        { line: "L", device: "D", main_seq: "S", met_seq: "1_RANDOM_PC", eqpid: "E", lot_wf: "W1", path: join(eads, "a.parquet"), clusters },
        { line: "L", device: "D", main_seq: "S", met_seq: "1_RANDOM_PC", eqpid: "E", lot_wf: "W2", path: join(eads, "a.parquet") },
      ],
      readSource: async () => [],
    })
    const body = await service({ method: "GET" }, url(`maps?${new URLSearchParams({ snapshot: "2026-11-18 09:00", line: "L", sdwt: NO_VALUE })}`), config)
    assert.deepEqual(body.wafers.map((wafer) => wafer.clusters), [[{ r: 10, x: 100, y: 0, k: 8, zoneRatio: 4, hit: true, zone: "sector", deg: 0, width: 45 }], []])
    const catalog = await service({ method: "GET" }, url("catalog"), config)
    assert.doesNotMatch(JSON.stringify(catalog), /zone/)
  } finally { await rm(base, { recursive: true, force: true }) }
})

function feedbackRequest(body, { method = "POST", contentType = "application/json" } = {}) {
  const payload = Buffer.from(typeof body === "string" ? body : JSON.stringify(body))
  return { method, headers: { "content-type": contentType }, async *[Symbol.asyncIterator]() { yield payload } }
}

test("판정 피드백은 최신 결과에 있는 wafer만, 결과 파일의 clusters와 로그인 사용자로 저장한다", async () => {
  const { base, config, eads } = await fixture()
  try {
    const clusters = JSON.stringify([{ r: 50, x: 140, y: 0, k: 11, zone: "sector", zone_ratio: 4, hit: true, n: 30, lam: 1.3 }])
    const saved = []
    const service = createClusterPcService({
      readList: async () => [{ line: "L", device: "D", sdwt: "S1", prc_group: "ETCH", main_seq: "U%100", met_seq: "200_RANDOM_PC", eqpid: "EQ1", lot_wf: "W1", path: join(eads, "a.parquet"), clusters }],
      saveFeedback: async (payload) => { saved.push(payload); return { ok: true } },
      currentUser: async () => ({ ok: true, knoxId: "user1" }),
    })
    const key = { snapshot: "2026-11-18 09:00", line: "L", device: "D", mainSeq: "U%100", metSeq: "200", lotWf: "W1" }
    const body = await service(feedbackRequest({ ...key, verdict: "wrong", clusters: "[]" }), url("feedback"), config)
    assert.deepEqual(body, { ok: true, verdict: "N" })
    assert.deepEqual(saved, [{ ...key, verdict: "N", clusters, knoxId: "user1" }])

    await assert.rejects(service(feedbackRequest({ ...key, lotWf: "W9", verdict: "correct" }), url("feedback"), config), { status: 404 })
    await assert.rejects(service(feedbackRequest({ ...key, snapshot: "2026-11-17 09:00", verdict: "correct" }), url("feedback"), config), { status: 410 })
    await assert.rejects(service(feedbackRequest({ ...key, verdict: "maybe" }), url("feedback"), config), { status: 400 })
    await assert.rejects(service(feedbackRequest({ ...key, lotWf: "W".repeat(65), verdict: "correct" }), url("feedback"), config), { status: 400 })
    await assert.rejects(service(feedbackRequest("{broken"), url("feedback"), config), { status: 400 })
    await assert.rejects(service(feedbackRequest({ ...key, verdict: "correct" }, { contentType: "text/plain" }), url("feedback"), config), { status: 400 })
    await assert.rejects(service(feedbackRequest({ ...key, verdict: "correct" }, { method: "GET" }), url("feedback"), config), { status: 405 })
    assert.equal(saved.length, 1)

    const failing = createClusterPcService({ readList: async () => [{ line: "L", device: "D", main_seq: "U%100", met_seq: "200_RANDOM_PC", lot_wf: "W1", path: join(eads, "a.parquet") }],
      saveFeedback: async () => { throw new Error("db down") }, currentUser: async () => ({ ok: true, knoxId: "user1" }) })
    await assert.rejects(failing(feedbackRequest({ ...key, verdict: "correct" }), url("feedback"), config), { status: 500, message: "Unable to save the clustered PC verdict." })

    const noLogin = createClusterPcService({ readList: async () => [], currentUser: async () => { throw Object.assign(new Error("Register"), { code: "USER_REGISTRATION_REQUIRED" }) } })
    await assert.rejects(noLogin(feedbackRequest({ ...key, verdict: "correct" }), url("feedback"), config), { code: "USER_REGISTRATION_REQUIRED" })
  } finally { await rm(base, { recursive: true, force: true }) }
})

test("maps 응답에는 clusters 원문을 넣지 않는다", async () => {
  const { base, config, eads } = await fixture()
  try {
    const service = createClusterPcService({
      readList: async () => [{ line: "L", device: "D", sdwt: "S1", main_seq: "S", met_seq: "1_RANDOM_PC", lot_wf: "W1", path: join(eads, "a.parquet"), clusters: "[{\"r\":10,\"x\":1,\"y\":1,\"lam\":0.5}]" }],
      readSource: async () => [],
    })
    const body = await service({ method: "GET" }, url(`maps?${new URLSearchParams({ snapshot: "2026-11-18 09:00", line: "L", sdwt: "S1" })}`), config)
    assert.doesNotMatch(JSON.stringify(body), /clustersRaw|lam/)
  } finally { await rm(base, { recursive: true, force: true }) }
})

test("wafer map은 PRC_Group별, 그 안을 EQP별·챔버별로 묶고 묶음 칸 수는 최대 5칸이다", () => {
  const wafers = [
    { prcGroup: ["CVD"], eqpid: "E2_PM1", lotWf: "W1" }, { prcGroup: [NO_VALUE], eqpid: "E9_PM1", lotWf: "W2" },
    { prcGroup: ["ETCH", "CVD"], eqpid: "E1_PM1", lotWf: "W3" }, { prcGroup: ["CVD"], eqpid: "E1_PM2", lotWf: "W4" },
    { prcGroup: ["CVD"], eqpid: "E2_PM1", lotWf: "W5" }, { prcGroup: ["CVD"], eqpid: "E1_PM1", lotWf: "W6" },
    ...["W7", "W8", "W9", "W10"].map((lotWf) => ({ prcGroup: ["CVD"], eqpid: "E3_PM1", lotWf })), { prcGroup: ["CVD"], eqpid: "E3_PM2", lotWf: "W11" },
  ]
  const view = groupByPrcEqp(wafers).map(([prc, eqps]) => [prc, eqps.map((eqp) => [eqp.eqp, eqp.span, eqp.count, eqp.chambers.map((item) => [item.chamber, item.span, item.wafers.map((wafer) => wafer.lotWf)])])])
  assert.deepEqual(view, [
    ["CVD", [["E1", 2, 2, [["PM1", 1, ["W6"]], ["PM2", 1, ["W4"]]]], ["E2", 2, 2, [["PM1", 2, ["W1", "W5"]]]], ["E3", 5, 5, [["PM1", 4, ["W7", "W8", "W9", "W10"]], ["PM2", 1, ["W11"]]]]]],
    ["ETCH,CVD", [["E1", 1, 1, [["PM1", 1, ["W3"]]]]]],
    [NO_VALUE, [["E9", 1, 1, [["PM1", 1, ["W2"]]]]]],
  ])
  assert.deepEqual([1, 3, 5, 6, 12].map(eqpSpan), [1, 3, 5, 5, 5])
  assert.deepEqual(splitEqpid("EQA01_PM1"), { eqp: "EQA01", chamber: "PM1" })
  assert.deepEqual(splitEqpid("EQA01_PM1,EQA01_PM2"), { eqp: "EQA01", chamber: "PM1,PM2" })
  assert.deepEqual(splitEqpid("EQA01_PM2,EQB02_PM1"), { eqp: "EQA01,EQB02", chamber: "EQA01_PM2,EQB02_PM1" })
  assert.deepEqual(splitEqpid("EQC03"), { eqp: "EQC03", chamber: "EQC03" })
  assert.deepEqual(splitEqpid("EQD_CH_A"), { eqp: "EQD", chamber: "PMCH_A" })
  assert.deepEqual(splitEqpid("EQE01_1,EQE01_A"), { eqp: "EQE01", chamber: "PM1,PMA" })
})

test("결과와 원본 좌표는 /appdata/abnormal_trend/pic/defect 아래에서 읽는다", () => {
  assert.equal(DEFECT_CLUSTER_PC_CONFIG.listRoot, "/appdata/abnormal_trend/pic/defect/fail_list_all_scs")
  assert.deepEqual(DEFECT_CLUSTER_PC_CONFIG.rawRoots, ["/appdata/abnormal_trend/pic/defect"])
})

function responseRecorder() {
  return { status: 0, body: null, writeHead(status) { this.status = status }, end(payload) { this.body = JSON.parse(payload) } }
}

test("HTTP 응답: 요청 오류는 상태 코드와 문구를, 사용자 미등록은 현재 사용자 오류 응답을 보낸다", async () => {
  const handler = createDefectClusterPcHandler({ config: { listRoot: join(tmpdir(), "cluster-pc-missing-root"), rawRoots: [] },
    service: createClusterPcService({ readList: async () => [], currentUser: async () => { throw Object.assign(new Error("Register"), { code: "USER_REGISTRATION_REQUIRED" }) } }) })
  const notFound = responseRecorder()
  await handler({ method: "GET", headers: {} }, notFound, url("other"))
  assert.deepEqual([notFound.status, notFound.body], [404, { ok: false, error: "Unsupported clustered PC request." }])
  const catalog = responseRecorder()
  await handler({ method: "GET", headers: {} }, catalog, url("catalog"))
  assert.deepEqual([catalog.status, catalog.body], [200, { ok: true, configured: false, snapshot: "", rows: [] }])
  const feedback = responseRecorder()
  await handler(feedbackRequest({ verdict: "correct" }), feedback, url("feedback"))
  assert.equal(feedback.status, 428)
  assert.equal(feedback.body.code, "USER_REGISTRATION_REQUIRED")
})

test("path 컬럼의 l0_spider 경로(/appdata/hadoop/code/eads)는 /appdata/abnormal_trend/pic/defect로 바꿔 읽는다", () => {
  assert.equal(sourcePath(" /appdata/hadoop/code/eads/L1/defect_map/D/U%100/200_RANDOM_PC/2026-11-19/100_measure_data_xy.parquet "),
    "/appdata/abnormal_trend/pic/defect/L1/defect_map/D/U%100/200_RANDOM_PC/2026-11-19/100_measure_data_xy.parquet")
  assert.equal(sourcePath("/appdata/abnormal_trend/pic/defect/a.parquet"), "/appdata/abnormal_trend/pic/defect/a.parquet")
  assert.equal(sourcePath("/appdata/hadoop/code/eads_other/a.parquet"), "/appdata/hadoop/code/eads_other/a.parquet")
  const [row] = clusterRows([{ line: "L", lot_wf: "W1", path: "/appdata/hadoop/code/eads/L/a.parquet" }])
  assert.equal(row.path, "/appdata/abnormal_trend/pic/defect/L/a.parquet")
})

test("같은 판정을 다시 누르면 DELETE로 그 판정 행만 지우도록 요청한다", async () => {
  const { base, config, eads } = await fixture()
  try {
    const saved = []
    const service = createClusterPcService({
      readList: async () => [{ line: "L", device: "D", sdwt: "S1", main_seq: "U%100", met_seq: "200_RANDOM_PC", lot_wf: "W1", path: join(eads, "a.parquet"), clusters: "[]" }],
      saveFeedback: async (payload) => { saved.push(payload); return { ok: true } },
      currentUser: async () => ({ ok: true, knoxId: "user1" }),
    })
    const key = { snapshot: "2026-11-18 09:00", line: "L", device: "D", mainSeq: "U%100", metSeq: "200", lotWf: "W1" }
    const body = await service(feedbackRequest({ ...key, verdict: "correct" }, { method: "DELETE" }), url("feedback"), config)
    assert.deepEqual(body, { ok: true, verdict: "" })
    assert.deepEqual(saved, [{ ...key, verdict: "Y", action: "delete", knoxId: "user1" }])
    await assert.rejects(service(feedbackRequest({ ...key, verdict: "correct" }, { method: "DELETE" }), url("feedback"), { ...config, listRoot: join(base, "missing") }), { status: 404 })

    const failing = createClusterPcService({ readList: async () => [{ line: "L", device: "D", main_seq: "U%100", met_seq: "200_RANDOM_PC", lot_wf: "W1", path: join(eads, "a.parquet") }],
      saveFeedback: async () => ({ ok: false }), currentUser: async () => ({ ok: true, knoxId: "user1" }) })
    await assert.rejects(failing(feedbackRequest({ ...key, verdict: "wrong" }, { method: "DELETE" }), url("feedback"), config), { status: 500, message: "Unable to cancel the clustered PC verdict." })
  } finally { await rm(base, { recursive: true, force: true }) }
})

test("과거 이력은 오늘 이전 7일 폴더 중 결과 파일이 있는 폴더만 쓰고 최신 결과는 뺀다", async () => {
  const base = await mkdtemp(join(tmpdir(), "cluster-pc-history-"))
  try {
    const names = ["2026-11-12 09:00", "2026-11-13 09:00", "2026-11-15 09:00", "2026-11-16 09:00", "2026-11-19 09:00", "2026-11-20 09:00"]
    for (const name of names) await mkdir(join(base, name))
    for (const name of names.filter((value) => value !== "2026-11-16 09:00")) await writeFile(join(base, name, "fail_list_bias_pc.parquet"), "")
    const found = await historySnapshots(base, "2026-11-19 09:00", new Date(2026, 10, 20, 8, 0))
    // 11-12는 기간 밖, 11-16은 파일 없음, 11-19는 최신 결과, 11-20은 오늘이라 뺀다.
    assert.deepEqual(found.map((item) => item.snapshot), ["2026-11-13 09:00", "2026-11-15 09:00"])
  } finally { await rm(base, { recursive: true, force: true }) }
})

test("이력 건수는 같은 line에서 eqpid 값이 하나라도 겹치는 wafer 수다", () => {
  const history = [
    { line: "L", eqpid: "EQ_1" }, { line: "L", eqpid: "EQ_1" }, { line: "L", eqpid: "EQ_1,EQ_2" },
    { line: "M", eqpid: "EQ_1" }, { line: "L", eqpid: "EQ_3" },
  ]
  const wafers = [{ line: "L", eqpid: "EQ_1" }, { line: "L", eqpid: "EQ_2" }, { line: "L", eqpid: "EQ_4" }, { line: "L", eqpid: "" }]
  assert.deepEqual(historyCounts(history, wafers), { EQ_1: 3, EQ_2: 1, EQ_4: 0 })
})

test("maps는 챔버별 과거 이력 건수를, history는 그 챔버의 과거 wafer map을 돌려준다", async () => {
  const base = await mkdtemp(join(tmpdir(), "cluster-pc-history-"))
  try {
    const listRoot = join(base, "list"), eads = join(base, "eads")
    for (const name of ["2026-11-18 09:00", "2026-11-19 09:00", "2026-11-20 09:00"]) {
      await mkdir(join(listRoot, name), { recursive: true })
      await writeFile(join(listRoot, name, "fail_list_bias_pc.parquet"), "")
    }
    await mkdir(eads)
    await writeFile(join(eads, "a.parquet"), "")
    const row = (lotWf, eqpid) => ({ line: "L", device: "D", sdwt: "S", prc_group: "CVD", main_seq: "M", met_seq: "1", eqpid, lot_wf: lotWf, path: join(eads, "a.parquet") })
    const lists = {
      "2026-11-18 09:00": [row("H1_01", "EQ_1"), row("H2_02", "EQ_2")],
      "2026-11-19 09:00": [row("H3_03", "EQ_1")],
      "2026-11-20 09:00": [row("W1_05", "EQ_1")],
    }
    const service = createClusterPcService({
      readList: async (path) => lists[Object.keys(lists).find((name) => path.includes(name))],
      readSource: async () => [{ lot_wf: "H1_01", coorx: 100, coory: 100 }],
      now: () => new Date(2026, 10, 20, 12, 0),
    })
    const config = { listRoot, rawRoots: [eads] }
    const maps = await service({ method: "GET" }, url(`maps?${new URLSearchParams({ snapshot: "2026-11-20 09:00", line: "L", sdwt: "S" })}`), config)
    assert.deepEqual(maps.history, { EQ_1: 2 })
    const history = await service({ method: "GET" }, url(`history?${new URLSearchParams({ snapshot: "2026-11-20 09:00", line: "L", eqpid: "EQ_1" })}`), config)
    assert.equal(history.total, 2)
    assert.deepEqual(history.wafers.map((wafer) => [wafer.snapshot, wafer.lotWf, wafer.slot, wafer.xy]), [["2026-11-19 09:00", "H3_03", "03", []], ["2026-11-18 09:00", "H1_01", "01", [1, 1]]])
    await assert.rejects(service({ method: "GET" }, url(`history?${new URLSearchParams({ snapshot: "2026-11-19 09:00", line: "L", eqpid: "EQ_1" })}`), config), { status: 410 })
    await assert.rejects(service({ method: "GET" }, url(`history?${new URLSearchParams({ snapshot: "2026-11-20 09:00", line: "L" })}`), config), { status: 400 })
  } finally { await rm(base, { recursive: true, force: true }) }
})

test("이력은 line + lot_wf + 설비 진행시간이 같은 감지를 한 번만 세고, 최신 결과에 있는 감지는 뺀다", () => {
  const history = [
    { line: "L", lotWf: "W_01", tkoutTime: "2026-11-19 10:00:00", snapshot: "2026-11-19" },
    { line: "L", lotWf: "W_02", tkoutTime: "2026-11-18 10:00:00", snapshot: "2026-11-19" },
    { line: "L", lotWf: "W_02", tkoutTime: "2026-11-18 10:00:00", snapshot: "2026-11-18" },
    { line: "L", lotWf: "W_02", tkoutTime: "2026-11-17 10:00:00", snapshot: "2026-11-18" },
    { line: "L", lotWf: "W_03", tkoutTime: "", snapshot: "2026-11-19" },
    { line: "L", lotWf: "W_03", tkoutTime: "", snapshot: "2026-11-18" },
  ]
  const current = [{ line: "L", lotWf: "W_01", tkoutTime: "2026-11-19 10:00:00" }]
  assert.deepEqual(uniqueHistoryRows(history, current).map((row) => [row.lotWf, row.snapshot]),
    [["W_02", "2026-11-19"], ["W_02", "2026-11-18"], ["W_03", "2026-11-19"], ["W_03", "2026-11-18"]])
})

test("maps 이력 건수와 history 팝업은 2일치 중복 적재와 최신 결과 감지를 빼고 센다", async () => {
  const base = await mkdtemp(join(tmpdir(), "cluster-pc-history-"))
  try {
    const listRoot = join(base, "list"), eads = join(base, "eads")
    for (const name of ["2026-11-18 09:00", "2026-11-19 09:00", "2026-11-20 09:00"]) {
      await mkdir(join(listRoot, name), { recursive: true })
      await writeFile(join(listRoot, name, "fail_list_bias_pc.parquet"), "")
    }
    await mkdir(eads)
    await writeFile(join(eads, "a.parquet"), "")
    const row = (lotWf) => ({ line: "L", device: "D", sdwt: "S", prc_group: "CVD", main_seq: "M", met_seq: "1", eqpid: "EQ_1", lot_wf: lotWf, path: join(eads, "a.parquet") })
    const lists = {
      // 11-18 결과의 H1은 11-19 결과에 다시 들어오고, 11-19 결과의 W1은 최신(11-20) 결과에 다시 들어온다.
      "2026-11-18 09:00": [row("H0_01"), row("H1_02")],
      "2026-11-19 09:00": [row("H1_02"), row("W1_05")],
      "2026-11-20 09:00": [row("W1_05"), row("W2_06")],
    }
    const tkout = { H0_01: "2026-11-17 01:00:00", H1_02: "2026-11-18 01:00:00", W1_05: "2026-11-19 01:00:00", W2_06: "2026-11-20 01:00:00" }
    const service = createClusterPcService({
      readList: async (path) => lists[Object.keys(lists).find((name) => path.includes(name))],
      readSource: async () => Object.entries(tkout).map(([lot_wf, tkout_time]) => ({ lot_wf, coorx: 100, coory: 100, tkout_time })),
      now: () => new Date(2026, 10, 20, 12, 0),
    })
    const config = { listRoot, rawRoots: [eads] }
    const maps = await service({ method: "GET" }, url(`maps?${new URLSearchParams({ snapshot: "2026-11-20 09:00", line: "L", sdwt: "S" })}`), config)
    assert.deepEqual(maps.history, { EQ_1: 2 })
    const history = await service({ method: "GET" }, url(`history?${new URLSearchParams({ snapshot: "2026-11-20 09:00", line: "L", eqpid: "EQ_1" })}`), config)
    assert.equal(history.total, 2)
    assert.deepEqual(history.wafers.map((wafer) => [wafer.snapshot, wafer.lotWf]), [["2026-11-19 09:00", "H1_02"], ["2026-11-18 09:00", "H0_01"]])
  } finally { await rm(base, { recursive: true, force: true }) }
})
