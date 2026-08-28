import assert from "node:assert/strict"
import test from "node:test"

import {
  buildDashboardStatsMetrics,
  buildStatsLineDashboard,
  getDashboardStatsDate,
  resolveLatestDashboardStatsFile,
} from "./dashboardStats.mjs"

test("stats 파일명에서 유효한 latest_date만 선택한다", () => {
  assert.equal(
    getDashboardStatsDate("2026-08-28 14:30:00_spider_step_stats.parquets"),
    "2026-08-28 14:30:00",
  )
  assert.equal(getDashboardStatsDate("2026-08-28_spider_step_stats.parquets"), null)
  assert.equal(getDashboardStatsDate("2026-08-28 14:30:00_other.parquets"), null)

  assert.deepEqual(resolveLatestDashboardStatsFile([
    "README.txt",
    "2026-08-27 14:30:00_spider_step_stats.parquets",
    "2026-08-28 08:00:00_spider_step_stats.parquets",
    "2026-08-28 14:30:00_spider_step_stats.parquets",
  ]), {
    latestDate: "2026-08-28 14:30:00",
    fileName: "2026-08-28 14:30:00_spider_step_stats.parquets",
  })
})

test("stats의 recipe_id를 l0_spider 대시보드 구조로 집계한다", () => {
  const latestRows = [
    { recipe_id: "TL-1", priority: "TL", total: 100 },
    { recipe_id: "R1", priority: "A", ng: 2 },
    { recipe_id: "R1", priority: "B", ng: 3 },
    { recipe_id: "R2", priority: "D", ng: 4 },
  ]
  const payload = buildStatsLineDashboard([
    { dateTime: "2026-08-28 14:30:00", rows: latestRows },
  ], {
    dateTime: "2026-08-27 14:30:00",
    rows: [
      { recipe_id: "R1", priority: "A", ng: 1 },
      { recipe_id: "R2", priority: "D", ng: 6 },
    ],
  }, {
    startDate: "2026-08-28",
    endDate: "2026-08-28",
    minDate: "2026-08-27",
    maxDate: "2026-08-28",
    defaultStartDate: "2026-08-28",
    defaultEndDate: "2026-08-28",
    lines: [],
  })

  assert.deepEqual(payload.summary, {
    totalAbnormalCount: 9,
    abnormalLineCount: 2,
    latestDate: "2026-08-28",
    latestDateTime: "2026-08-28 14:30:00",
    latestDateCount: 9,
    topLine: "R1",
    topLineCount: 5,
    previousDate: "2026-08-27",
    previousDateTime: "2026-08-27 14:30:00",
    changeFromPreviousDay: 2,
    monitoringSensorTotal: 100,
    abGradeCount: 5,
    dGradeCount: 4,
    nGradeCount: 0,
    mGradeCount: 0,
  })
  assert.deepEqual(payload.lineSummary.map((row) => ({
    lineId: row.lineId,
    totalCount: row.totalCount,
    previousDateCount: row.previousDateCount,
    changeCount: row.changeCount,
  })), [
    { lineId: "R1", totalCount: 5, previousDateCount: 1, changeCount: 4 },
    { lineId: "R2", totalCount: 4, previousDateCount: 6, changeCount: -2 },
  ])
})

test("stats의 priority별 ng와 TL total로 7개 지표를 계산한다", () => {
  const metrics = buildDashboardStatsMetrics([
    { recipe_id: "TL-1", priority: "TL", total: 100, ng: 999 },
    { recipe_id: "TL-2", priority: "tl", total: "50", ng: 999 },
    { recipe_id: "R1", priority: "A", ng: 2 },
    { recipe_id: "R1", priority: "B", ng: "3" },
    { recipe_id: "R2", priority: "A/B", ng: 4 },
    { recipe_id: "R3", priority: "D", ng: 5 },
    { recipe_id: "R4", priority: "N", ng: 6 },
    { recipe_id: "R5", priority: "M", ng: 7 },
    { recipe_id: "R6", priority: "X", ng: 100 },
  ])

  assert.deepEqual(metrics, {
    monitoringSensorTotal: 150,
    detectedPpidCount: 5,
    totalAnomalyCount: 27,
    abGradeCount: 9,
    dGradeCount: 5,
    nGradeCount: 6,
    mGradeCount: 7,
  })
})
