import { getApiErrorMessage } from "./errorMessage.js"

export async function createHitHistory({ lineId, updateDate, sdwt, filePath, execDate }) {
  const body = { lineId, updateDate, sdwt, filePath, execDate }
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
