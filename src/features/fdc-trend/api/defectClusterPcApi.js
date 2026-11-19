// Defect SPIDER 몰림PC 이상감지 API (server/defectClusterPc.mjs)
async function get(resource, params, signal) {
  let response
  try { response = await fetch(`/api/defect-spider/cluster-pc/${resource}?${new URLSearchParams(params)}`, { signal, cache: "no-store" }) }
  catch (error) {
    if (error.name === "AbortError") throw error
    throw new Error("Unable to connect to the server.")
  }
  let body
  try { body = await response.json() }
  catch (error) {
    if (error.name === "AbortError") throw error
    throw new Error("Unable to read the server response. Try again later.")
  }
  if (!body || typeof body !== "object") throw new Error("Unable to read the server response. Try again later.")
  if (!response.ok || !body.ok) throw new Error(body.error || body.message || "Unable to load clustered PC data.")
  return body
}

export const fetchClusterPcCatalog = (signal) => get("catalog", {}, signal)
export const fetchClusterPcMaps = (snapshot, filters, signal) => get("maps", { snapshot, ...filters }, signal)

// verdict: "correct"(몰림PC 맞음) | "wrong"(몰림PC 아님). remove = true면 저장된 그 판정을 지운다(같은 버튼을 다시 누른 경우).
export async function saveClusterPcFeedback({ snapshot, wafer, verdict, remove = false }) {
  const response = await fetch("/api/defect-spider/cluster-pc/feedback", {
    method: remove ? "DELETE" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot, line: wafer.line, device: wafer.device, mainSeq: wafer.mainSeq, metSeq: wafer.metSeq, lotWf: wafer.lotWf, verdict }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.ok !== true) throw new Error(body?.error || body?.message || (remove ? "Unable to cancel the clustered PC verdict." : "Unable to save the clustered PC verdict."))
  return body
}
