import assert from "node:assert/strict"
import test from "node:test"
import { buildDefectRawSummary, buildDefectScatterData, buildDefectFilePairs } from "./defectFiles.mjs"

const rows = [
  { eqp_ch: "EQP-2", x: 1 }, { eqp_ch: "EQP-1", x: 2 },
  { eqp_ch: "EQP-2", x: 3 }, { eqp_ch: null, x: 4 }, { eqp_ch: "", x: 5 },
]

test("이상감지 RAW데이터는 eqp_ch별 차트 구분과 행 수를 만든다", () => {
  const result = buildDefectRawSummary(rows, ["eqp_ch", "x"], { trellis: true })
  assert.deepEqual(result.eqp_ch_groups, [{ eqp_ch: "EQP-1", row_count: 1 }, { eqp_ch: "EQP-2", row_count: 2 }])
  assert.equal(result.row_count, 5)
  assert.equal(result.unassigned_row_count, 2)
})

test("Scatter는 Date·문자열 시각과 fab_value를 변환하고 0은 유지하며 결측값은 제외한다", () => {
  const data = buildDefectScatterData([
    { eqp_ch: "E1", tkout_time: new Date("2026-10-01T01:00:00Z"), fab_value: 0 },
    { eqp_ch: "E2", tkout_time: "2026-10-01 02:00:00", fab_value: "2.5" },
    { eqp_ch: "E2", tkout_time: "2026-10-01T11:00:00+09:00", fab_value: -1 },
    { eqp_ch: "E3", tkout_time: "invalid", fab_value: 1 },
    { tkout_time: "2026-10-01 02:00:00", fab_value: null },
    { tkout_time: "2026-10-01 02:00:00", fab_value: "" },
    { tkout_time: "2026-10-01 02:00:00", fab_value: Infinity },
  ], ["eqp_ch", "tkout_time", "fab_value"])
  assert.equal(data.points.length, 3)
  assert.equal(data.points[0].fab_value, 0)
  assert.equal(data.points[1].fab_value, 2.5)
  assert.equal(data.points[1].tkout_time, Date.parse("2026-10-01T02:00:00Z"))
  assert.equal(data.points[1].tkout_time, data.points[2].tkout_time)
  assert.equal(data.invalid_point_count, 4)
  assert.doesNotThrow(() => JSON.stringify(data))
  assert.match(buildDefectScatterData([], ["eqp_ch"]).scatter_error, /tkout_time, fab_value/)
})

test("ALL 선택 중에도 각 파일의 main_seq·met_seq를 헤더용으로 보존한다", () => {
  const source = { path: "/fixture/fail_x.parquet", main_seq: "10", met_seq: "20_ITEM" }
  const pairs = buildDefectFilePairs([source, source, { ...source, met_seq: "21_ITEM" }])
  assert.equal(pairs.length, 2)
  assert.equal(pairs[0].main_seq, "10")
  assert.equal(pairs[0].met_seq, "20_ITEM")
  assert.equal(pairs[1].met_seq, "21_ITEM")
})

test("이상감지 스탭 ALL RAW데이터는 eqp_ch가 있어도 분리하거나 행을 제외하지 않는다", () => {
  assert.deepEqual(buildDefectRawSummary(rows, ["eqp_ch", "x"]), { row_count: 5, columns: ["eqp_ch", "x"] })
  assert.deepEqual(buildDefectRawSummary([{ x: 1 }], ["x"]), { row_count: 1, columns: ["x"] })
})

test("eqp_ch 누락·빈 파일·값 없는 행은 임의 차트를 만들지 않는다", () => {
  const missing = buildDefectRawSummary([{ x: 1 }], ["x"], { trellis: true })
  assert.match(missing.trellis_error, /eqp_ch 컬럼/)
  assert.deepEqual(missing.eqp_ch_groups, [])
  assert.deepEqual(buildDefectRawSummary([], ["eqp_ch"], { trellis: true }).eqp_ch_groups, [])
  assert.deepEqual(buildDefectRawSummary([{ eqp_ch: 0 }], ["eqp_ch"], { trellis: true }).eqp_ch_groups,
    [{ eqp_ch: "0", row_count: 1 }])
})
