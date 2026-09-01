import { getApiErrorMessage } from "./errorMessage.js"

export function buildErdDataReferencePath(filePath) {
  const normalizedPath = String(filePath ?? "").trim().replaceAll("/pic_server2/", "/pic/")
  if (!normalizedPath) return ""
  if (/\/data\.parquet$/i.test(normalizedPath)) return normalizedPath
  if (/\/[^/]+\.png$/i.test(normalizedPath)) {
    return normalizedPath.replace(/\/[^/]+\.png$/i, "/data.parquet")
  }
  return `${normalizedPath.replace(/\/+$/, "")}/data.parquet`
}

export function getSelfEquipmentHistoryFilePath(row) {
  return String(row?.file_path ?? "").trim()
}

export function getSelfEquipmentHistoryFilePaths(rows) {
  return Array.from(new Set(
    (Array.isArray(rows) ? rows : [])
      .map(getSelfEquipmentHistoryFilePath)
      .filter(Boolean),
  ))
}

export function getSelfEquipmentPassHistoryFields(row) {
  const source = row?.pass_history ?? row ?? {}
  const normalize = (value) => String(value ?? "").trim()
  const normalizeEqp = (value) => normalize(value).replace(/\.png$/i, "")
  const recipeId = normalize(source.recipeId ?? source.recipe_id ?? source.desc)
  return {
    updateDate: normalize(source.updateDate ?? source.update_date ?? row?.latest_date),
    sdwt: normalize(source.sdwt ?? row?.sdwt),
    desc: normalize(source.desc ?? recipeId),
    ver: normalize(source.ver ?? row?.ver),
    recipeId,
    priority: normalize(source.priority ?? row?.priority),
    sensor: normalize(source.sensor ?? row?.sensor),
    step: normalize(source.step ?? row?.step),
    eqp: normalizeEqp(source.eqp ?? row?.eqp),
  }
}

export function getErdChartRequest(row, eqp, extra = {}) {
  return {
    filePath: row?.file_path,
    eqp,
    sensor: row?.sensor,
    chStep: row?.step,
    ver: row?.ver,
    latestDate: row?.latest_date,
    line: row?.line_rev,
    pathSdwt: row?.path_sdwt,
    ...extra,
  }
}

export function isSelfEquipmentHistoryActionAvailable(row) {
  return Boolean(getSelfEquipmentHistoryFilePath(row))
}

export async function fetchSelfEquipmentData({
  line,
  pathSdwt,
  sdwt,
  priorities,
  desc,
  prcGroup,
  eqpCh,
  sensor,
  chStep,
}) {
  const searchParams = new URLSearchParams({ line, pathSdwt, sdwt })
  priorities.forEach((priority) => searchParams.append("priority", priority))
  if (desc) searchParams.set("desc", desc)
  if (prcGroup) searchParams.set("prcGroup", prcGroup)
  if (eqpCh) searchParams.set("eqpCh", eqpCh)
  if (sensor) searchParams.set("sensor", sensor)
  if (chStep) searchParams.set("chStep", chStep)

  const response = await fetch(`/api/self-equipment-data?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "자설비 이상감지 데이터를 불러오지 못했습니다."))
  }

  return payload
}

export async function fetchEqpAllSkipTargets({
  line,
  pathSdwt,
  sdwt,
  priorities,
  prcGroup,
  desc,
  eqpCh,
  sensor,
}) {
  const targetSensor = String(sensor ?? "").trim()
  if (!targetSensor || targetSensor === "ALL") {
    throw new Error("EQP ALL SKIP은 개별 sensor를 지정해야 합니다.")
  }
  const filters = {
    line,
    priorities,
    ...(prcGroup ? { prcGroup } : desc ? { desc } : {}),
    eqpCh,
    sensor: targetSensor,
    chStep: "ALL",
  }
  const payload = await fetchSelfEquipmentData({ ...filters, pathSdwt, sdwt })

  return (Array.isArray(payload.rows) ? payload.rows : [])
    .map((row) => ({
      filePath: getSelfEquipmentHistoryFilePath(row),
      ...getSelfEquipmentPassHistoryFields(row),
    }))
    .filter((target) => target.filePath)
}

export async function fetchErdScatterData({ filePath, eqp, sensor, chStep, ver, latestDate, line, pathSdwt }) {
  const searchParams = new URLSearchParams({ path: filePath, eqp })
  if (sensor) searchParams.set("sensor", sensor)
  if (chStep) searchParams.set("chStep", chStep)
  if (ver) searchParams.set("ver", ver)
  if (latestDate) searchParams.set("latestDate", latestDate)
  if (line) searchParams.set("line", line)
  if (pathSdwt) searchParams.set("pathSdwt", pathSdwt)
  const response = await fetch(`/api/erd-scatter-data?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "ERD 이상감지 데이터를 불러오지 못했습니다."))
  }

  return payload
}

export async function fetchErdIdentityData({ filePath, eqp, sensor, chStep, ver, latestDate, line, pathSdwt, days, signal }) {
  const searchParams = new URLSearchParams({ path: filePath, eqp, mode: "identity" })
  if (sensor) searchParams.set("sensor", sensor)
  if (chStep) searchParams.set("chStep", chStep)
  if (ver) searchParams.set("ver", ver)
  if (latestDate) searchParams.set("latestDate", latestDate)
  if (line) searchParams.set("line", line)
  if (pathSdwt) searchParams.set("pathSdwt", pathSdwt)
  if (days) searchParams.set("days", String(days))
  const response = await fetch(`/api/erd-scatter-data?${searchParams.toString()}`, {
    headers: { Accept: "application/json" },
    signal,
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "동일성 차트 데이터를 불러오지 못했습니다."))
  }

  return payload
}

export function buildErdFileUrl(filePath) {
  return `/api/erd-file?path=${encodeURIComponent(filePath)}`
}
