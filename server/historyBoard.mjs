import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { fileURLToPath, URL } from "node:url"

import { getRemoteIp, resolveCurrentUser, sendCurrentUserError } from "./currentUser.mjs"
import { buildHitHistoryRecord } from "./hitHistory.mjs"
import { buildHitHistoryImage, MAX_HISTORY_REQUEST_BYTES } from "./hitHistoryImage.mjs"
import { isMasterUser } from "./masterPermissions.mjs"
import { createSafeApiError } from "./safeApiError.mjs"

const helperPath = fileURLToPath(new URL("../scripts/history_board.py", import.meta.url))
const ROUTE = /^\/api\/history-board(?:\/([a-f0-9]{64})(\/image)?)?$/
// All entries come from each chart's Save History button (l0_spider mail flow without sending).
const ENTRY_TYPES = new Set(["HISTORY"])
const APPS = new Set(["self-equipment", "matching-anomaly", "common-anomaly", "common-commonality-anomaly"])
export const MAX_COMMENT_LENGTH = 2000
const hash = (value) => createHash("sha256").update(value).digest("hex")

const errorResponses = {
  BOARD_INVALID: [400, "Check the board request and try again."],
  BOARD_NOT_FOUND: [404, "The board entry was not found."],
  BOARD_FORBIDDEN: [403, "Only master users can delete board entries."],
  BOARD_CONFLICT: [409, "Another user changed this entry. Review the latest content and try again."],
  BOARD_REQUEST_CONFLICT: [409, "This request was already registered with different content. Check the board."],
  BOARD_ORIGIN_INVALID: [403, "Board changes must be submitted from this site."],
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
  res.end(JSON.stringify(payload))
}

const boardError = (code) => Object.assign(new Error(errorResponses[code][1]), { code })

export function runHistoryBoardHelper(payload) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("python3", ["-B", helperPath], { env: process.env, stdio: ["pipe", "pipe", "ignore"] })
    let stdout = ""
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGTERM") }, 30_000)
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.on("error", (error) => { clearTimeout(timeout); reject(error) })
    child.on("close", () => {
      clearTimeout(timeout)
      let result
      try { result = timedOut ? null : JSON.parse(stdout.trim()) } catch { result = null }
      if (result?.ok === true) return resolvePromise(result)
      reject(Object.assign(new Error("Unable to process the board request."), { code: result?.code ?? "BOARD_STORAGE_ERROR" }))
    })
    child.stdin.on("error", reject)
    child.stdin.end(JSON.stringify(payload))
  })
}

function textField(value, limit, { required = true, singleLine = false } = {}) {
  if (value === undefined && !required) return ""
  if (typeof value !== "string" || value.length > limit || (required && !value.trim())
    || [...value].some((char) => {
      const code = char.charCodeAt(0)
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127
    })
    || (singleLine && /[\r\n]/.test(value))) throw boardError("BOARD_INVALID")
  return value.trim()
}

function assertSameOrigin(headers = {}) {
  let valid = headers["sec-fetch-site"] !== "cross-site"
  if (valid && headers.origin) {
    try {
      const origin = new URL(headers.origin)
      valid = ["http:", "https:"].includes(origin.protocol) && origin.host === headers.host
    } catch { valid = false }
  }
  if (!valid) throw boardError("BOARD_ORIGIN_INVALID")
}

async function readJsonBody(req, maxBytes) {
  if (req.headers?.["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") throw boardError("BOARD_INVALID")
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk)
    if (size > maxBytes) throw Object.assign(boardError("BOARD_INVALID"), { status: 413 })
    chunks.push(Buffer.from(chunk))
  }
  let input
  try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { throw boardError("BOARD_INVALID") }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw boardError("BOARD_INVALID")
  return input
}

export function buildHistoryBoardEntry(input, actor) {
  if (!ENTRY_TYPES.has(input.entryType) || (input.app !== undefined && !APPS.has(input.app))) throw boardError("BOARD_INVALID")
  if (input.image === undefined) throw boardError("BOARD_INVALID")
  let record
  let snapshot
  try {
    record = buildHitHistoryRecord({ ...input, knoxId: actor })
    snapshot = buildHitHistoryImage(input, actor)
  } catch {
    throw boardError("BOARD_INVALID")
  }
  const entry = {
    entryType: input.entryType,
    title: textField(input.title, 300, { singleLine: true }),
    details: textField(input.details, 10000, { required: false }),
    comment: textField(input.comment, MAX_COMMENT_LENGTH),
    app: input.app ?? "",
    lineId: record.lineId, sdwt: record.sdwt, updateDate: record.updateDate, filePath: record.filePath,
  }
  if ([entry.lineId, entry.sdwt].some((value) => value.length > 128) || entry.updateDate.length > 32) throw boardError("BOARD_INVALID")
  return {
    ...entry,
    // Separate namespace from hit_history image ids; a retried request reuses the same entry.
    id: hash(`history-board\0${actor}\0${input.requestId.toLowerCase()}`),
    fingerprint: hash(JSON.stringify({ ...entry, imageSha256: hash(Buffer.from(snapshot.imageBase64, "base64")) })),
    imageBase64: snapshot.imageBase64,
  }
}

function readStatusInput(input) {
  if (!["IN_PROGRESS", "COMPLETED"].includes(input.status) || !Number.isSafeInteger(input.version)
    || input.version < 1 || input.version > 4294967294) throw boardError("BOARD_INVALID")
  return { status: input.status, version: input.version, comment: textField(input.comment, 1000, { required: false }) }
}

export function buildHistoryBoardQuery(searchParams) {
  const pageText = searchParams.get("page") ?? "1"
  const query = { page: Number(pageText) }
  for (const key of ["status", "search", "line", "sdwt"]) query[key] = (searchParams.get(key) ?? "").trim()
  if (!/^\d+$/.test(pageText) || !Number.isSafeInteger(query.page) || query.page < 1 || query.page > 100000
    || !["", "IN_PROGRESS", "COMPLETED"].includes(query.status)
    || [query.search, query.line, query.sdwt].some((value) => value.length > 200)) throw boardError("BOARD_INVALID")
  return query
}

export async function handleHistoryBoardRequest(req, res, {
  runHelper = runHistoryBoardHelper, resolveUser = resolveCurrentUser,
} = {}) {
  try {
    const url = new URL(req.url, "http://localhost")
    const match = ROUTE.exec(url.pathname)
    if (!match) return sendJson(res, 404, { ok: false, error: errorResponses.BOARD_NOT_FOUND[1] })
    const [, id, image] = match
    const allowed = id ? (image ? ["GET"] : ["GET", "PATCH", "DELETE"]) : ["GET", "POST"]
    if (!allowed.includes(req.method)) return sendJson(res, 405, { ok: false, error: "Method not allowed" })
    // Viewing stays open to unregistered users, like the previous /api/hit-history GET.
    if (req.method === "GET" && !id) {
      return sendJson(res, 200, await runHelper({ action: "list", ...buildHistoryBoardQuery(url.searchParams) }))
    }
    if (req.method === "GET" && image) {
      const result = await runHelper({ action: "image", id })
      const png = Buffer.from(result.imageBase64, "base64")
      res.writeHead(200, {
        "Content-Type": "image/png", "Content-Length": png.length,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": 'inline; filename="chart.png"',
      })
      return res.end(png)
    }
    if (req.method === "GET") {
      const result = await runHelper({ action: "detail", id })
      // The delete button only shows for a registered master; lookup failure just hides it.
      const viewer = await resolveUser(getRemoteIp(req)).catch(() => null)
      return sendJson(res, 200, { ...result, post: { ...result.post, canDelete: isMasterUser(viewer?.knoxId) } })
    }

    assertSameOrigin(req.headers)
    const actor = (await resolveUser(getRemoteIp(req))).knoxId
    if (req.method === "POST") {
      const entry = buildHistoryBoardEntry(await readJsonBody(req, MAX_HISTORY_REQUEST_BYTES), actor)
      const result = await runHelper({ action: "create", actor, ...entry })
      return sendJson(res, 200, { ok: true, id: result.id, created: result.created })
    }
    if (req.method === "PATCH") {
      const input = readStatusInput(await readJsonBody(req, 8192))
      return sendJson(res, 200, await runHelper({ action: "status", actor, id, ...input }))
    }
    if (!isMasterUser(actor)) throw boardError("BOARD_FORBIDDEN")
    return sendJson(res, 200, await runHelper({ action: "delete", actor, id }))
  } catch (error) {
    if (sendCurrentUserError(res, error)) return
    const known = errorResponses[error?.code]
    if (known) return sendJson(res, error.status ?? known[0], { ok: false, code: error.code, error: known[1] })
    return sendJson(res, 500, createSafeApiError({
      code: "BOARD_STORAGE_ERROR", message: "Unable to save or load the board. Check the DB settings and tables.", scope: "history-board",
    }))
  }
}
