import assert from "node:assert/strict"
import test from "node:test"
import { buildDefectPmHistory, parseDefectPmTime, selectDefectPmHistory, DEFECT_PM_HISTORY_PATH } from "./defectPmHistory.mjs"

const columns = ["asset", "inprg_dt", "work_type", "description", "count"]

test("변경점은 지정 파일에서 asset의 하이픈을 밑줄로 매칭하되 raw 값·컬럼·행 순서는 보존한다", () => {
  assert.equal(DEFECT_PM_HISTORY_PATH, "/appdata/abnormal_trend/pic/xian_change_point/pm_code_info.parquet")
  const source = [
    { asset: " XXXX12-YY ", inprg_dt: "2026-10-01 02:30:00", work_type: "PM", description: "작업1", count: 0 },
    { asset: "OTHER1-AA", inprg_dt: "2026-10-01", work_type: "교체" },
    { asset: "XXXX12_YY", inprg_dt: "invalid", work_type: "점검" },
    { asset: "", inprg_dt: "2026-10-01", work_type: "설비 없음" },
  ]
  const result = selectDefectPmHistory(buildDefectPmHistory(source, columns), ["XXXX12_YY", "XXXX12_YY"])
  assert.deepEqual(result.columns, columns)
  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[0].eqp_ch, "XXXX12_YY")
  assert.equal(result.rows[0].timestamp, Date.parse("2026-10-01T02:30:00Z"))
  assert.deepEqual(result.rows[0].raw, source[0])
  assert.equal(result.rows[1].timestamp, null)
  assert.equal(result.rows[1].raw.inprg_dt, "invalid")
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
  const history = buildDefectPmHistory([{ asset: "X-Y", inprg_dt: new Date("2026-10-01T00:00:00Z"), work_type: "PM", count: 123n, description: { id: 5n } }], columns)
  const result = selectDefectPmHistory(history, ["X_Y"])
  assert.doesNotThrow(() => JSON.stringify(result))
  assert.equal(result.rows[0].raw.count, "123")
  assert.equal(result.rows[0].raw.inprg_dt, "2026-10-01 00:00:00")
  assert.equal(result.rows[0].raw.description, '{"id":"5"}')
  assert.throws(() => buildDefectPmHistory([], ["asset"]), /asset, inprg_dt, work_type/)
})

test("변경점 이력은 PM 파일의 asset_cls를 삭제한 뒤 MWO 파일을 뒤에 이어 붙이고 asset 하이픈을 밑줄로 매칭한다", async () => {
  const { mergeDefectChangeHistory, DEFECT_CHANGE_HISTORY_PATHS } = await import("./defectPmHistory.mjs")
  assert.deepEqual(DEFECT_CHANGE_HISTORY_PATHS, [
    "/appdata/abnormal_trend/pic/xian_change_point/pm_code_info.parquet",
    "/appdata/abnormal_trend/pic/xian_change_point/mnu_code_info.parquet",
  ])
  const pm = { columns: ["asset", "asset_cls", "inprg_dt", "work_type"], rows: [{ asset: "A1-B", asset_cls: "CLS", inprg_dt: "2026-10-01", work_type: "PM" }] }
  const mwo = { columns: ["asset", "inprg_dt", "work_type", "mwo_no"], rows: [{ asset: "A1-B", inprg_dt: "2026-10-02 03:00:00", work_type: "MWO", mwo_no: "M1" }] }
  const merged = mergeDefectChangeHistory(pm, mwo)
  assert.deepEqual(merged.columns, ["asset", "inprg_dt", "work_type", "mwo_no"])
  assert.equal("asset_cls" in merged.rows[0], false)
  const result = selectDefectPmHistory(buildDefectPmHistory(merged.rows, merged.columns), ["A1_B"])
  assert.deepEqual(result.rows.map((row) => [row.eqp_ch, row.work_type, row.timestamp]), [
    ["A1_B", "PM", Date.parse("2026-10-01T00:00:00Z")],
    ["A1_B", "MWO", Date.parse("2026-10-02T03:00:00Z")],
  ])
  assert.equal(result.rows[1].raw.mwo_no, "M1")
  assert.equal(result.rows[0].raw.mwo_no, null)
})

test("변경점 이력의 __index_level_0__ 값은 LINK 버튼 자리로만 남기고 전달하지 않는다", () => {
  const history = buildDefectPmHistory([{ asset: "X-Y", inprg_dt: new Date("2026-10-01T02:03:04.567Z"), work_type: "PM", __index_level_0__: 7n }],
    ["asset", "inprg_dt", "work_type", "__index_level_0__"])
  const [row] = selectDefectPmHistory(history, ["X_Y"]).rows
  assert.equal(row.raw.inprg_dt, "2026-10-01 02:03:04")
  assert.equal(row.raw.__index_level_0__, null)
  assert.deepEqual(history.columns, ["asset", "inprg_dt", "work_type", "__index_level_0__"])
})
