import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { fetchDashboardLatestDate, fetchDashboardStats, fetchDashboardSummary } from "./dashboardApi.js"

const successFixture = JSON.parse(readFileSync(
  new URL("../../../../harness/fixtures/dashboard/dashboard-success.json", import.meta.url),
  "utf8",
))

function cloneFixture() {
  return JSON.parse(JSON.stringify(successFixture))
}

async function withMockFetch(payload, callback) {
  const originalFetch = globalThis.fetch
  let requestedUrl = ""
  globalThis.fetch = async (url) => {
    requestedUrl = url
    return {
      ok: true,
      json: async () => payload,
    }
  }
  try {
    await callback(() => requestedUrl)
  } finally {
    globalThis.fetch = originalFetch
  }
}

test("Dashboard API client returns an integrity-checked success payload", async () => {
  await withMockFetch(cloneFixture(), async (getRequestedUrl) => {
    const payload = await fetchDashboardSummary()
    assert.equal(payload.lineDashboard.summary.totalAbnormalCount, 1)
    assert.equal(getRequestedUrl(), "/api/dashboard-data")
  })
})

test("Dashboard latest date client returns the filename text", async () => {
  await withMockFetch({ ok: true, latestDate: "2026-08-27 14:25:30" }, async (getRequestedUrl) => {
    const payload = await fetchDashboardLatestDate()
    assert.equal(payload.latestDate, "2026-08-27 14:25:30")
    assert.equal(getRequestedUrl(), "/api/dashboard-latest-date")
  })
})

test("Dashboard stats client returns the seven metrics", async () => {
  const response = {
    ok: true,
    latestDate: "2026-08-28 14:30:00",
    metrics: {
      monitoringSensorTotal: 100,
      detectedPpidCount: 6,
      totalAnomalyCount: 21,
      abGradeCount: 5,
      dGradeCount: 4,
      nGradeCount: 7,
      mGradeCount: 5,
    },
    lineDashboard: cloneFixture().lineDashboard,
  }
  await withMockFetch(response, async (getRequestedUrl) => {
    assert.deepEqual(await fetchDashboardStats(), response)
    assert.equal(getRequestedUrl(), "/api/dashboard-stats")
  })
})

test("Dashboard stats client forwards the l0_spider filters", async () => {
  const lineDashboard = cloneFixture().lineDashboard
  lineDashboard.filters.lines = ["TEST_LINE"]
  const response = {
    ok: true,
    latestDate: "2000-01-02 08:00:00",
    metrics: {
      monitoringSensorTotal: 2,
      detectedPpidCount: 1,
      totalAnomalyCount: 1,
      abGradeCount: 1,
      dGradeCount: 0,
      nGradeCount: 0,
      mGradeCount: 0,
    },
    lineDashboard,
  }
  await withMockFetch(response, async (getRequestedUrl) => {
    await fetchDashboardStats({
      startDate: "2000-01-02",
      endDate: "2000-01-02",
      lines: ["TEST_LINE"],
    })
    assert.equal(
      getRequestedUrl(),
      "/api/dashboard-stats?startDate=2000-01-02&endDate=2000-01-02&line=TEST_LINE",
    )
  })
})

test("Dashboard API client rejects a summary/detail mismatch", async () => {
  const payload = cloneFixture()
  payload.lineDashboard.summary.totalAbnormalCount = 2

  await withMockFetch(payload, async () => {
    await assert.rejects(
      fetchDashboardSummary(),
      /Dashboard response integrity validation failed/,
    )
  })
})

test("Dashboard API client rejects a Line outside the requested scope", async () => {
  const payload = cloneFixture()
  payload.lineDashboard.filters.lines = ["TEST_LINE"]
  payload.lineDashboard.mailingSummary[0].lineId = "OTHER_LINE"

  await withMockFetch(payload, async (getRequestedUrl) => {
    await assert.rejects(
      fetchDashboardSummary({ lines: ["TEST_LINE"] }),
      /Dashboard response integrity validation failed/,
    )
    assert.equal(getRequestedUrl(), "/api/dashboard-data?line=TEST_LINE")
  })
})
