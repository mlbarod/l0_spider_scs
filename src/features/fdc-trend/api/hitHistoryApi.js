import { getApiErrorMessage } from "./errorMessage.js"
import { logHistoryRequest } from "./historyRequestDebug.js"

export async function createHitHistory({ lineId, filePath, execDate }) {
  const body = { lineId, filePath, execDate }
  logHistoryRequest({ endpoint: "/api/hit-history", body })
  const response = await fetch("/api/hit-history", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "HIT 이력을 저장하지 못했습니다."))
  }
  return payload
}
