import { spawn } from "node:child_process"
import { relative, resolve, sep } from "node:path"
import { fileURLToPath, URL } from "node:url"

import { getRemoteIp, resolveCurrentUser } from "./currentUser.mjs"
import { commonCommonalityRootPath } from "./latestCommonCommonalityPath.mjs"
import { parsePassHistoryPath } from "./passHistory.mjs"
import { createSafeApiError } from "./safeApiError.mjs"

const COMMON_FILE_ROOT = "/appdata/abnormal_trend/pic/common"
const COMMON_COMMONALITY_FILE_ROOT = commonCommonalityRootPath
const helperPath = fileURLToPath(new URL("../scripts/clicked_category_history.py", import.meta.url))
const SUPPORTED_APPS = new Set(["self", "commonality", "common"])
const ALL_VALUES = "ALL"

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

function uniqueValues(values) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function formatList(values) {
  return `[${values.map((value) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`).join(", ")}]`
}

function formatCategory(values, alwaysList = false) {
  const unique = uniqueValues(values)
  if (!unique.length) throw new Error("Unable to determine the click-history category value.")
  if (unique.length === 1 && unique[0] === ALL_VALUES) return ALL_VALUES
  return alwaysList || unique.length > 1 ? formatList(unique) : unique[0]
}

function parseCommonPath(filePath) {
  const normalizedPath = normalizeText(filePath).replaceAll("pic_server2", "pic")
  const resolvedPath = resolve(normalizedPath)
  if (!resolvedPath.startsWith(`${COMMON_FILE_ROOT}${sep}`)) {
    throw new Error("This common-area Drawing path is not allowed.")
  }
  const segments = relative(COMMON_FILE_ROOT, resolvedPath).split(sep)
  if (segments.length !== 7 || segments.at(-1) !== "data.parquet") {
    throw new Error("The common-area Drawing path format is invalid.")
  }
  const [, sdwt, , grade, sensor] = segments
  return { sdwt, grade, sensor }
}

export function parseCommonalityPath(
  filePath,
  commonCommonalityFileRoot = COMMON_COMMONALITY_FILE_ROOT,
) {
  const resolvedPath = resolve(normalizeText(filePath))
  if (resolvedPath.startsWith(`${commonCommonalityFileRoot}${sep}`)) {
    const segments = relative(commonCommonalityFileRoot, resolvedPath).split(sep)
    if (segments.length !== 6 || segments.at(-1) !== "img.png") {
      throw new Error("The common-area similarity Drawing path format is invalid.")
    }
    const [, sdwt, , grade, sensorChStep] = segments
    const delimiterIndex = sensorChStep.indexOf("@")
    if (delimiterIndex <= 0) throw new Error("No sensor was found in the common-area similarity Drawing path.")
    return { sdwt, grade, sensor: sensorChStep.slice(0, delimiterIndex) }
  }

  const segments = resolvedPath.split(sep).filter(Boolean)
  if (segments.length < 8 || segments.at(-1) !== "img.png") {
    throw new Error("The similarity Drawing path format is invalid.")
  }
  const [sdwt, grade, , , ppid, duplicatePpid, sensorChStep] = segments.slice(-8, -1)
  if (ppid !== duplicatePpid) throw new Error("The PPID in the similarity Drawing path is invalid.")
  const delimiterIndex = sensorChStep.lastIndexOf("_")
  if (delimiterIndex <= 0) throw new Error("No sensor was found in the similarity Drawing path.")
  return { sdwt, grade, sensor: sensorChStep.slice(0, delimiterIndex) }
}

function parseDrawingPath(app, filePath) {
  if (app === "self") {
    const values = parsePassHistoryPath(filePath)
    return { sdwt: values.sdwt, grade: values.priority, sensor: values.sensor }
  }
  return app === "common" ? parseCommonPath(filePath) : parseCommonalityPath(filePath)
}

function normalizeDbUpdateDate(value, now = new Date()) {
  const date = normalizeText(value) ? new Date(value) : now
  if (Number.isNaN(date.getTime())) throw new Error("The click time is invalid.")
  const pad = (number) => String(number).padStart(2, "0")
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(" ")
}

export function buildClickedCategoryHistoryDbRecord(record, now = new Date()) {
  return {
    line_id: normalizeText(record.lineId),
    sdwt: normalizeText(record.sdwt),
    grade: normalizeText(record.grade),
    sensor: normalizeText(record.sensor),
    update_date: normalizeDbUpdateDate(record.updateDate, now),
    knox_id: normalizeText(record.knoxId),
  }
}

export function buildClickedCategoryHistoryRecord({
  app,
  lineId,
  filePaths,
  grades = [],
  selectedSdwt = "",
  selectedSensor = "",
  clickedAt = "",
  knoxId,
}) {
  const normalizedApp = normalizeText(app)
  const normalizedLineId = normalizeText(lineId)
  const paths = uniqueValues(Array.isArray(filePaths) ? filePaths : [])
  const normalizedSelectedSdwt = normalizeText(selectedSdwt)
  const normalizedSelectedSensor = normalizeText(selectedSensor)
  const isAllSensorSelection = normalizedSelectedSensor === ALL_VALUES
  if (!SUPPORTED_APPS.has(normalizedApp)) throw new Error("The click-history app value is invalid.")
  if (!normalizedLineId) throw new Error("Line Name is required.")
  if (!paths.length) throw new Error("A Chart Drawing path is required.")

  const useExplicitSelection = (normalizedApp === "self" || normalizedApp === "commonality")
    && normalizedSelectedSdwt
    && Array.isArray(grades)
    && grades.length
    && normalizedSelectedSensor
  const pathValues = useExplicitSelection
    ? [{
      sdwt: normalizedSelectedSdwt,
      grade: "",
      sensor: normalizedSelectedSensor,
    }]
    : paths.map((filePath) => parseDrawingPath(normalizedApp, filePath))
  const suffix = normalizedApp === "commonality" ? "(g)" : normalizedApp === "common" ? "(c)" : ""
  const requestedGrades = (
    normalizedApp === "self"
    || (normalizedApp === "commonality" && useExplicitSelection)
  ) && Array.isArray(grades) && grades.length
    ? grades
    : pathValues.map((values) => values.grade)
  const sensor = isAllSensorSelection
    ? ALL_VALUES
    : formatCategory(useExplicitSelection
      ? [normalizedSelectedSensor]
      : pathValues.map((values) => values.sensor))
  return {
    lineId: `${normalizedLineId}${suffix}`,
    sdwt: formatCategory(useExplicitSelection
      ? [normalizedSelectedSdwt]
      : pathValues.map((values) => values.sdwt)),
    grade: formatCategory(requestedGrades, normalizedApp === "self"),
    sensor,
    updateDate: normalizeText(clickedAt),
    knoxId: normalizeText(knoxId),
  }
}

async function readJsonBody(req) {
  let body = ""
  for await (const chunk of req) {
    body += chunk
    if (body.length > 2 * 1024 * 1024) throw new Error("The request payload is too large.")
  }
  if (!body.trim()) return {}
  try {
    return JSON.parse(body)
  } catch {
    throw new Error("The request JSON is invalid.")
  }
}

function runHelper(payload) {
  return new Promise((resolvePromise, reject) => {
    const dbRecord = buildClickedCategoryHistoryDbRecord(payload)
    const helperPayload = { ...payload, updateDate: dbRecord.update_date }
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
        reject(new Error("Click-history DB processing timed out."))
        return
      }
      let result
      try {
        result = JSON.parse(stdout.trim())
      } catch {
        reject(new Error("Unable to parse the click-history response."))
        return
      }
      if (!result.ok) {
        reject(new Error(result.error || "Unable to save click history."))
        return
      }
      resolvePromise(result)
    })
    child.stdin.end(JSON.stringify(helperPayload))
  })
}

export async function handleClickedCategoryHistoryRequest(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" })
    return
  }
  try {
    const remoteIp = getRemoteIp(req)
    if (!remoteIp) {
      sendJson(res, 400, { ok: false, error: "Unable to determine the client IP." })
      return
    }
    const [body, currentUser] = await Promise.all([readJsonBody(req), resolveCurrentUser(remoteIp)])
    const record = buildClickedCategoryHistoryRecord({ ...body, knoxId: currentUser.knoxId })
    const result = await runHelper(record)
    if (Number(result.affectedRows) < 1) {
      throw new Error("Click history was not written to the DB.")
    }
    sendJson(res, 200, result)
  } catch {
    const errorPayload = createSafeApiError({
      code: "CLICKED_CATEGORY_HISTORY_REQUEST_FAILED",
      message: "Unable to process the click-history request.",
      scope: "clicked-category-history",
    })
    sendJson(res, 500, errorPayload)
  }
}
