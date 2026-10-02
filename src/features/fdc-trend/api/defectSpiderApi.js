import { getApiErrorMessage } from "./errorMessage.js"

export async function fetchDefectFilters({ line, pathSdwt, prcGroup, mainSeq, signal }) {
  const params = new URLSearchParams({ line, pathSdwt })
  if (prcGroup) params.set("prcGroup", prcGroup)
  if (mainSeq) params.set("mainSeq", mainSeq)
  const response = await fetch(`/api/defect-filters?${params}`, {
    headers: { Accept: "application/json" }, signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(getApiErrorMessage(payload, "이상감지 리스트를 불러올 수 없습니다."))
  return payload
}
