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
    throw new Error(getApiErrorMessage(payload, "대시보드 데이터를 불러오지 못했습니다."))
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
    throw new Error(getApiErrorMessage(payload, "마지막 알고리즘 수행 시간을 불러오지 못했습니다."))
  }
  if (typeof payload.latestDate !== "string" || !payload.latestDate.trim()) {
    throw new Error("마지막 알고리즘 수행 시간이 응답에 없습니다.")
  }

  return payload
}

export async function fetchDashboardStats({ signal } = {}) {
  const response = await fetch("/api/dashboard-stats", {
    headers: { Accept: "application/json" },
    signal,
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "대시보드 통계 파일을 불러오지 못했습니다."))
  }
  if (
    typeof payload.latestDate !== "string"
    || !payload.latestDate.trim()
    || !payload.metrics
    || DASHBOARD_STATS_METRIC_KEYS.some((key) => !Number.isFinite(payload.metrics[key]))
  ) {
    throw new Error("대시보드 통계 응답 형식이 올바르지 않습니다.")
  }

  return payload
}
