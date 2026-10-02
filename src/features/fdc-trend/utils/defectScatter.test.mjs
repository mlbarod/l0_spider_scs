import assert from "node:assert/strict"
import test from "node:test"
import { buildDefectScatterSeries, defectChartTitle, defectInitialDomain, defectIsNg, defectScatterDomain, formatDefectTime } from "./defectScatter.mjs"

test("차트 헤더는 eqp_ch / main_seq / met_seq의 첫 구분자 앞뒤를 표시한다", () => {
  assert.equal(defectChartTitle("EQP-1", "100", "200_ITEM_A"), "EQP-1 / 100 / 200 / ITEM_A")
  assert.equal(defectChartTitle("EQP-1", "100", "200"), "EQP-1 / 100 / 200 / —")
})

test("FAIL은 선택한 eqp_ch만, ALL은 다른 eqp_ch와 미지정 행까지 모든 차트에 유지한다", () => {
  const fail = [{ eqp_ch: "A", tkout_time: 1, fab_value: 0 }, { eqp_ch: "B", tkout_time: 2, fab_value: 20 }]
  const all = [...fail, { eqp_ch: "C", tkout_time: 3, fab_value: 30 }, { eqp_ch: "", tkout_time: 4, fab_value: 40 }]
  for (const eqp of ["A", "B"]) {
    const series = buildDefectScatterSeries(fail, all, eqp)
    assert.deepEqual(series.selected, fail.filter((point) => point.eqp_ch === eqp).map((point) => ({ ...point, isNg: false })))
    assert.deepEqual(series.background.flatMap(({ points }) => points), all)
    assert.deepEqual(new Set(series.eqps), new Set(["A", "B", "C", ""]))
  }
})

const points = (values) => values.map((fab_value, tkout_time) => ({ fab_value, tkout_time }))

test("최초 Y축은 ALL의 10/90 분위수 IQR 이상치를 제외하고 min - 2, max * 1.2를 사용한다", () => {
  const all = points([-1000, ...Array.from({ length: 19 }, (_, i) => i + 1), 1000])
  assert.deepEqual(defectInitialDomain(all, []).y, [-1, 22.8])
  assert.equal(all.length, 21) // 확대·초기화를 위해 원본 점은 유지한다.
  assert.deepEqual(defectInitialDomain(all, [{ fab_value: 2000, tkout_time: 22, final_decision: "OK" }]).y, [-1, 22.8])
  assert.deepEqual(defectInitialDomain(all, [{ fab_value: 2000, tkout_time: 22, final_decision: "NG" }]).y, [-1, 2400])
  assert.deepEqual(defectInitialDomain(all, [{ fab_value: -2000, tkout_time: 22, isNg: true }]).y, [-2002, 22.8])
})

test("빈 ALL·작은 표본·IQR 0·0과 음수에서도 유효한 범위와 NG를 보존한다", () => {
  assert.deepEqual(defectInitialDomain([], []), { x: [0, 1], y: [0, 1] })
  assert.deepEqual(defectInitialDomain(points([0]), []).y, [-2, 0])
  assert.deepEqual(defectInitialDomain(points([1, 2, 100]), []).y, [-1, 120])
  assert.deepEqual(defectInitialDomain(points([...Array(20).fill(5), 100]), []).y, [3, 120])
  assert.deepEqual(defectInitialDomain([], [{ fab_value: 100, tkout_time: 1, final_decision: "NG" }]).y, [98, 120])
  const negative = defectInitialDomain(points([-100, -90]), [])
  assert.ok(negative.y[0] < -100 && negative.y[1] >= -90)
})

test("NG 판정과 동일 lot/wafer 보호를 적용하고 STEP 앞 두 글자 순서로 참조 팔레트를 배정한다", () => {
  const fail = [
    { eqp_ch: "A", final_decision: " Ｎ​Ｇ ", lot_id: "L", wafer_id: "W", fab_value: 100 },
    { eqp_ch: "A", final_decision: "OK", lot_id: "L", wafer_id: "W", fab_value: 200 },
    { eqp_ch: "A", final_decision: "OK", lot_id: "L", wafer_id: "W2", fab_value: 3 },
    { eqp_ch: "A", fab_value: 4 },
  ]
  const series = buildDefectScatterSeries(fail, [{ eqp_ch: "X", step_seq: "20_a" }, { eqp_ch: "Y", step_seq: "10_b" }], "A")
  assert.deepEqual(series.selected.map((point) => point.isNg), [true, true, false, false])
  assert.deepEqual([...series.stepColors], [["10", "hsl(268 75% 52%)"], ["20", "hsl(204 94% 40%)"]])
  assert.equal(defectIsNg({ anomaly_type: "std", std_result: "NG" }), true)
  assert.equal(defectIsNg({ std_result: "NG", final_decision: "OK" }), false)
  assert.equal(defectIsNg({ FINAL_DECISION: "NG" }), true)
})

test("시계열 표시·단일 점·음수와 큰 값의 축 범위를 유지한다", () => {
  assert.equal(formatDefectTime(Date.parse("2026-10-01T02:03:04Z"), true), "2026-10-01 02:03:04")
  const single = defectScatterDomain([{ tkout_time: 100, fab_value: 0 }])
  assert.ok(single.x[0] < 100 && single.x[1] > 100)
  assert.ok(single.y[0] < 0 && single.y[1] > 0)
  const domain = defectScatterDomain([{ tkout_time: 1, fab_value: -5 }, { tkout_time: 2, fab_value: 1000 }])
  assert.ok(domain.y[0] < -5 && domain.y[1] > 1000)
})

test("같은 ALL을 공유하는 카드도 NG 보호 범위는 독립적이고 새 데이터에는 새 범위를 계산한다", () => {
  const all = points([-1000, ...Array.from({ length: 19 }, (_, i) => i + 1), 1000])
  const a = { eqp_ch: "A", tkout_time: 2, fab_value: 2000, final_decision: "NG" }
  const b = { eqp_ch: "B", tkout_time: 3, fab_value: 5, final_decision: "OK" }
  const first = buildDefectScatterSeries([a, b], all, "A"), second = buildDefectScatterSeries([a, b], all, "B")
  assert.equal(first.background, second.background)
  assert.deepEqual(defectInitialDomain(all, first.selected).y, [-1, 2400])
  assert.deepEqual(defectInitialDomain(all, second.selected).y, [-1, 22.8])
  assert.deepEqual(defectInitialDomain(points([5, 10]), []).y, [3, 12])
  assert.deepEqual(defectScatterDomain(all, first.selected), defectScatterDomain([...all, ...first.selected]))
})

test("STEP 범례 개수는 eqp_ch 구분 없이 ALL 점을 앞 두 글자로 집계하고 RAW를 중복 가산하지 않는다", () => {
  const all = [
    { eqp_ch: "A", step_seq: "10_A" }, { eqp_ch: "B", step_seq: "10_B" },
    { eqp_ch: "A", step_seq: "20_A" }, { eqp_ch: "A", step_seq: null },
  ]
  const series = buildDefectScatterSeries([{ eqp_ch: "A", step_seq: "10_A" }], all, "A")
  assert.deepEqual([...series.stepCounts], [["10", 2], ["20", 1], ["-", 1]])
})
