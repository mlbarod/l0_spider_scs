import assert from "node:assert/strict"
import test from "node:test"

import {
  formatDashboardLatestDate,
  getDashboardLatestDate,
} from "../../src/features/fdc-trend/api/dashboardLatestDate.mjs"

test("Portal latest algorithm time uses the dashboard detail filename latestDate", () => {
  const payload = {
    latestDate: "2026-08-27 14:25:30",
    lineDashboard: {
      summary: {
        latestDateTime: "1999-01-01 00:00:00",
      },
    },
  }

  assert.equal(getDashboardLatestDate(payload), "2026-08-27 14:25:30")
  assert.equal(formatDashboardLatestDate(payload), "2026.08.27 14:25:30")
})

test("Portal latest algorithm time remains empty when dashboard latestDate is unavailable", () => {
  assert.equal(getDashboardLatestDate({}), "")
  assert.equal(formatDashboardLatestDate({ latestDate: "" }), "")
})
