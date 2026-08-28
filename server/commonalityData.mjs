import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"

import {
  asyncBufferFromFile,
  parquetMetadataAsync,
  parquetReadObjects,
  parquetSchema,
} from "hyparquet"
import { compressors } from "hyparquet-compressors"

import { getLatestCommonalityPath } from "./latestCommonalityPath.mjs"
import { getLruEntry, setLruEntry } from "./boundedCache.mjs"
import { createSafeApiError } from "./safeApiError.mjs"
import { excludeSensorRows, readSensorExclusionConfig } from "./sensorExclusionConfig.mjs"

export const COMMONALITY_PATH_COLUMNS = Object.freeze([
  "sdwt_code",
  "step_seq",
  "recipe_id",
  "priority",
  "sensor",
  "ch_step",
])
const PATH_TABLE_CACHE_MAX_ENTRIES = 1
const ALL_SENSORS = "ALL"
const ALL_CH_STEPS = "ALL"
const pathTableCache = new Map()
const pathTablePending = new Map()

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

async function isRegularFile(filePath) {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

export function normalizeCommonalityPathRows(rows, latestPath) {
  return rows.flatMap((row, index) => {
    const sdwt = normalizeText(row.sdwt_code)
    const stepSeq = normalizeText(row.step_seq)
    const recipeId = normalizeText(row.recipe_id)
    const priority = normalizeText(row.priority)
    const sensor = normalizeText(row.sensor)
    const chStep = normalizeText(row.ch_step)
    const sourcePath = normalizeText(row.path || row.file_path)
    if (!sdwt || !stepSeq || !recipeId || !priority || !sensor || !chStep || !sourcePath) {
      return []
    }
    if (!isAbsolute(sourcePath)) return []
    const filePath = join(resolve(sourcePath), "img.png")
    return [{
      id: `${index}-${filePath}`,
      latestDate: latestPath.date,
      sdwt,
      grade: priority,
      stepSeq,
      stepDesc: stepSeq,
      ppid: recipeId,
      duplicatePpid: recipeId,
      sensor,
      chStep,
      filePath,
    }]
  })
}

export async function readCommonalityPathRows(latestPath) {
  const fileStat = await stat(latestPath.path)
  const cached = getLruEntry(pathTableCache, latestPath.path)
  if (cached?.mtimeMs === fileStat.mtimeMs && cached?.size === fileStat.size) {
    return cached.rows
  }
  if (pathTablePending.has(latestPath.path)) return pathTablePending.get(latestPath.path)

  const pending = (async () => {
    const file = await asyncBufferFromFile(latestPath.path)
    const metadata = await parquetMetadataAsync(file)
    const schemaColumns = new Set(
      parquetSchema(metadata).children.map((column) => column.element.name),
    )
    const pathColumns = ["path", "file_path"].filter((column) => schemaColumns.has(column))
    const missingColumns = COMMONALITY_PATH_COLUMNS.filter((column) => !schemaColumns.has(column))
    if (!pathColumns.length) missingColumns.push("path 또는 file_path")
    if (missingColumns.length) {
      const error = new Error(`동일성 경로 테이블 필수 컬럼이 없습니다: ${missingColumns.join(", ")}`)
      error.code = "COMMONALITY_PATH_TABLE_SCHEMA_INVALID"
      throw error
    }
    const sourceRows = await parquetReadObjects({
      file,
      metadata,
      columns: [...COMMONALITY_PATH_COLUMNS, ...pathColumns],
      compressors,
    })
    const normalizedRows = normalizeCommonalityPathRows(sourceRows, latestPath)
    setLruEntry(
      pathTableCache,
      latestPath.path,
      { mtimeMs: fileStat.mtimeMs, size: fileStat.size, rows: normalizedRows },
      PATH_TABLE_CACHE_MAX_ENTRIES,
    )
    return normalizedRows
  })()
  pathTablePending.set(latestPath.path, pending)
  try {
    return await pending
  } finally {
    pathTablePending.delete(latestPath.path)
  }
}

export function scopeCommonalityRows(rows, { pathSdwt, sdwt }) {
  const candidates = new Set([pathSdwt, sdwt].map(normalizeText).filter(Boolean))
  const scopedRows = rows.filter((row) => candidates.has(row.sdwt))
  if (!scopedRows.length) {
    const error = new Error(
      `선택한 SDWT의 동일성 이상감지 행을 찾지 못했습니다: ${Array.from(candidates).join(" 또는 ")}`,
    )
    error.code = "COMMONALITY_SDWT_NOT_FOUND"
    throw error
  }
  return { folderSdwt: scopedRows[0].sdwt, rows: scopedRows }
}

async function getCommonalityIndex({ pathSdwt, sdwt }) {
  const latestPath = await getLatestCommonalityPath()
  const rows = await readCommonalityPathRows(latestPath)
  const scoped = scopeCommonalityRows(rows, { pathSdwt, sdwt })
  return { latestPath, ...scoped }
}

function sortValues(values) {
  return Array.from(new Set(values.filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, "ko", { numeric: true }))
}

export function buildCommonalityFilterPayload(index, filters) {
  const stepSeqs = sortValues(index.rows.map((row) => row.stepSeq))
  const requestedStepSeq = normalizeText(filters.stepSeq || filters.stepDesc)
  const selectedStepSeq = stepSeqs.includes(requestedStepSeq) ? requestedStepSeq : ""
  const stepRows = selectedStepSeq
    ? index.rows.filter((row) => row.stepSeq === selectedStepSeq)
    : []
  const sensors = sortValues(stepRows.map((row) => row.sensor))
  const selectedSensor = filters.sensor === ALL_SENSORS && sensors.length
    ? ALL_SENSORS
    : sensors.includes(filters.sensor) ? filters.sensor : ""
  const sensorRows = selectedSensor === ALL_SENSORS
    ? stepRows
    : selectedSensor
    ? stepRows.filter((row) => row.sensor === selectedSensor)
    : []
  const sensorChSteps = sortValues(sensorRows.map((row) => row.chStep))
  const chSteps = selectedSensor === ALL_SENSORS && sensorChSteps.length
    ? [ALL_CH_STEPS]
    : sensorChSteps
  const selectedChStep = filters.chStep === ALL_CH_STEPS && sensorChSteps.length
    ? ALL_CH_STEPS
    : selectedSensor !== ALL_SENSORS && sensorChSteps.includes(filters.chStep)
    ? filters.chStep
    : ""
  const rows = selectedChStep === ALL_CH_STEPS
    ? sensorRows
    : selectedChStep
    ? sensorRows.filter((row) => row.chStep === selectedChStep)
    : []

  return {
    latest: index.latestPath,
    filters: {
      line: filters.line,
      pathSdwt: filters.pathSdwt,
      sdwt: filters.sdwt,
      folderSdwt: index.folderSdwt,
      stepSeq: selectedStepSeq,
      stepDesc: selectedStepSeq,
      sensor: selectedSensor,
      chStep: selectedChStep,
    },
    stepSeqs,
    stepDescs: stepSeqs,
    sensors,
    chSteps,
    counts: {
      indexedImages: index.rows.length,
      filteredImages: rows.length,
    },
    rows,
  }
}

export async function handleCommonalityDataRequest(req, res, url) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" })
    return
  }

  try {
    const filters = {
      line: normalizeText(url.searchParams.get("line")),
      pathSdwt: normalizeText(url.searchParams.get("pathSdwt")),
      sdwt: normalizeText(url.searchParams.get("sdwt")),
      stepSeq: normalizeText(url.searchParams.get("stepSeq")),
      stepDesc: normalizeText(url.searchParams.get("stepDesc")),
      sensor: normalizeText(url.searchParams.get("sensor")),
      chStep: normalizeText(url.searchParams.get("chStep")),
    }
    if (!filters.line || !filters.pathSdwt || !filters.sdwt) {
      sendJson(res, 400, { ok: false, error: "line, pathSdwt, sdwt 조건이 필요합니다." })
      return
    }

    const [index, sensorExclusionConfig] = await Promise.all([
      getCommonalityIndex(filters),
      readSensorExclusionConfig(),
    ])
    const sensorExclusion = excludeSensorRows(
      index.rows,
      sensorExclusionConfig,
      "matchingAnomaly",
    )
    const payload = buildCommonalityFilterPayload(
      { ...index, rows: sensorExclusion.rows },
      filters,
    )
    sendJson(res, 200, {
      ...payload,
      counts: {
        ...payload.counts,
        indexedImages: index.rows.length,
        excludedSensorImages: sensorExclusion.excludedCount,
      },
    })
  } catch (error) {
    const statusCode = error.code === "COMMONALITY_PATH_TABLE_NOT_FOUND"
      || error.code === "COMMONALITY_SDWT_NOT_FOUND"
      ? 404
      : 500
    sendJson(res, statusCode, createSafeApiError({
      code: statusCode === 404 ? "COMMONALITY_DATA_NOT_FOUND" : "COMMONALITY_DATA_LOAD_FAILED",
      message: statusCode === 404
        ? "동일성 데이터 경로를 찾지 못했습니다."
        : "동일성 데이터를 불러오지 못했습니다.",
      scope: "commonality-data",
    }))
  }
}

export async function handleCommonalityImageRequest(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" })
    return
  }

  const requestedPath = normalizeText(url.searchParams.get("path"))
  try {
    const latestPath = await getLatestCommonalityPath()
    const resolvedPath = resolve(requestedPath)
    const rows = await readCommonalityPathRows(latestPath)
    if (!rows.some((row) => row.filePath === resolvedPath)) {
      sendJson(res, 403, { ok: false, error: "허용되지 않은 동일성 이미지 경로입니다." })
      return
    }
    if (!await isRegularFile(resolvedPath)) {
      sendJson(res, 404, createSafeApiError({
        code: "COMMONALITY_IMAGE_NOT_FOUND",
        message: "동일성 이미지 파일을 찾지 못했습니다.",
        scope: "commonality-image",
      }))
      return
    }

    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
    })
    if (req.method === "HEAD") {
      res.end()
      return
    }
    createReadStream(resolvedPath).pipe(res)
  } catch {
    sendJson(res, 500, createSafeApiError({
      code: "COMMONALITY_IMAGE_LOAD_FAILED",
      message: "동일성 이미지를 불러오지 못했습니다.",
      scope: "commonality-image",
    }))
  }
}
