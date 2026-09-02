import { getApiErrorMessage } from "./errorMessage.js"

export async function fetchCommonAnomalyData({
  line,
  pathSdwt,
  sdwt,
  prcGroup,
  eqp,
  sensor,
}) {
  const searchParams = new URLSearchParams({ line, pathSdwt, sdwt })
  if (prcGroup) searchParams.set("prcGroup", prcGroup)
  if (eqp) searchParams.set("eqp", eqp)
  if (sensor) searchParams.set("sensor", sensor)

  const response = await fetch(`/api/common-anomaly-data?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to load common-area anomaly path data."))
  }
  return payload
}

export async function fetchCommonSkipListData({ lineId, prcGroup, eqp, sensor }) {
  const searchParams = new URLSearchParams({ view: "common-filters", lineId })
  if (prcGroup) searchParams.set("prcGroup", prcGroup)
  if (eqp) searchParams.set("eqp", eqp)
  if (sensor) searchParams.set("sensor", sensor)

  const response = await fetch(`/api/pass-history?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to load common-area SKIP LIST data."))
  }
  return payload
}

async function fetchCommonChartData({ filePath, eqp, sensor, chStep, mode = "scatter" }) {
  const searchParams = new URLSearchParams({ path: filePath, eqp, sensor, chStep, mode })
  const response = await fetch(`/api/common-anomaly-scatter-data?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to load common-area anomaly data."))
  }
  return payload
}

export function fetchCommonAnomalyScatterData(options) {
  return fetchCommonChartData(options)
}

export function fetchCommonAnomalyIdentityData(options) {
  return fetchCommonChartData({ ...options, mode: "identity" })
}

export function buildCommonAnomalyImageUrl(filePath) {
  return `/api/common-anomaly-image?path=${encodeURIComponent(filePath)}`
}
