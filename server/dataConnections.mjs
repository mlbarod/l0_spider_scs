import { createSafeApiError } from "./safeApiError.mjs"

const DATA_CONNECTIONS_ENABLED_VALUE = "1"
const DISABLED_ERROR_CODE = "DATA_CONNECTIONS_DISABLED"
const DISABLED_ERROR_MESSAGE = "SCS ETCH SPIDER 데이터 연결을 준비 중입니다."
const SELF_EQUIPMENT_READ_METHODS = new Map([
  ["/api/mapping-config", new Set(["GET", "HEAD"])],
  ["/api/self-equipment-data", new Set(["GET"])],
  ["/api/erd-scatter-data", new Set(["GET"])],
])

export const DATA_CONNECTIONS_ENABLED_ENV = "SCS_DATA_CONNECTIONS_ENABLED"
export const SELF_EQUIPMENT_DATA_ENABLED_ENV = "SCS_SELF_EQUIPMENT_DATA_ENABLED"

export function areDataConnectionsEnabled(environment = process.env) {
  return environment[DATA_CONNECTIONS_ENABLED_ENV] === DATA_CONNECTIONS_ENABLED_VALUE
}

export function areSelfEquipmentDataConnectionsEnabled(environment = process.env) {
  return environment[SELF_EQUIPMENT_DATA_ENABLED_ENV] === DATA_CONNECTIONS_ENABLED_VALUE
}

export function getDataConnectionCapabilities(environment = process.env) {
  const allEnabled = areDataConnectionsEnabled(environment)
  return {
    selfEquipmentFileRead: allEnabled || areSelfEquipmentDataConnectionsEnabled(environment),
    // path_xian의 7-column 계약에는 기존 Self PASS/SKIP 식별자인 ver가 없다.
    // 새 식별 계약이 정의되기 전까지 Self 화면의 DB 기능은 fail-close한다.
    selfEquipmentDb: false,
  }
}

function isApiPath(pathname) {
  const normalizedPathname = pathname.replace(/%(?:2f|5c)/gi, "/")
  return normalizedPathname === "/api" || normalizedPathname.startsWith("/api/")
}

export function blockDisabledDataRequest(req, res, environment = process.env, logger = console.info) {
  const url = new URL(req.url ?? "/", "http://localhost")
  const normalizedPathname = url.pathname.replace(/%(?:2f|5c)/gi, "/")
  const isAllowedSelfEquipmentRead = (
    areSelfEquipmentDataConnectionsEnabled(environment)
    && url.pathname === normalizedPathname
    && SELF_EQUIPMENT_READ_METHODS.get(normalizedPathname)?.has(req.method)
  )
  if (
    !isApiPath(url.pathname)
    || areDataConnectionsEnabled(environment)
    || isAllowedSelfEquipmentRead
  ) return false

  const payload = createSafeApiError({
    code: DISABLED_ERROR_CODE,
    message: DISABLED_ERROR_MESSAGE,
    scope: "data-connections",
    logger,
  })

  res.writeHead(503, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(req.method === "HEAD" ? undefined : JSON.stringify(payload))
  return true
}
