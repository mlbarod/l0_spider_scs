import { accessSync, constants, statSync } from "node:fs"

import { createSafeApiError } from "./safeApiError.mjs"

const DATA_CONNECTIONS_ENABLED_VALUE = "1"
const DISABLED_ERROR_CODE = "DATA_CONNECTIONS_DISABLED"
const DISABLED_ERROR_MESSAGE = "SCS ETCH SPIDER 데이터 연결을 준비 중입니다."
const DEFAULT_DB_INFO_PATH = "/appdata/l0_spider_scs/db_info.pkl"
const DASHBOARD_READ_METHODS = new Map([
  ["/api/dashboard-data", new Set(["GET", "HEAD"])],
  ["/api/dashboard-stats", new Set(["GET", "HEAD"])],
  ["/api/dashboard-latest-date", new Set(["GET", "HEAD"])],
])
const SELF_EQUIPMENT_READ_METHODS = new Map([
  ["/api/self-equipment-data", new Set(["GET"])],
  ["/api/erd-scatter-data", new Set(["GET"])],
])
const MAPPING_READ_METHODS = new Map([
  ["/api/mapping-config", new Set(["GET", "HEAD"])],
])
const COMMONALITY_READ_METHODS = new Map([
  ["/api/latest-commonality-path", new Set(["GET", "HEAD"])],
  ["/api/commonality-data", new Set(["GET"])],
  ["/api/commonality-image", new Set(["GET", "HEAD"])],
])
const COMMON_ANOMALY_READ_METHODS = new Map([
  ["/api/common-anomaly-data", new Set(["GET"])],
  ["/api/common-anomaly-scatter-data", new Set(["GET"])],
  ["/api/common-anomaly-image", new Set(["GET", "HEAD"])],
])
const DB_METHODS = new Map([
  ["/api/current-user", new Set(["GET"])],
  ["/api/hit-history", new Set(["POST"])],
  ["/api/clicked-category-history", new Set(["POST"])],
  ["/api/pass-history", new Set(["GET", "POST", "DELETE"])],
])

export const DATA_CONNECTIONS_ENABLED_ENV = "SCS_DATA_CONNECTIONS_ENABLED"
export const DASHBOARD_DATA_ENABLED_ENV = "SCS_DASHBOARD_DATA_ENABLED"
export const SELF_EQUIPMENT_DATA_ENABLED_ENV = "SCS_SELF_EQUIPMENT_DATA_ENABLED"
export const COMMONALITY_DATA_ENABLED_ENV = "SCS_COMMONALITY_DATA_ENABLED"
export const COMMON_ANOMALY_DATA_ENABLED_ENV = "SCS_COMMON_ANOMALY_DATA_ENABLED"
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

export function areCommonalityDataConnectionsEnabled(environment = process.env) {
  return isDefaultEnabled(environment, COMMONALITY_DATA_ENABLED_ENV)
}

export function areCommonAnomalyDataConnectionsEnabled(environment = process.env) {
  return isDefaultEnabled(environment, COMMON_ANOMALY_DATA_ENABLED_ENV)
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

export function getDataConnectionCapabilities(
  environment = process.env,
  canReadDbInfo = isDbInfoReadable,
) {
  const allEnabled = areDataConnectionsEnabled(environment)
  const dbConnections = areDbConnectionsEnabled(environment, canReadDbInfo)
  const selfEquipmentFileRead = allEnabled || areSelfEquipmentDataConnectionsEnabled(environment)
  return {
    dbConnections,
    selfEquipmentFileRead,
    selfEquipmentDb: selfEquipmentFileRead && dbConnections,
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
  const isAllowedMappingRead = (
    (areSelfEquipmentDataConnectionsEnabled(environment)
      || areCommonAnomalyDataConnectionsEnabled(environment))
    && isExactPath
    && MAPPING_READ_METHODS.get(normalizedPathname)?.has(req.method)
  )
  const isAllowedCommonalityRead = (
    areCommonalityDataConnectionsEnabled(environment)
    && isExactPath
    && COMMONALITY_READ_METHODS.get(normalizedPathname)?.has(req.method)
  )
  const isAllowedCommonAnomalyRead = (
    areCommonAnomalyDataConnectionsEnabled(environment)
    && isExactPath
    && COMMON_ANOMALY_READ_METHODS.get(normalizedPathname)?.has(req.method)
  )
  const dbConnectionsEnabled = areDbConnectionsEnabled(environment, canReadDbInfo)
  const isKnownDbRequest = isExactPath && DB_METHODS.get(normalizedPathname)?.has(req.method)
  const isAllowedDbRequest = (
    dbConnectionsEnabled
    && isKnownDbRequest
  )
  if (
    !isApiPath(url.pathname)
    || areDataConnectionsEnabled(environment)
    || isAllowedDashboardRead
    || isAllowedSelfEquipmentRead
    || isAllowedMappingRead
    || isAllowedCommonalityRead
    || isAllowedCommonAnomalyRead
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
