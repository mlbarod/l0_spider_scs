import assert from "node:assert/strict"
import test from "node:test"

import {
  buildDashboardStatsMetrics,
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
