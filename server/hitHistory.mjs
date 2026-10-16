import { spawn } from "node:child_process"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { fileURLToPath, URL } from "node:url"

import { getRemoteIp, resolveCurrentUser, sendCurrentUserError } from "./currentUser.mjs"
import { commonCommonalityRootPath } from "./latestCommonCommonalityPath.mjs"
import { commonalityRootPath } from "./latestCommonalityPath.mjs"
import { parsePassHistoryPath } from "./passHistory.mjs"
import { createSafeApiError } from "./safeApiError.mjs"
import { buildHitHistoryImage, MAX_HISTORY_REQUEST_BYTES } from "./hitHistoryImage.mjs"

const helperPath = fileURLToPath(new URL("../scripts/hit_history.py", import.meta.url))

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(JSON.stringify(payload))
}

function normalizeText(value) {
  return String(value ?? "").trim()
}

function normalizeDbDateTime(value, now = new Date()) {
  const date = normalizeText(value) ? new Date(value) : now
  if (Number.isNaN(date.getTime())) throw new Error("The history save time is invalid.")
  const pad = (number) => String(number).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const COMMON_ANOMALY_ROOT = "/appdata/abnormal_trend/pic/common"
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

function isValidDateParts(match) {
  if (!match) return false
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match
  const date = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ))
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day)
    && date.getUTCHours() === Number(hour)
    && date.getUTCMinutes() === Number(minute)
    && date.getUTCSeconds() === Number(second)
}

function isValidDateOnly(value) {
  return isValidDateParts(normalizeText(value).match(DATE_ONLY_PATTERN))
}

function isValidDateTime(value) {
  return isValidDateParts(normalizeText(value).match(DATE_TIME_PATTERN))
}

function assertSafeAbsolutePath(filePath) {
  if (!isAbsolute(filePath)) throw new Error("The Chart file path must be absolute.")
  if (filePath.slice(1).split(/[\\/]/).some((segment) => segment === "")) {
    throw new Error("The Chart file path contains an empty segment.")
  }
  if (filePath.split(/[\\/]/).some((segment) => segment === "." || segment === "..")) {
    throw new Error("The Chart file path contains a disallowed segment.")
  }
}

function hasRequiredSegments(segments) {
  return segments.every((segment) => normalizeText(segment))
}

function parsePathSegments(filePath, rootPath) {
  const normalizedRoot = resolve(normalizeText(rootPath).replaceAll("/pic_server2/", "/pic/"))
  const normalizedFile = resolve(filePath)
  if (!normalizedFile.startsWith(`${normalizedRoot}${sep}`)) return null
  return relative(normalizedRoot, normalizedFile).split(sep).filter(Boolean)
}

export function parseHitHistoryPath(filePath, {
  commonalityRoot = commonalityRootPath,
  commonCommonalityRoot = commonCommonalityRootPath,
} = {}) {
  const originalPath = normalizeText(filePath)
  assertSafeAbsolutePath(originalPath)
  const normalizedPath = originalPath.replaceAll("/pic_server2/", "/pic/")

  const commonSegments = parsePathSegments(normalizedPath, COMMON_ANOMALY_ROOT)
  if (commonSegments) {
    const imageName = commonSegments.at(-1) ?? ""
    if (commonSegments.length !== 7
      || !hasRequiredSegments(commonSegments)
      || (!isValidDateOnly(commonSegments[0]) && !isValidDateTime(commonSegments[0]))
      || !imageName.toLowerCase().endsWith(".png")
      || imageName.slice(0, -".png".length).trim() === "") {
      throw new Error("HIT history information was not found in the common-area anomaly result path.")
    }
    return { updateDate: commonSegments[0], sdwt: commonSegments[1] }
  }

  const commonalitySegments = parsePathSegments(normalizedPath, commonalityRoot)
  if (commonalitySegments) {
    const sensorChStep = commonalitySegments[7] ?? ""
    const delimiterIndex = sensorChStep.lastIndexOf("_")
    if (commonalitySegments.length !== 9
      || !hasRequiredSegments(commonalitySegments)
      || !isValidDateTime(commonalitySegments[0])
      || commonalitySegments[6] !== commonalitySegments[5]
      || delimiterIndex <= 0
      || delimiterIndex === sensorChStep.length - 1
      || commonalitySegments.at(-1) !== "img.png") {
      throw new Error("HIT history information was not found in the similarity anomaly result path.")
    }
    return { updateDate: commonalitySegments[0], sdwt: commonalitySegments[1] }
  }

  const commonCommonalitySegments = parsePathSegments(normalizedPath, commonCommonalityRoot)
  if (commonCommonalitySegments) {
    const sensorChStep = commonCommonalitySegments[4] ?? ""
    const delimiterIndex = sensorChStep.indexOf("@")
    if (commonCommonalitySegments.length !== 6
      || !hasRequiredSegments(commonCommonalitySegments)
      || !isValidDateOnly(commonCommonalitySegments[0])
      || delimiterIndex <= 0
      || delimiterIndex === sensorChStep.length - 1
      || commonCommonalitySegments.at(-1) !== "img.png") {
      throw new Error("HIT history information was not found in the common-area similarity result path.")
    }
    return { updateDate: commonCommonalitySegments[0], sdwt: commonCommonalitySegments[1] }
  }

  const { updateDate, sdwt } = parsePassHistoryPath(normalizedPath)
  if (!isValidDateOnly(updateDate) && !isValidDateTime(updateDate)) {
    throw new Error("The date in the ERD chart path is invalid.")
  }
  return { updateDate, sdwt }
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk)
    if (size > MAX_HISTORY_REQUEST_BYTES) throw Object.assign(new TypeError("이력 저장 요청이 너무 큽니다."), { status: 413 })
    chunks.push(Buffer.from(chunk))
  }
  const body = Buffer.concat(chunks).toString("utf8")
  if (!body.trim()) return {}
  try {
    const input = JSON.parse(body)
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error()
    return input
  } catch {
    throw new TypeError("The request JSON is invalid.")
  }
}

function runHitHistoryHelper(payload) {
  return new Promise((resolvePromise, reject) => {
    const helperPayload = ["list", "image"].includes(payload.action)
      ? payload
      : { ...payload, execDate: buildHitHistoryDbRecord(payload).exec_date }
    const child = spawn("python3", ["-B", helperPath], {
      env: process.env,
      stdio: ["pipe", "pipe", "ignore"],
    })
    let stdout = ""
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, 30_000)

    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.on("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on("close", () => {
      clearTimeout(timeout)
      if (timedOut) {
        reject(new Error("Saving HIT history timed out."))
        return
      }

      let result
      try {
        result = JSON.parse(stdout.trim())
      } catch {
        reject(new Error("Unable to parse the HIT history response."))
        return
      }
      if (!result.ok) {
        reject(Object.assign(new Error(result.error || "Unable to save HIT history."), { code: result.code }))
        return
      }
      resolvePromise(result)
    })

    child.stdin.on("error", reject)
    child.stdin.end(JSON.stringify(helperPayload))
  })
}

export function buildHitHistoryDbRecord(record, now = new Date()) {
  return {
    update_date: normalizeText(record.updateDate),
    line_id: normalizeText(record.lineId),
    sdwt: normalizeText(record.sdwt),
    file_path: normalizeText(record.filePath),
    knox_id: normalizeText(record.knoxId),
    exec_date: normalizeDbDateTime(record.execDate, now),
  }
}

export function buildHitHistoryRecord({
  lineId,
  updateDate = "",
  sdwt = "",
  filePath,
  knoxId,
  execDate = "",
}) {
  const normalizedLineId = normalizeText(lineId)
  const originalFilePath = normalizeText(filePath)
  if (!normalizedLineId) throw new Error("Line Name is required.")
  if (!originalFilePath) throw new Error("A Chart file path is required.")

  const selectedUpdateDate = normalizeText(updateDate)
  const selectedSdwt = normalizeText(sdwt)
  const parsedPath = selectedUpdateDate && selectedSdwt
    ? { updateDate: selectedUpdateDate, sdwt: selectedSdwt }
    : parseHitHistoryPath(originalFilePath)
  return {
    updateDate: parsedPath.updateDate,
    lineId: normalizedLineId,
    sdwt: parsedPath.sdwt,
    filePath: originalFilePath.replaceAll("/", "#"),
    knoxId: normalizeText(knoxId),
    execDate: normalizeText(execDate),
  }
}

export function buildHitHistoryQuery(searchParams) {
  const query = { action: "list" }
  for (const key of ["lineId", "sdwt", "knoxId", "search"]) {
    query[key] = normalizeText(searchParams.get(key))
    if (query[key].length > 256) throw new Error("The search value is too long.")
  }
  for (const key of ["dateFrom", "dateTo"]) {
    query[key] = normalizeText(searchParams.get(key))
    if (query[key] && !isValidDateOnly(query[key])) throw new Error("The search date is invalid.")
  }
  if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
    throw new Error("The start date must not be after the end date.")
  }
  query.page = Number(searchParams.get("page") ?? 1)
  query.pageSize = Number(searchParams.get("pageSize") ?? 20)
  if (!Number.isSafeInteger(query.page) || query.page < 1 || query.page > 1000000
    || !Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100) {
    throw new Error("The requested page is invalid.")
  }
  return query
}

export async function handleHitHistoryRequest(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    sendJson(res, 405, { ok: false, error: "Method not allowed" })
    return
  }

  try {
    if (req.method === "GET") {
      const searchParams = new URL(req.url, "http://localhost").searchParams
      if (searchParams.has("imageId")) {
        const imageId = searchParams.get("imageId")
        if (!/^[a-f0-9]{64}$/.test(imageId)) throw new TypeError("이미지 ID를 확인해 주세요.")
        const result = await runHitHistoryHelper({ action: "image", imageId })
        const image = Buffer.from(result.imageBase64, "base64")
        res.writeHead(200, {
          "Content-Type": "image/png", "Content-Length": image.length,
          "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Content-Disposition": 'inline; filename="chart.png"',
        })
        res.end(image)
        return
      }
      let query
      try {
        query = buildHitHistoryQuery(searchParams)
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message })
        return
      }
      const result = await runHitHistoryHelper(query)
      sendJson(res, 200, result)
      return
    }
    const remoteIp = getRemoteIp(req)
    if (!remoteIp) {
      sendJson(res, 400, { ok: false, error: "Unable to identify the current user." })
      return
    }
    const [body, currentUser] = await Promise.all([
      readJsonBody(req),
      resolveCurrentUser(remoteIp),
    ])
    const record = buildHitHistoryRecord({
      ...body,
      knoxId: currentUser.knoxId,
    })
    const snapshot = buildHitHistoryImage(body, currentUser.knoxId)
    const result = await runHitHistoryHelper({ ...record, ...snapshot })
    sendJson(res, 200, result)
  } catch (error) {
    if (sendCurrentUserError(res, error)) return
    if (error instanceof TypeError) {
      sendJson(res, error.status ?? 400, { ok: false, error: error.message })
      return
    }
    if (error.code === "HISTORY_IMAGE_NOT_FOUND") {
      sendJson(res, 404, { ok: false, error: "저장된 차트 이미지가 없습니다." })
      return
    }
    if (error.code === "HISTORY_REQUEST_CONFLICT") {
      sendJson(res, 409, { ok: false, error: "이미 다른 내용으로 저장한 요청입니다. 게시판에서 확인해 주세요." })
      return
    }
    const errorPayload = createSafeApiError({
      code: "HIT_HISTORY_REQUEST_FAILED",
      message: "Unable to process the HIT history request.",
      scope: "hit-history",
    })
    sendJson(res, 500, errorPayload)
  }
}
