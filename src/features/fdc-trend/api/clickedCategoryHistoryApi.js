import { getApiErrorMessage } from "./errorMessage.js"

export async function createClickedCategoryHistory({
  app,
  lineId,
  filePaths,
  grades,
  selectedSdwt,
  selectedSensor,
  clickedAt,
}) {
  const body = {
    app,
    lineId,
    filePaths,
    grades,
    selectedSdwt,
    selectedSensor,
    clickedAt,
  }
  const response = await fetch("/api/clicked-category-history", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "클릭이력을 저장하지 못했습니다."))
  }
  if (Number(payload.affectedRows) < 1) {
    throw new Error("클릭이력이 DB에 반영되지 않았습니다.")
  }
  return payload
}
