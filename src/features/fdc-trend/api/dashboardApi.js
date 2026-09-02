import { getApiErrorMessage } from "./errorMessage.js"
import { assertDashboardIntegrity } from "./dashboardIntegrity.mjs"

const DASHBOARD_STATS_METRIC_KEYS = Object.freeze([
  "monitoringSensorTotal",
  "detectedPpidCount",
  "totalAnomalyCount",
  "abGradeCount",
  "dGradeCount",
  "nGradeCount",
  "mGradeCount",
])

export async function fetchDashboardSummary({ startDate, endDate, lines = [], signal } = {}) {
  const searchParams = new URLSearchParams()
  if (startDate) searchParams.set("startDate", startDate)
  if (endDate) searchParams.set("endDate", endDate)
  lines.forEach((line) => searchParams.append("line", line))
  const query = searchParams.toString()
  const response = await fetch(`/api/dashboard-data${query ? `?${query}` : ""}`, {
    headers: { Accept: "application/json" },
    signal,
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to load dashboard data."))
  }

  assertDashboardIntegrity(payload.lineDashboard, { startDate, endDate, lines })

  return payload
}

export async function fetchDashboardLatestDate({ signal } = {}) {
  const response = await fetch("/api/dashboard-latest-date", {
    headers: { Accept: "application/json" },
    signal,
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to load the last algorithm run time."))
  }
  if (typeof payload.latestDate !== "string" || !payload.latestDate.trim()) {
    throw new Error("The response does not include the last algorithm run time.")
  }

  return payload
}

export async function fetchDashboardStats({ startDate, endDate, lines = [], signal } = {}) {
  const searchParams = new URLSearchParams()
  if (startDate) searchParams.set("startDate", startDate)
  if (endDate) searchParams.set("endDate", endDate)
  lines.forEach((line) => searchParams.append("line", line))
  const query = searchParams.toString()
  const response = await fetch(`/api/dashboard-stats${query ? `?${query}` : ""}`, {
    headers: { Accept: "application/json" },
    signal,
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to load the dashboard statistics file."))
  }
  if (
    typeof payload.latestDate !== "string"
    || !payload.latestDate.trim()
    || !payload.metrics
    || DASHBOARD_STATS_METRIC_KEYS.some((key) => !Number.isFinite(payload.metrics[key]))
  ) {
    throw new Error("The dashboard statistics response is invalid.")
  }

  assertDashboardIntegrity(payload.lineDashboard, { startDate, endDate, lines })

  return payload
}
