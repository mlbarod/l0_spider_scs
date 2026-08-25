import { createSafeApiError } from "./safeApiError.mjs"

const DATA_CONNECTIONS_ENABLED_VALUE = "1"
const DISABLED_ERROR_CODE = "DATA_CONNECTIONS_DISABLED"
const DISABLED_ERROR_MESSAGE = "SCS ETCH SPIDER 데이터 연결을 준비 중입니다."

export const DATA_CONNECTIONS_ENABLED_ENV = "SCS_DATA_CONNECTIONS_ENABLED"

export function areDataConnectionsEnabled(environment = process.env) {
  return environment[DATA_CONNECTIONS_ENABLED_ENV] === DATA_CONNECTIONS_ENABLED_VALUE
}

function isApiPath(pathname) {
  const normalizedPathname = pathname.replace(/%(?:2f|5c)/gi, "/")
  return normalizedPathname === "/api" || normalizedPathname.startsWith("/api/")
}

export function blockDisabledDataRequest(req, res, environment = process.env, logger = console.info) {
  const url = new URL(req.url ?? "/", "http://localhost")
  if (!isApiPath(url.pathname) || areDataConnectionsEnabled(environment)) return false

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
