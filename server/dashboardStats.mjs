import { readdir, stat } from "node:fs/promises"
import { dirname, join } from "node:path"

import { asyncBufferFromFile, parquetReadObjects } from "hyparquet"
import { compressors } from "hyparquet-compressors"

import {
  LATEST_DATE_FILE_PATTERN,
  SPIDER_DASHBOARD_COLUMNS,
  SPIDER_DATA_PATH_TEMPLATES,
} from "../src/config/spiderDataPaths.mjs"
import { createSafeApiError } from "./safeApiError.mjs"

export const DASHBOARD_STATS_COLUMNS = SPIDER_DASHBOARD_COLUMNS.stats
export const DASHBOARD_STATS_FILE_SUFFIX = "_spider_step_stats.parquets"

const DASHBOARD_STATS_ROOT = process.env.SPIDER_DASHBOARD_STATS_ROOT
  ?? dirname(SPIDER_DATA_PATH_TEMPLATES.dashboardStats)
const statsCache = new Map()

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

function normalizePriority(value) {
  return normalizeText(value).toUpperCase()
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return 0
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function sumColumn(rows, column) {
  return rows.reduce((sum, row) => sum + normalizeNumber(row[column]), 0)
}

function gradeRows(rows, priorities) {
  const allowed = new Set(priorities)
  return rows.filter((row) => allowed.has(normalizePriority(row.priority)))
}

export function getDashboardStatsDate(fileName) {
  if (!fileName.endsWith(DASHBOARD_STATS_FILE_SUFFIX)) return null
  const dateTime = fileName.slice(0, -DASHBOARD_STATS_FILE_SUFFIX.length)
  return LATEST_DATE_FILE_PATTERN.test(dateTime) ? dateTime : null
}

export function resolveLatestDashboardStatsFile(fileNames) {
  const latestDate = fileNames
    .map(getDashboardStatsDate)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .at(-1)
  return latestDate
    ? { latestDate, fileName: `${latestDate}${DASHBOARD_STATS_FILE_SUFFIX}` }
    : null
}

export function buildDashboardStatsMetrics(statsRows) {
  const tlRows = gradeRows(statsRows, ["TL"])
  const abRows = gradeRows(statsRows, ["A", "B", "A/B"])
  const dRows = gradeRows(statsRows, ["D"])
  const nRows = gradeRows(statsRows, ["N"])
  const mRows = gradeRows(statsRows, ["M"])
  const anomalyRows = [...abRows, ...dRows, ...nRows, ...mRows]
  const detectedRecipeIds = new Set(
    anomalyRows
      .filter((row) => normalizeNumber(row.ng) > 0)
      .map((row) => normalizeText(row.recipe_id))
      .filter(Boolean),
  )

  return {
    monitoringSensorTotal: sumColumn(tlRows, "total"),
    detectedPpidCount: detectedRecipeIds.size,
    totalAnomalyCount: sumColumn(anomalyRows, "ng"),
    abGradeCount: sumColumn(abRows, "ng"),
    dGradeCount: sumColumn(dRows, "ng"),
    nGradeCount: sumColumn(nRows, "ng"),
    mGradeCount: sumColumn(mRows, "ng"),
  }
}

async function readStatsRows(filePath) {
  const fileStat = await stat(filePath)
  const cached = statsCache.get(filePath)
  if (cached?.mtimeMs === fileStat.mtimeMs && cached?.size === fileStat.size) {
    return cached.rows
  }

  const file = await asyncBufferFromFile(filePath)
  const rows = await parquetReadObjects({
    file,
    columns: DASHBOARD_STATS_COLUMNS,
    compressors,
  })
  statsCache.clear()
  statsCache.set(filePath, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, rows })
  return rows
}

export async function getDashboardStatsSummary(statsRoot = DASHBOARD_STATS_ROOT) {
  const entries = await readdir(statsRoot, { withFileTypes: true })
  const latestFile = resolveLatestDashboardStatsFile(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
  )
  if (!latestFile) {
    const error = new Error("대시보드 stats 파일을 찾지 못했습니다.")
    error.code = "DASHBOARD_STATS_NOT_FOUND"
    throw error
  }

  const rows = await readStatsRows(join(statsRoot, latestFile.fileName))
  return {
    latestDate: latestFile.latestDate,
    metrics: buildDashboardStatsMetrics(rows),
  }
}

export async function handleDashboardStatsRequest(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      Allow: "GET, HEAD",
      "Content-Type": "application/json; charset=utf-8",
    })
    res.end(JSON.stringify({ ok: false, error: "Method not allowed" }))
    return
  }

  try {
    const payload = await getDashboardStatsSummary()
    if (req.method === "HEAD") {
      res.writeHead(200, { "Cache-Control": "no-store" })
      res.end()
      return
    }
    sendJson(res, 200, { ok: true, ...payload })
  } catch (error) {
    const isNotFound = error.code === "DASHBOARD_STATS_NOT_FOUND"
    const statusCode = isNotFound ? 404 : 500
    if (req.method === "HEAD") {
      res.writeHead(statusCode, { "Cache-Control": "no-store" })
      res.end()
      return
    }
    sendJson(res, statusCode, createSafeApiError({
      code: isNotFound ? error.code : "DASHBOARD_STATS_LOAD_FAILED",
      message: isNotFound
        ? "대시보드 통계 파일을 찾지 못했습니다."
        : "대시보드 통계 파일을 불러오지 못했습니다.",
      scope: "dashboard-stats",
    }))
  }
}
