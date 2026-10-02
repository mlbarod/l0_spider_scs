import assert from "node:assert/strict"
import test from "node:test"
import { buildDefectPmHistory, parseDefectPmTime, selectDefectPmHistory, DEFECT_PM_HISTORY_PATH } from "./defectPmHistory.mjs"

const columns = ["asset", "inprt_dt", "work_type", "description", "count"]

test("변경점은 지정 파일에서 asset의 하이픈을 밑줄로 매칭하되 raw 값·컬럼·행 순서는 보존한다", () => {
  assert.equal(DEFECT_PM_HISTORY_PATH, "/appdata/abnormal_trend/pic/xian_change_point/pm_code_info.parquet")
  const source = [
    { asset: " XXXX12-YY ", inprt_dt: "2026-10-01 02:30:00", work_type: "PM", description: "작업1", count: 0 },
    { asset: "OTHER1-AA", inprt_dt: "2026-10-01", work_type: "교체" },
    { asset: "XXXX12_YY", inprt_dt: "invalid", work_type: "점검" },
    { asset: "", inprt_dt: "2026-10-01", work_type: "설비 없음" },
  ]
  const result = selectDefectPmHistory(buildDefectPmHistory(source, columns), ["XXXX12_YY", "XXXX12_YY"])
  assert.deepEqual(result.columns, columns)
  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[0].eqp_ch, "XXXX12_YY")
  assert.equal(result.rows[0].timestamp, Date.parse("2026-10-01T02:30:00Z"))
  assert.deepEqual(result.rows[0].raw, source[0])
  assert.equal(result.rows[1].timestamp, null)
  assert.equal(result.rows[1].raw.inprt_dt, "invalid")
  assert.deepEqual(selectDefectPmHistory(buildDefectPmHistory(source, columns), ["NONE"]).rows, [])
})

test("PM 날짜는 산점도와 같은 시간 좌표로 파싱하고 Date·숫자·날짜 단독·시간대를 지원한다", () => {
  const time = Date.parse("2026-10-01T00:00:00Z")
  for (const value of [new Date(time), time, "2026-10-01", "2026-10-01 00:00:00", "2026-10-01T09:00:00+09:00"]) {
    assert.equal(parseDefectPmTime(value), time)
  }
  for (const value of [null, "", "invalid", Infinity, new Date("invalid")]) assert.equal(parseDefectPmTime(value), null)
})

test("PM 원본의 Date·BigInt·중첩 값은 JSON 응답으로 안전하게 전달하고 필수 컬럼은 검증한다", () => {
  const history = buildDefectPmHistory([{ asset: "X-Y", inprt_dt: new Date("2026-10-01T00:00:00Z"), work_type: "PM", count: 123n, description: { id: 5n } }], columns)
  const result = selectDefectPmHistory(history, ["X_Y"])
  assert.doesNotThrow(() => JSON.stringify(result))
  assert.equal(result.rows[0].raw.count, "123")
  assert.equal(result.rows[0].raw.inprt_dt, "2026-10-01T00:00:00.000Z")
  assert.equal(result.rows[0].raw.description, '{"id":"5"}')
  assert.throws(() => buildDefectPmHistory([], ["asset"]), /asset, inprt_dt, work_type/)
})
