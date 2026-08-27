import { accessSync, constants, statSync } from "node:fs"

import { createSafeApiError } from "./safeApiError.mjs"

const DATA_CONNECTIONS_ENABLED_VALUE = "1"
const DISABLED_ERROR_CODE = "DATA_CONNECTIONS_DISABLED"
const DISABLED_ERROR_MESSAGE = "SCS ETCH SPIDER 데이터 연결을 준비 중입니다."
const DEFAULT_DB_INFO_PATH = "/appdata/l0_spider/db_info.pkl"
const DASHBOARD_READ_METHODS = new Map([
  ["/api/dashboard-data", new Set(["GET", "HEAD"])],
])
const SELF_EQUIPMENT_READ_METHODS = new Map([
  ["/api/mapping-config", new Set(["GET", "HEAD"])],
  ["/api/self-equipment-data", new Set(["GET"])],
  ["/api/erd-scatter-data", new Set(["GET"])],
])
const DB_METHODS = new Map([
  ["/api/current-user", new Set(["GET"])],
  ["/api/hit-history", new Set(["POST"])],
  ["/api/clicked-category-history", new Set(["POST"])],
  ["/api/pass-history", new Set(["GET", "POST", "DELETE"])],
  ["/api/my-eqp-reference", new Set(["GET", "HEAD"])],
  ["/api/my-eqp-registration", new Set(["GET", "POST", "DELETE"])],
  ["/api/mailing-registration", new Set(["GET", "POST", "DELETE"])],
])

export const DATA_CONNECTIONS_ENABLED_ENV = "SCS_DATA_CONNECTIONS_ENABLED"
export const DASHBOARD_DATA_ENABLED_ENV = "SCS_DASHBOARD_DATA_ENABLED"
export const SELF_EQUIPMENT_DATA_ENABLED_ENV = "SCS_SELF_EQUIPMENT_DATA_ENABLED"
export const DB_CONNECTIONS_ENABLED_ENV = "SCS_DB_CONNECTIONS_ENABLED"

export function areDataConnectionsEnabled(environment = process.env) {
  return environment[DATA_CONNECTIONS_ENABLED_ENV] === DATA_CONNECTIONS_ENABLED_VALUE
}

function isDefaultEnabled(environment, variableName) {
  const configuredValue = environment[variableName]
  return configuredValue === undefined || configuredValue === DATA_CONNECTIONS_ENABLED_VALUE
}

export function areDashboardDataConnectionsEnabled(environment = process.env) {
  return isDefaultEnabled(environment, DASHBOARD_DATA_ENABLED_ENV)
}

export function areSelfEquipmentDataConnectionsEnabled(environment = process.env) {
  return isDefaultEnabled(environment, SELF_EQUIPMENT_DATA_ENABLED_ENV)
}

export function resolveDbInfoPath(environment = process.env) {
  return String(environment.DB_INFO_PATH ?? "").trim() || DEFAULT_DB_INFO_PATH
}

export function isDbInfoReadable(filePath) {
  try {
    accessSync(filePath, constants.R_OK)
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}

export function areDbConnectionsEnabled(
  environment = process.env,
  canReadDbInfo = isDbInfoReadable,
) {
  if (!isDefaultEnabled(environment, DB_CONNECTIONS_ENABLED_ENV)) return false
  return canReadDbInfo(resolveDbInfoPath(environment))
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

export function blockDisabledDataRequest(
  req,
  res,
  environment = process.env,
  logger = console.info,
  canReadDbInfo = isDbInfoReadable,
) {
  const url = new URL(req.url ?? "/", "http://localhost")
  const normalizedPathname = url.pathname.replace(/%(?:2f|5c)/gi, "/")
  const isExactPath = url.pathname === normalizedPathname
  const isAllowedDashboardRead = (
    areDashboardDataConnectionsEnabled(environment)
    && isExactPath
    && DASHBOARD_READ_METHODS.get(normalizedPathname)?.has(req.method)
  )
  const isAllowedSelfEquipmentRead = (
    areSelfEquipmentDataConnectionsEnabled(environment)
    && isExactPath
    && SELF_EQUIPMENT_READ_METHODS.get(normalizedPathname)?.has(req.method)
  )
  const isAllowedDbRequest = (
    areDbConnectionsEnabled(environment, canReadDbInfo)
    && isExactPath
    && DB_METHODS.get(normalizedPathname)?.has(req.method)
  )
  if (
    !isApiPath(url.pathname)
    || areDataConnectionsEnabled(environment)
    || isAllowedDashboardRead
    || isAllowedSelfEquipmentRead
    || isAllowedDbRequest
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
