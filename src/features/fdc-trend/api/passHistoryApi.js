import { getApiErrorMessage } from "./errorMessage.js"

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Unable to process PASS history."))
  }
  return payload
}

export async function fetchPassHistory({ lineId, sdwt, desc }) {
  const searchParams = new URLSearchParams({ lineId, activeOnly: "true" })
  if (sdwt) searchParams.set("sdwt", sdwt)
  if (desc) searchParams.set("desc", desc)
  const response = await fetch(`/api/pass-history?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
  })
  return parseResponse(response)
}

export async function fetchSkipListData({
  lineId,
  priorities,
  prcGroup,
  eqpCh,
  sensor,
  chStep,
}) {
  const searchParams = new URLSearchParams({ view: "filters", lineId })
  priorities.forEach((priority) => searchParams.append("priority", priority))
  if (prcGroup) searchParams.set("prcGroup", prcGroup)
  if (eqpCh) searchParams.set("eqpCh", eqpCh)
  if (sensor) searchParams.set("sensor", sensor)
  if (chStep) searchParams.set("chStep", chStep)

  const response = await fetch(`/api/pass-history?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
  })
  return parseResponse(response)
}

export async function createPassHistory(input) {
  const body = { ...input }
  const response = await fetch("/api/pass-history", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return parseResponse(response)
}

export async function createPassHistoryBatch({ records, comment, execDate }) {
  const body = { records, comment, execDate }
  const response = await fetch("/api/pass-history", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return parseResponse(response)
}

export async function deletePassHistory(input) {
  const body = { ...input }
  const response = await fetch("/api/pass-history", {
    method: "DELETE",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return parseResponse(response)
}
