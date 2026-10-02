import assert from "node:assert/strict"
import test from "node:test"
import { DEFECT_PLOT, defectPlotPoint, findDefectPoint } from "./defectScatterCanvas.mjs"

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
