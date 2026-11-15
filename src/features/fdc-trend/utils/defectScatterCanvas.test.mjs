import assert from "node:assert/strict"
import test from "node:test"
import { DEFECT_PLOT, defectPlotPoint, drawDefectScatter, findDefectPoint } from "./defectScatterCanvas.mjs"

test("드래그 좌표는 실제 plot 경계와 축 범위로 변환하며 영역 밖에서 clamp한다", () => {
  const domain = { x: [1000, 2000], y: [-2, 12] }, width = 600
  assert.deepEqual(defectPlotPoint(72, 18, width, domain), { px: 72, py: 18, x: 1000, y: 12 })
  assert.deepEqual(defectPlotPoint(1000, 500, width, domain), { px: 584, py: 272, x: 2000, y: -2 })
  const center = defectPlotPoint(328, 145, width, domain)
  assert.equal(center.x, 1500)
  assert.equal(center.y, 5)
})

test("툴팁은 근접 픽셀만 조회하며 근처 점이 없으면 표시하지 않는다", () => {
  const a = { x: 100.2, y: 100.2, point: { fab_value: 10 }, selected: false }
  const b = { x: 105, y: 105, point: { fab_value: 20 }, selected: true }
  const index = { width: 600, pixels: new Map([[100 * 600 + 100, a], [105 * 600 + 105, b]]) }
  assert.equal(findDefectPoint(index, 100, 100), a)
  assert.equal(findDefectPoint(index, 105, 105), b)
  assert.equal(findDefectPoint(index, 200, 100), null)
  assert.equal(findDefectPoint(index, 100, DEFECT_PLOT.top - 10), null)
})

test("숨긴 STEP의 ALL 점은 그리지 않는다", () => {
  const fakeContext = () => ({ scale() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, rect() {}, clip() {}, save() {}, restore() {}, drawImage() {} })
  const fakeCanvas = () => ({ getContext: fakeContext })
  globalThis.document = { createElement: fakeCanvas }
  const series = {
    background: [{ eqp_ch: "A", points: [
      { eqp_ch: "A", step_seq: "AB100", tkout_time: 1, fab_value: 1 },
      { eqp_ch: "A", step_seq: "CD200", tkout_time: 2, fab_value: 2 },
    ] }],
    selected: [],
    stepColors: new Map([["AB", "red"], ["CD", "blue"]]),
  }
  const draw = (hiddenSteps) => [...drawDefectScatter(fakeCanvas(), { series, hidden: [], hiddenSteps, domain: { x: [0, 3], y: [0, 3] }, width: 400, pixelRatio: 1 }).pixels.values()]
    .map(({ point }) => point.step_seq)
  assert.deepEqual(draw(undefined).sort(), ["AB100", "CD200"])
  assert.deepEqual(draw(["AB"]), ["CD200"])
  delete globalThis.document
})
