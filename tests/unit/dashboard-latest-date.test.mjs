import assert from "node:assert/strict"
import test from "node:test"

import {
  formatDashboardLatestDate,
  getDashboardLatestDate,
} from "../../src/features/fdc-trend/api/dashboardLatestDate.mjs"

test("Portal latest algorithm time uses only the last text segment of sourcePaths.detail", () => {
  const payload = {
    latestDate: "1999-01-01 00:00:00",
    sourcePaths: {
      detail: "/appdata/abnormal_trend/pic/path/2026-08-27 14:25:30",
    },
    lineDashboard: {
      summary: {
        latestDateTime: "1999-01-01 00:00:00",
      },
    },
  }

  assert.equal(getDashboardLatestDate(payload), "2026-08-27 14:25:30")
  assert.equal(formatDashboardLatestDate(payload), "2026.08.27 14:25:30")
})

test("Portal latest algorithm time remains empty when the dashboard detail path is unavailable", () => {
  assert.equal(getDashboardLatestDate({}), "")
  assert.equal(formatDashboardLatestDate({ sourcePaths: { detail: "" } }), "")
})

test("Portal latest algorithm time ignores a trailing slash on the detail path", () => {
  const payload = {
    sourcePaths: {
      detail: "/appdata/abnormal_trend/pic/path/2026-08-27 14:25:30/",
    },
  }

  assert.equal(getDashboardLatestDate(payload), "2026-08-27 14:25:30")
})
