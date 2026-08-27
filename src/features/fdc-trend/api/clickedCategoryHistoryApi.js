import { getApiErrorMessage } from "./errorMessage.js"
import { logHistoryDbFinal, logHistoryRequest } from "./historyRequestDebug.js"

export async function createClickedCategoryHistory({
  app,
  lineId,
  filePaths,
  grades,
  selectedSensor,
  clickedAt,
}) {
  const body = {
    app,
    lineId,
    filePaths,
    grades,
    selectedSensor,
    clickedAt,
  }
  logHistoryRequest({
    endpoint: "/api/clicked-category-history",
    body,
  })
  const response = await fetch("/api/clicked-category-history", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (payload.debugRecord) {
    logHistoryDbFinal({
      table: "clicked_category_history",
      operation: "INSERT",
      record: payload.debugRecord,
    })
  }
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "클릭이력을 저장하지 못했습니다."))
  }
  if (Number(payload.affectedRows) < 1) {
    throw new Error("클릭이력이 DB에 반영되지 않았습니다.")
  }
  return payload
}
