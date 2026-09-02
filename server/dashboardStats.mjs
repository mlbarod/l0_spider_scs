import { readdir, stat } from "node:fs/promises"
import { dirname, join } from "node:path"

import { asyncBufferFromFile, parquetReadObjects } from "hyparquet"
import { compressors } from "hyparquet-compressors"

import {
  LATEST_DATE_FILE_PATTERN,
  SPIDER_DASHBOARD_COLUMNS,
  SPIDER_DATA_PATH_TEMPLATES,
} from "../src/config/spiderDataPaths.mjs"
import { assertDashboardIntegrity } from "../src/features/fdc-trend/api/dashboardIntegrity.mjs"
import { getLruEntry, setLruEntry } from "./boundedCache.mjs"
import { createSafeApiError } from "./safeApiError.mjs"

export const DASHBOARD_STATS_COLUMNS = SPIDER_DASHBOARD_COLUMNS.stats
export const DASHBOARD_STATS_FILE_SUFFIX = "_spider_step_stats.parquets"

const DASHBOARD_STATS_ROOT = process.env.SPIDER_DASHBOARD_STATS_ROOT
  ?? dirname(SPIDER_DATA_PATH_TEMPLATES.dashboardStats)
const STATS_CACHE_MAX_ENTRIES = 32
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

function parseDate(dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText)
  if (!match) return null
  const [, yearText, monthText, dayText] = match
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)))
  return date.toISOString().slice(0, 10) === dateText ? date : null
}

function shiftDate(dateText, days) {
  const date = parseDate(dateText)
  if (!date) return null
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function enumerateDates(startDate, endDate) {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  if (!start || !end) return []
  const dates = []
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10))
  }
  return dates
}

function compareText(left, right) {
  return left.localeCompare(right, "ko", { numeric: true })
}

function createStatsError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

export function getDashboardStatsDate(fileName) {
  if (!fileName.endsWith(DASHBOARD_STATS_FILE_SUFFIX)) return null
  const dateTime = fileName.slice(0, -DASHBOARD_STATS_FILE_SUFFIX.length)
  if (!LATEST_DATE_FILE_PATTERN.test(dateTime) || !parseDate(dateTime.slice(0, 10))) return null
  const timeMatch = /^(\d{2}):(\d{2}):(\d{2})$/.exec(dateTime.slice(11))
  if (!timeMatch) return null
  const [, hour, minute, second] = timeMatch.map(Number)
  return hour <= 23 && minute <= 59 && second <= 59 ? dateTime : null
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

function aggregateStatsRows(rows) {
  const countsByLine = new Map()
  const gradeCountsByLine = new Map()

  rows.forEach((row) => {
    const lineId = normalizeText(row.line_id)
    const priority = normalizePriority(row.priority)
    if (!lineId || !["A", "B", "A/B", "D", "N", "M"].includes(priority)) return
    const count = normalizeNumber(row.ng)
    countsByLine.set(lineId, (countsByLine.get(lineId) ?? 0) + count)
    const gradeCounts = gradeCountsByLine.get(lineId) ?? new Map()
    gradeCounts.set(priority, (gradeCounts.get(priority) ?? 0) + count)
    gradeCountsByLine.set(lineId, gradeCounts)
  })

  return { countsByLine, gradeCountsByLine }
}

export function buildStatsLineDashboard(datedRows, previousRows, filters) {
  const aggregatesByDate = new Map(datedRows.map(({ dateTime, rows }) => [
    dateTime.slice(0, 10),
    { dateTime, ...aggregateStatsRows(rows) },
  ]))
  const previousAggregate = previousRows ? aggregateStatsRows(previousRows.rows) : null
  const availableLines = Array.from(new Set(
    Array.from(aggregatesByDate.values()).flatMap((aggregate) => (
      Array.from(aggregate.countsByLine.keys())
    )),
  )).sort(compareText)
  const requestedLines = Array.from(new Set((filters.lines ?? []).map(normalizeText).filter(Boolean)))
  if (requestedLines.some((lineId) => !availableLines.includes(lineId))) {
    throw createStatsError("DASHBOARD_STATS_INVALID_FILTER", "The requested line_id is outside the statistics scope.")
  }
  const selectedLines = requestedLines.length ? requestedLines : availableLines
  const dates = enumerateDates(filters.startDate, filters.endDate)
  const latestDateTime = datedRows.map((item) => item.dateTime).sort().at(-1) ?? null
  const latestDate = latestDateTime?.slice(0, 10) ?? null
  const previousDateTime = previousRows?.dateTime ?? null
  const previousDate = previousDateTime?.slice(0, 10) ?? null
  const getCount = (date, lineId) => aggregatesByDate.get(date)?.countsByLine.get(lineId) ?? 0
  const getGradeCount = (date, lineId, priorities) => priorities.reduce((sum, priority) => (
    sum + (aggregatesByDate.get(date)?.gradeCountsByLine.get(lineId)?.get(priority) ?? 0)
  ), 0)

  const lineSummary = selectedLines.map((lineId) => {
    const totalCount = dates.reduce((sum, date) => sum + getCount(date, lineId), 0)
    const latestDateCount = latestDate ? getCount(latestDate, lineId) : 0
    const previousDateCount = previousAggregate
      ? previousAggregate.countsByLine.get(lineId) ?? 0
      : null
    const sensorGrades = Array.from(new Set(datedRows.flatMap(({ rows }) => (
      rows
        .filter((row) => normalizeText(row.line_id) === lineId)
        .map((row) => normalizePriority(row.priority))
        .filter((priority) => ["A", "B", "A/B", "D", "N", "M"].includes(priority))
    )))).sort(compareText)
    return {
      lineId,
      totalCount,
      abGradeCount: dates.reduce((sum, date) => (
        sum + getGradeCount(date, lineId, ["A", "B", "A/B"])
      ), 0),
      latestDateCount,
      previousDateCount,
      changeCount: previousDateCount === null ? null : latestDateCount - previousDateCount,
      lastAbnormalDate: [...dates].reverse().find((date) => getCount(date, lineId) > 0) ?? null,
      ratio: 0,
      sdwts: [],
      sensorGrades,
    }
  })
  const totalAbnormalCount = lineSummary.reduce((sum, row) => sum + row.totalCount, 0)
  lineSummary.forEach((row) => {
    row.ratio = totalAbnormalCount
      ? Number(((row.totalCount / totalAbnormalCount) * 100).toFixed(2))
      : 0
  })
  lineSummary.sort((left, right) => right.totalCount - left.totalCount || compareText(left.lineId, right.lineId))

  const latestDateCount = lineSummary.reduce((sum, row) => sum + row.latestDateCount, 0)
  const previousDateCount = previousAggregate
    ? lineSummary.reduce((sum, row) => sum + row.previousDateCount, 0)
    : null
  const sumGradeCount = (priorities) => dates.reduce((dateSum, date) => (
    dateSum + selectedLines.reduce((lineSum, lineId) => (
      lineSum + getGradeCount(date, lineId, priorities)
    ), 0)
  ), 0)
  const latestRows = latestDate
    ? datedRows.find((item) => item.dateTime === latestDateTime)?.rows ?? []
    : []
  const latestMetrics = buildDashboardStatsMetrics(latestRows)
  const topLine = lineSummary.find((row) => row.totalCount > 0) ?? null
  const payload = {
    filters: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      lines: requestedLines,
    },
    options: {
      lines: availableLines,
      minDate: filters.minDate,
      maxDate: filters.maxDate,
      defaultStartDate: filters.defaultStartDate,
      defaultEndDate: filters.defaultEndDate,
    },
    summary: {
      totalAbnormalCount,
      abnormalLineCount: lineSummary.filter((row) => row.totalCount > 0).length,
      latestDate,
      latestDateTime,
      latestDateCount,
      topLine: topLine?.lineId ?? null,
      topLineCount: topLine?.totalCount ?? 0,
      previousDate,
      previousDateTime,
      changeFromPreviousDay: previousDateCount === null ? null : latestDateCount - previousDateCount,
      monitoringSensorTotal: latestMetrics.monitoringSensorTotal,
      abGradeCount: sumGradeCount(["A", "B", "A/B"]),
      dGradeCount: sumGradeCount(["D"]),
      nGradeCount: sumGradeCount(["N"]),
      mGradeCount: sumGradeCount(["M"]),
    },
    lineSummary,
    dailyTrend: dates.flatMap((date) => lineSummary.map((row) => ({
      date,
      lineId: row.lineId,
      abnormalCount: getCount(date, row.lineId),
    }))),
    mailingSummary: [],
    meta: {
      filesRead: datedRows.length,
      comparisonFileRead: Boolean(previousRows),
      unmappedRows: 0,
    },
  }
  assertDashboardIntegrity(payload, {
    startDate: filters.startDate,
    endDate: filters.endDate,
    lines: requestedLines,
  })
  return payload
}

async function readStatsRows(filePath) {
  const fileStat = await stat(filePath)
  const cached = getLruEntry(statsCache, filePath)
  if (cached?.mtimeMs === fileStat.mtimeMs && cached?.size === fileStat.size) return cached.rows

  const file = await asyncBufferFromFile(filePath)
  const rows = await parquetReadObjects({ file, columns: DASHBOARD_STATS_COLUMNS, compressors })
  setLruEntry(
    statsCache,
    filePath,
    { mtimeMs: fileStat.mtimeMs, size: fileStat.size, rows },
    STATS_CACHE_MAX_ENTRIES,
  )
  return rows
}

async function listStatsFiles(statsRoot) {
  const entries = await readdir(statsRoot, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      dateTime: getDashboardStatsDate(entry.name),
      fileName: entry.name,
      filePath: join(statsRoot, entry.name),
    }))
    .filter((file) => file.dateTime)
    .sort((left, right) => left.dateTime.localeCompare(right.dateTime))
}

function resolveDateRange(files, requestedFilters) {
  if (!files.length) {
    throw createStatsError("DASHBOARD_STATS_NOT_FOUND", "Unable to find the dashboard stats file.")
  }
  const dates = Array.from(new Set(files.map((file) => file.dateTime.slice(0, 10)))).sort()
  const minDate = dates[0]
  const maxDate = dates.at(-1)
  const startDate = requestedFilters.startDate || maxDate
  const endDate = requestedFilters.endDate || maxDate
  if (!parseDate(startDate) || !parseDate(endDate) || startDate > endDate) {
    throw createStatsError("DASHBOARD_STATS_INVALID_FILTER", "The query period is invalid.")
  }
  return {
    startDate,
    endDate,
    minDate,
    maxDate,
    defaultStartDate: maxDate,
    defaultEndDate: maxDate,
  }
}

function selectLatestFilePerDate(files, startDate, endDate) {
  const latestByDate = new Map()
  files.forEach((file) => {
    const date = file.dateTime.slice(0, 10)
    if (date < startDate || date > endDate) return
    const current = latestByDate.get(date)
    if (!current || current.dateTime < file.dateTime) latestByDate.set(date, file)
  })
  return Array.from(latestByDate.values()).sort((left, right) => left.dateTime.localeCompare(right.dateTime))
}

function selectPreviousFile(files, latestFile) {
  if (!latestFile) return null
  const previousDate = shiftDate(latestFile.dateTime.slice(0, 10), -1)
  const sameTime = latestFile.dateTime.slice(11)
  return files.find((file) => file.dateTime === `${previousDate} ${sameTime}`) ?? null
}

export async function getDashboardStatsSummary(
  requestedFilters = {},
  statsRoot = DASHBOARD_STATS_ROOT,
) {
  const files = await listStatsFiles(statsRoot)
  const dateRange = resolveDateRange(files, requestedFilters)
  const selectedFiles = selectLatestFilePerDate(files, dateRange.startDate, dateRange.endDate)
  const latestFile = selectedFiles.at(-1) ?? files.at(-1)
  const previousFile = selectPreviousFile(files, latestFile)
  const filesToRead = Array.from(new Map(
    [...selectedFiles, latestFile, previousFile]
      .filter(Boolean)
      .map((file) => [file.dateTime, file]),
  ).values())
  const rowsByDateTime = new Map(await Promise.all(filesToRead.map(async (file) => (
    [file.dateTime, await readStatsRows(file.filePath)]
  ))))
  const latestRows = rowsByDateTime.get(latestFile.dateTime) ?? []
  const datedRows = selectedFiles.map((file) => ({
    dateTime: file.dateTime,
    rows: rowsByDateTime.get(file.dateTime) ?? [],
  }))
  const previousRows = previousFile
    ? { dateTime: previousFile.dateTime, rows: rowsByDateTime.get(previousFile.dateTime) ?? [] }
    : null

  return {
    latestDate: latestFile.dateTime,
    metrics: buildDashboardStatsMetrics(latestRows),
    lineDashboard: buildStatsLineDashboard(datedRows, previousRows, {
      ...dateRange,
      lines: requestedFilters.lines ?? [],
    }),
  }
}

function parseRequestFilters(req, requestUrl) {
  const url = requestUrl ?? new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
  return {
    startDate: normalizeText(url.searchParams.get("startDate")),
    endDate: normalizeText(url.searchParams.get("endDate")),
    lines: url.searchParams.getAll("line").map(normalizeText).filter(Boolean),
  }
}

export async function handleDashboardStatsRequest(req, res, requestUrl) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      Allow: "GET, HEAD",
      "Content-Type": "application/json; charset=utf-8",
    })
    res.end(JSON.stringify({ ok: false, error: "Method not allowed" }))
    return
  }

  try {
    const payload = await getDashboardStatsSummary(parseRequestFilters(req, requestUrl))
    if (req.method === "HEAD") {
      res.writeHead(200, { "Cache-Control": "no-store" })
      res.end()
      return
    }
    sendJson(res, 200, { ok: true, ...payload })
  } catch (error) {
    const isNotFound = error.code === "DASHBOARD_STATS_NOT_FOUND"
    const isInvalidFilter = error.code === "DASHBOARD_STATS_INVALID_FILTER"
    const statusCode = isNotFound ? 404 : isInvalidFilter ? 400 : 500
    if (req.method === "HEAD") {
      res.writeHead(statusCode, { "Cache-Control": "no-store" })
      res.end()
      return
    }
    sendJson(res, statusCode, createSafeApiError({
      code: isNotFound
        ? error.code
        : isInvalidFilter ? error.code : "DASHBOARD_STATS_LOAD_FAILED",
      message: isNotFound
        ? "Unable to find the dashboard statistics file."
        : isInvalidFilter
          ? "The dashboard query filters are invalid."
          : "Unable to load the dashboard statistics file.",
      scope: "dashboard-stats",
    }))
  }
}
