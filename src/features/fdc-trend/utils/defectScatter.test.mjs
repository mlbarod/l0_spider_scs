import assert from "node:assert/strict"
import test from "node:test"
import { buildDefectScatterSeries, defectChartTitle, defectScatterDomain, formatDefectTime } from "./defectScatter.mjs"

test("차트 헤더는 eqp_ch / main_seq / met_seq의 첫 구분자 앞뒤를 표시한다", () => {
  assert.equal(defectChartTitle("EQP-1", "100", "200_ITEM_A"), "EQP-1 / 100 / 200 / ITEM_A")
  assert.equal(defectChartTitle("EQP-1", "100", "200"), "EQP-1 / 100 / 200 / —")
})

test("FAIL은 선택한 eqp_ch만, ALL은 다른 eqp_ch와 미지정 행까지 모든 차트에 유지한다", () => {
  const fail = [{ eqp_ch: "A", tkout_time: 1, fab_value: 0 }, { eqp_ch: "B", tkout_time: 2, fab_value: 20 }]
  const all = [...fail, { eqp_ch: "C", tkout_time: 3, fab_value: 30 }, { eqp_ch: "", tkout_time: 4, fab_value: 40 }]
  for (const eqp of ["A", "B"]) {
    const series = buildDefectScatterSeries(fail, all, eqp)
    assert.deepEqual(series.selected, fail.filter((point) => point.eqp_ch === eqp))
    assert.deepEqual(series.background.flatMap(({ points }) => points), all)
    assert.deepEqual(new Set(series.eqps), new Set(["A", "B", "C", ""]))
  }
})

test("시계열 표시·단일 점·음수와 큰 값의 축 범위를 유지한다", () => {
  assert.equal(formatDefectTime(Date.parse("2026-10-01T02:03:04Z"), true), "2026-10-01 02:03:04")
  const single = defectScatterDomain([{ tkout_time: 100, fab_value: 0 }])
  assert.ok(single.x[0] < 100 && single.x[1] > 100)
  assert.ok(single.y[0] < 0 && single.y[1] > 0)
  const domain = defectScatterDomain([{ tkout_time: 1, fab_value: -5 }, { tkout_time: 2, fab_value: 1000 }])
  assert.ok(domain.y[0] < -5 && domain.y[1] > 1000)
})
