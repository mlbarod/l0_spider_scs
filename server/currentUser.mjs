import { isIP } from "node:net"

import { createSafeApiError } from "./safeApiError.mjs"

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(JSON.stringify(payload))
}

export function normalizeRemoteIp(value) {
  const ip = String(value ?? "").split(",")[0].trim()
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip
}

export function getRemoteIp(req) {
  const remoteIp = normalizeRemoteIp(
    req.headers["x-forwarded-for"]
    ?? req.headers["x-real-ip"]
    ?? req.socket?.remoteAddress
    ?? "",
  )
  return isIP(remoteIp) ? remoteIp : ""
}

export async function resolveCurrentUser(remoteIp) {
  const normalizedRemoteIp = normalizeRemoteIp(remoteIp)
  if (!isIP(normalizedRemoteIp)) {
    const error = new Error("접속자 IP를 확인하지 못했습니다.")
    error.code = "IP_NOT_FOUND"
    throw error
  }
  return { ok: true, knoxId: normalizedRemoteIp }
}

export async function handleCurrentUserRequest(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" })
    return
  }

  const remoteIp = getRemoteIp(req)
  if (!remoteIp) {
    sendJson(res, 400, { ok: false, error: "접속자 IP를 확인하지 못했습니다." })
    return
  }

  try {
    const payload = await resolveCurrentUser(remoteIp)
    sendJson(res, 200, payload)
  } catch {
    sendJson(res, 400, createSafeApiError({
      code: "CURRENT_USER_IP_INVALID",
      message: "접속자 IP를 확인하지 못했습니다.",
      scope: "current-user",
    }))
  }
}
