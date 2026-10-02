import assert from "node:assert/strict"
import test from "node:test"
import { buildDefectRawSummary } from "./defectFiles.mjs"

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
