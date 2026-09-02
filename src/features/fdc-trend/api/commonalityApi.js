import { getApiErrorMessage } from "./errorMessage.js"

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to load similarity anomaly data."))
  }
  return payload
}

export async function fetchCommonalityData({
  line,
  pathSdwt,
  sdwt,
  stepSeq,
  sensor,
  chStep,
}) {
  const searchParams = new URLSearchParams({ line, pathSdwt, sdwt })
  if (stepSeq) searchParams.set("stepSeq", stepSeq)
  if (sensor) searchParams.set("sensor", sensor)
  if (chStep) searchParams.set("chStep", chStep)
  const response = await fetch(`/api/commonality-data?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
  })
  return parseResponse(response)
}

export function buildCommonalityImageUrl(filePath) {
  return `/api/commonality-image?path=${encodeURIComponent(filePath)}`
}
