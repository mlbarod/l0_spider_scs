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
    throw new Error(getApiErrorMessage(payload, "Unable to save click history."))
  }
  if (Number(payload.affectedRows) < 1) {
    throw new Error("Click history was not written to the DB.")
  }
  return payload
}
