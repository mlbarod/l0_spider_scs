import { getApiErrorMessage } from "./errorMessage.js"

export async function fetchHitHistory({ signal, ...filters } = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "" && value != null) params.set(key, String(value))
  }
  const response = await fetch(`/api/hit-history?${params}`, {
    headers: { Accept: "application/json" },
    signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(getApiErrorMessage(payload, "Unable to load saved history."))
  return payload
}

export function hitHistoryImageUrl(imageId) {
  return `/api/hit-history?imageId=${encodeURIComponent(imageId)}`
}

export async function createHitHistory({ lineId, updateDate, sdwt, filePath, execDate, image, requestId }) {
  const body = { lineId, updateDate, sdwt, filePath, execDate, image, requestId }
  const response = await fetch("/api/hit-history", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to save HIT history."))
  }
  return payload
}
