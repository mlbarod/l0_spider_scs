import { getApiErrorMessage } from "./errorMessage.js"

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to load common-area similarity anomaly data."))
  }
  return payload
}

export async function fetchCommonCommonalityData({
  line,
  pathSdwt,
  sdwt,
  eqpModel,
  sensor,
  chStep,
}) {
  const searchParams = new URLSearchParams({ line, pathSdwt, sdwt })
  if (eqpModel) searchParams.set("eqpModel", eqpModel)
  if (sensor) searchParams.set("sensor", sensor)
  if (chStep) searchParams.set("chStep", chStep)
  const response = await fetch(`/api/common-commonality-data?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
  })
  return parseResponse(response)
}

export function buildCommonCommonalityImageUrl(filePath) {
  return `/api/common-commonality-image?path=${encodeURIComponent(filePath)}`
}
