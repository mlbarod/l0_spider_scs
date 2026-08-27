import { getApiErrorMessage } from "./errorMessage.js"
import { logHistoryDbFinal, logHistoryRequest } from "./historyRequestDebug.js"

export async function createHitHistory({ lineId, updateDate, sdwt, filePath, execDate }) {
  const body = { lineId, updateDate, sdwt, filePath, execDate }
  logHistoryRequest({ endpoint: "/api/hit-history", body })
  const response = await fetch("/api/hit-history", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (payload.debugRecord) {
    logHistoryDbFinal({ table: "hit_history", operation: "INSERT", record: payload.debugRecord })
  }
  if (!response.ok) {
    const error = new Error(getApiErrorMessage(payload, "HIT 이력을 저장하지 못했습니다."))
    error.debugRecord = payload.debugRecord
    error.failureStage = payload.failureStage
    error.failureDetail = payload.failureDetail
    throw error
  }
  return payload
}
