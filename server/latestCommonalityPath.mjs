import { readdir } from "node:fs/promises"
import { join, resolve } from "node:path"

import {
  SPIDER_DATA_PATH_NAMES,
  SPIDER_DATA_PATH_TEMPLATES,
} from "../src/config/spiderDataPaths.mjs"
import { createSafeApiError } from "./safeApiError.mjs"

export const commonalityRootPath = process.env.COMMONALITY_ROOT_PATH
  ?? SPIDER_DATA_PATH_TEMPLATES.commonalityRoot
export const commonalityPathTableRootPath = process.env.COMMONALITY_PATH_TABLE_ROOT
  ?? SPIDER_DATA_PATH_TEMPLATES.commonalityPathTableRoot
export const latestCommonalityPathName = SPIDER_DATA_PATH_NAMES.latestCommonality

const DATE_TIME_FILE_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

export function getCommonalityLatestDate(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("The similarity reference date is invalid.")
  }
  const pad = (value) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function isValidCommonalityPathTableName(fileName, systemDate) {
  const match = normalizeText(fileName).match(DATE_TIME_FILE_PATTERN)
  if (!match || !fileName.startsWith(`${systemDate} `)) return false
  const [, year, month, day, hour, minute, second] = match
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

function normalizeText(value) {
  return String(value ?? "").trim()
}

export async function getLatestCommonalityPath(
  rootPath = commonalityPathTableRootPath,
  now = new Date(),
) {
  const normalizedRootPath = resolve(rootPath)
  const systemDate = getCommonalityLatestDate(now)
  let entries
  try {
    entries = await readdir(normalizedRootPath, { withFileTypes: true })
  } catch {
    const error = new Error(
      `Unable to read the similarity path-table root: ${normalizedRootPath}`,
    )
    error.code = "COMMONALITY_PATH_TABLE_NOT_FOUND"
    throw error
  }
  const latestDateTime = entries
    .filter((entry) => entry.isFile() && isValidCommonalityPathTableName(entry.name, systemDate))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left))[0]
  if (!latestDateTime) {
    const error = new Error(
      `Unable to find the similarity path table for the access date: no YYYY-MM-DD hh:mm:ss file under ${normalizedRootPath} contains ${systemDate}.`,
    )
    error.code = "COMMONALITY_PATH_TABLE_NOT_FOUND"
    throw error
  }

  return {
    name: latestCommonalityPathName,
    path: join(normalizedRootPath, latestDateTime),
    date: systemDate,
  }
}

export async function handleLatestCommonalityPathRequest(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      Allow: "GET, HEAD",
      "Content-Type": "application/json; charset=utf-8",
    })
    res.end(JSON.stringify({ ok: false, error: "Method not allowed" }))
    return
  }

  try {
    const payload = await getLatestCommonalityPath()
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    })
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(payload))
  } catch (error) {
    const notFound = error.code === "COMMONALITY_PATH_TABLE_NOT_FOUND"
    const statusCode = notFound ? 404 : 500
    res.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    })
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(createSafeApiError({
      code: notFound
        ? "COMMONALITY_LATEST_DATE_NOT_FOUND"
        : "COMMONALITY_LATEST_PATH_LOAD_FAILED",
      message: notFound
        ? "No latest similarity date data is available."
        : "Unable to determine the latest similarity date path.",
      scope: "latest-commonality-path",
    })))
  }
}
