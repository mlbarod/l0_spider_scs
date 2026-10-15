import { isIP } from "node:net"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

import { createSafeApiError } from "./safeApiError.mjs"

const helperPath = fileURLToPath(new URL("../scripts/current_user.py", import.meta.url))
const errors = {
  IP_NOT_FOUND: [400, "Unable to identify the current user."],
  INVALID_KNOX_ID: [400, "Enter a knox_id of 1–128 letters, numbers, dots, underscores or hyphens."],
  INVALID_USER_REQUEST: [400, "The registration request must contain valid JSON."],
  USER_REQUEST_TOO_LARGE: [413, "The registration request is too large."],
  USER_ORIGIN_INVALID: [403, "Registration must be submitted from this site."],
  USER_REGISTRATION_REQUIRED: [428, "Register your knox_id before saving history."],
  IP_ALREADY_REGISTERED: [409, "Another knox_id is already registered. Contact the administrator."],
  CURRENT_USER_DB_FAILED: [503, "Unable to access user registration. Please try again or contact the administrator."],
}

function userError(code) {
  return Object.assign(new Error(errors[code][1]), { code })
}

export function sendCurrentUserError(res, error) {
  const details = errors[error?.code]
  if (!details) return false
  sendJson(res, details[0], createSafeApiError({
    code: error.code, message: details[1], scope: "current-user",
  }))
  return true
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(JSON.stringify(payload))
}

export function normalizeRemoteIp(value) {
  const ip = String(value ?? "").split(",")[0].trim()
  return /^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip) ? ip.slice(7) : ip
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

export function normalizeKnoxId(value) {
  const knoxId = typeof value === "string" ? value.trim() : ""
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(knoxId)) throw userError("INVALID_KNOX_ID")
  return knoxId
}

function runCurrentUserHelper({ ipAddress, ...payload }) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-B", helperPath], {
      env: { ...process.env, REMOTE_ADDR: ipAddress },
      stdio: ["pipe", "pipe", "ignore"],
    })
    let stdout = ""
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGTERM") }, 30_000)
    child.stdin.on("error", () => {})
    child.stdout.on("data", chunk => { stdout += chunk })
    child.on("error", () => {
      clearTimeout(timeout)
      reject(userError("CURRENT_USER_DB_FAILED"))
    })
    child.on("close", code => {
      clearTimeout(timeout)
      if (timedOut || code !== 0) return reject(userError("CURRENT_USER_DB_FAILED"))
      try {
        const result = JSON.parse(stdout.trim())
        if (!result.ok) return reject(userError(errors[result.code] ? result.code : "CURRENT_USER_DB_FAILED"))
        resolve(result)
      } catch {
        reject(userError("CURRENT_USER_DB_FAILED"))
      }
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

async function lookupCurrentUser(remoteIp, runHelper = runCurrentUserHelper) {
  const normalizedRemoteIp = normalizeRemoteIp(remoteIp)
  if (!isIP(normalizedRemoteIp)) throw userError("IP_NOT_FOUND")
  return runHelper({ action: "lookup", ipAddress: normalizedRemoteIp })
}

export async function resolveCurrentUser(remoteIp, runHelper = runCurrentUserHelper) {
  const user = await lookupCurrentUser(remoteIp, runHelper)
  if (user.registrationRequired || !user.knoxId) throw userError("USER_REGISTRATION_REQUIRED")
  return user
}

async function readRegistration(req) {
  if (req.headers["sec-fetch-site"] === "cross-site") throw userError("USER_ORIGIN_INVALID")
  if (req.headers.origin) {
    let origin
    try { origin = new URL(req.headers.origin) } catch { throw userError("USER_ORIGIN_INVALID") }
    if (!["http:", "https:"].includes(origin.protocol) || origin.host !== req.headers.host) {
      throw userError("USER_ORIGIN_INVALID")
    }
  }
  if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw userError("INVALID_USER_REQUEST")
  }
  let body = ""
  let size = 0
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk)
    if (size > 4096) throw userError("USER_REQUEST_TOO_LARGE")
    body += chunk
  }
  let payload
  try { payload = JSON.parse(body) } catch { throw userError("INVALID_USER_REQUEST") }
  return normalizeKnoxId(payload?.knoxId)
}

export async function handleCurrentUserRequest(req, res, { runHelper = runCurrentUserHelper } = {}) {
  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" })
    return
  }

  const remoteIp = getRemoteIp(req)
  if (!remoteIp) {
    sendJson(res, 400, { ok: false, error: "Unable to identify the current user." })
    return
  }

  try {
    const payload = req.method === "POST"
      ? await runHelper({ action: "register", ipAddress: remoteIp, knoxId: await readRegistration(req) })
      : await lookupCurrentUser(remoteIp, runHelper)
    sendJson(res, 200, payload)
  } catch (error) {
    if (!sendCurrentUserError(res, error)) sendCurrentUserError(res, userError("CURRENT_USER_DB_FAILED"))
  }
}
