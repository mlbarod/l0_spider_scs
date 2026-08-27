import { spawn } from "node:child_process"
import { relative, resolve, sep } from "node:path"
import { fileURLToPath, URL } from "node:url"

import { getRemoteIp, resolveCurrentUser } from "./currentUser.mjs"
import { commonCommonalityRootPath } from "./latestCommonCommonalityPath.mjs"
import { parsePassHistoryPath } from "./passHistory.mjs"
import { createSafeApiError } from "./safeApiError.mjs"
import { attachHistoryDbWriteLogger, logHistoryDbAttempt } from "./historyDebugLog.mjs"

const COMMON_FILE_ROOT = "/appdata/abnormal_trend/pic/common"
const COMMON_COMMONALITY_FILE_ROOT = commonCommonalityRootPath
const helperPath = fileURLToPath(new URL("../scripts/clicked_category_history.py", import.meta.url))
const SUPPORTED_APPS = new Set(["self", "commonality", "common"])
const ALL_VALUES = "ALL"
const SAFE_RECORD_BUILD_FAILURES = new Set([
  "클릭이력 App 구분값이 올바르지 않습니다.",
  "Line Name이 필요합니다.",
  "Chart Drawing 경로가 필요합니다.",
  "클릭이력 카테고리 값을 찾지 못했습니다.",
  "클릭 시각이 올바르지 않습니다.",
  "요청 데이터가 너무 큽니다.",
  "요청 JSON이 올바르지 않습니다.",
])

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
  if (!unique.length) throw new Error("클릭이력 카테고리 값을 찾지 못했습니다.")
  if (unique.length === 1 && unique[0] === ALL_VALUES) return ALL_VALUES
  return alwaysList || unique.length > 1 ? formatList(unique) : unique[0]
}

function parseCommonPath(filePath) {
  const normalizedPath = normalizeText(filePath).replaceAll("pic_server2", "pic")
  const resolvedPath = resolve(normalizedPath)
  if (!resolvedPath.startsWith(`${COMMON_FILE_ROOT}${sep}`)) {
    throw new Error("허용되지 않은 공통부 Drawing 경로입니다.")
  }
  const segments = relative(COMMON_FILE_ROOT, resolvedPath).split(sep)
  if (segments.length !== 7 || segments.at(-1) !== "data.parquet") {
    throw new Error("공통부 Drawing 경로 형식이 올바르지 않습니다.")
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
      throw new Error("공통부 동일성 Drawing 경로 형식이 올바르지 않습니다.")
    }
    const [, sdwt, , grade, sensorChStep] = segments
    const delimiterIndex = sensorChStep.indexOf("@")
    if (delimiterIndex <= 0) throw new Error("공통부 동일성 Drawing 경로에서 sensor를 찾지 못했습니다.")
    return { sdwt, grade, sensor: sensorChStep.slice(0, delimiterIndex) }
  }

  const segments = resolvedPath.split(sep).filter(Boolean)
  if (segments.length < 8 || segments.at(-1) !== "img.png") {
    throw new Error("동일성 Drawing 경로 형식이 올바르지 않습니다.")
  }
  const [sdwt, grade, , , ppid, duplicatePpid, sensorChStep] = segments.slice(-8, -1)
  if (ppid !== duplicatePpid) throw new Error("동일성 Drawing 경로의 PPID가 올바르지 않습니다.")
  const delimiterIndex = sensorChStep.lastIndexOf("_")
  if (delimiterIndex <= 0) throw new Error("동일성 Drawing 경로에서 sensor를 찾지 못했습니다.")
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
  if (Number.isNaN(date.getTime())) throw new Error("클릭 시각이 올바르지 않습니다.")
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
  if (!SUPPORTED_APPS.has(normalizedApp)) throw new Error("클릭이력 App 구분값이 올바르지 않습니다.")
  if (!normalizedLineId) throw new Error("Line Name이 필요합니다.")
  if (!paths.length) throw new Error("Chart Drawing 경로가 필요합니다.")

  const useSelfSelection = normalizedApp === "self"
    && normalizedSelectedSdwt
    && Array.isArray(grades)
    && grades.length
    && normalizedSelectedSensor
  const pathValues = useSelfSelection
    ? [{
      sdwt: normalizedSelectedSdwt,
      grade: "",
      sensor: normalizedSelectedSensor,
    }]
    : paths.map((filePath) => parseDrawingPath(normalizedApp, filePath))
  const suffix = normalizedApp === "commonality" ? "(g)" : normalizedApp === "common" ? "(c)" : ""
  const requestedGrades = normalizedApp === "self" && Array.isArray(grades) && grades.length
    ? grades
    : pathValues.map((values) => values.grade)
  const sensor = isAllSensorSelection
    ? ALL_VALUES
    : formatCategory(useSelfSelection
      ? [normalizedSelectedSensor]
      : pathValues.map((values) => values.sensor))
  return {
    lineId: `${normalizedLineId}${suffix}`,
    sdwt: formatCategory(useSelfSelection
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
    if (body.length > 2 * 1024 * 1024) throw new Error("요청 데이터가 너무 큽니다.")
  }
  if (!body.trim()) return {}
  try {
    return JSON.parse(body)
  } catch {
    throw new Error("요청 JSON이 올바르지 않습니다.")
  }
}

function runHelper(payload) {
  return new Promise((resolvePromise, reject) => {
    const debugRecord = buildClickedCategoryHistoryDbRecord(payload)
    const helperPayload = { ...payload, updateDate: debugRecord.update_date }
    const child = spawn("python3", ["-B", helperPath], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    })
    attachHistoryDbWriteLogger(child)
    let stdout = ""
    let timedOut = false
    const rejectWithDebugRecord = (error) => {
      error.debugRecord = error.debugRecord ?? debugRecord
      reject(error)
    }
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, 30_000)
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.on("error", (error) => {
      clearTimeout(timeout)
      rejectWithDebugRecord(error)
    })
    child.on("close", () => {
      clearTimeout(timeout)
      if (timedOut) {
        rejectWithDebugRecord(new Error("클릭이력 DB 처리 시간이 초과되었습니다."))
        return
      }
      let result
      try {
        result = JSON.parse(stdout.trim())
      } catch {
        rejectWithDebugRecord(new Error("클릭이력 응답을 해석하지 못했습니다."))
        return
      }
      if (!result.ok) {
        const error = new Error(result.error || "클릭이력을 저장하지 못했습니다.")
        error.debugRecord = result.debugRecord ?? debugRecord
        rejectWithDebugRecord(error)
        return
      }
      resolvePromise({ ...result, debugRecord: result.debugRecord ?? debugRecord })
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
      sendJson(res, 400, { ok: false, error: "접속자 IP를 확인하지 못했습니다." })
      return
    }
    const [body, currentUser] = await Promise.all([readJsonBody(req), resolveCurrentUser(remoteIp)])
    const record = buildClickedCategoryHistoryRecord({ ...body, knoxId: currentUser.knoxId })
    logHistoryDbAttempt({
      table: "clicked_category_history",
      operation: "INSERT",
      records: [record],
    })
    const result = await runHelper(record)
    if (Number(result.affectedRows) < 1) {
      const error = new Error("클릭이력이 DB에 반영되지 않았습니다.")
      error.debugRecord = result.debugRecord
      throw error
    }
    sendJson(res, 200, result)
  } catch (error) {
    const errorPayload = createSafeApiError({
      code: "CLICKED_CATEGORY_HISTORY_REQUEST_FAILED",
      message: "클릭이력 요청을 처리하지 못했습니다.",
      scope: "clicked-category-history",
    })
    const failureStage = error?.debugRecord ? "db-write" : "record-build"
    const failureDetail = failureStage === "record-build"
      ? SAFE_RECORD_BUILD_FAILURES.has(error?.message)
        ? error.message
        : "클릭이력 최종 6컬럼 생성 조건을 확인하지 못했습니다."
      : undefined
    console.error(`[clicked-history-failure] requestId=${errorPayload.requestId} stage=${failureStage} reason=${JSON.stringify(error?.message ?? "unknown")}`)
    sendJson(res, 500, {
      ...errorPayload,
      failureStage,
      ...(failureDetail ? { failureDetail } : {}),
      ...(error?.debugRecord ? { debugRecord: error.debugRecord } : {}),
    })
  }
}
