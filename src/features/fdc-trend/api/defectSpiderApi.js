import { getApiErrorMessage } from "./errorMessage.js"

function buildParams({ line, pathSdwt, step, prcGroup, mainSeq, metSeq }) {
  const params = new URLSearchParams({ line, pathSdwt })
  if (step) params.set("step", step)
  if (prcGroup) params.set("prcGroup", prcGroup)
  if (mainSeq === null) params.set("mainAll", "1")
  else if (mainSeq) params.set("mainSeq", mainSeq)
  if (metSeq === null) params.set("metAll", "1")
  else if (metSeq) params.set("metSeq", metSeq)
  return params
}

export async function fetchDefectFilters({ signal, ...selection }) {
  const params = buildParams(selection)
  const response = await fetch(`/api/defect-filters?${params}`, {
    headers: { Accept: "application/json" }, signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(getApiErrorMessage(payload, "이상감지 리스트를 불러올 수 없습니다."))
    error.sourcePath = typeof payload.source_path === "string" ? payload.source_path : ""
    throw error
  }
  return payload
}

export async function fetchDefectFile({ filePath, signal, ...selection }) {
  const params = buildParams(selection)
  params.set("filePath", filePath)
  const response = await fetch(`/api/defect-file?${params}`, {
    headers: { Accept: "application/json" }, signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(getApiErrorMessage(payload, "파일을 읽을 수 없습니다."))
  return payload
}

// 차트 빨간 점(NG) wafer의 map 좌표. 좌표가 없는 wafer는 서버가 빼고 보낸다.
export async function fetchDefectMaps({ filePath, eqpCh, signal, ...selection }) {
  const params = buildParams(selection)
  params.set("filePath", filePath)
  params.set("eqpCh", eqpCh)
  const response = await fetch(`/api/defect-map?${params}`, {
    headers: { Accept: "application/json" }, signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(getApiErrorMessage(payload, "wafer map을 불러올 수 없습니다."))
  return payload
}
