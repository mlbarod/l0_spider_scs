import { readdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

import {
  SPIDER_DATA_PATH_NAMES,
  SPIDER_DATA_PATH_TEMPLATES,
} from "../src/config/spiderDataPaths.mjs"

const DATE_DIRECTORY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function normalizeRootPath(value) {
  const normalized = String(value ?? "").trim()
  return normalized ? resolve(normalized) : ""
}

export function resolveCommonCommonalityRootPath({
  explicitRoot = process.env.COMMON_COMMONALITY_ROOT_PATH,
  commonalityRoot = process.env.COMMONALITY_ROOT_PATH,
  dashboardRoot = process.env.SPIDER_DASHBOARD_PATH_ROOT,
} = {}) {
  const normalizedExplicitRoot = normalizeRootPath(explicitRoot)
  if (normalizedExplicitRoot) return normalizedExplicitRoot

  const siblingSourceRoot = normalizeRootPath(commonalityRoot)
    || normalizeRootPath(dashboardRoot)
  if (siblingSourceRoot) {
    return join(dirname(siblingSourceRoot), "path_common_commonality")
  }

  return resolve(SPIDER_DATA_PATH_TEMPLATES.commonCommonalityRoot)
}

export const commonCommonalityRootPath = resolveCommonCommonalityRootPath()
export const latestCommonCommonalityPathName = SPIDER_DATA_PATH_NAMES.latestCommonCommonality

function isValidDateDirectoryName(name) {
  const match = String(name ?? "").match(DATE_DIRECTORY_PATTERN)
  if (!match) return false

  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day)
}

export async function getLatestCommonCommonalityPath(rootPath = commonCommonalityRootPath) {
  const normalizedRootPath = resolve(rootPath)
  const entries = await readdir(normalizedRootPath, { withFileTypes: true })
  const latestDate = entries
    .filter((entry) => entry.isDirectory() && isValidDateDirectoryName(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left))[0]

  if (!latestDate) {
    const error = new Error(
      `Unable to find the latest common-area similarity date: no YYYY-MM-DD directory exists directly under ${normalizedRootPath}.`,
    )
    error.code = "COMMONALITY_DATE_DIRECTORY_NOT_FOUND"
    throw error
  }

  return {
    name: latestCommonCommonalityPathName,
    path: join(normalizedRootPath, latestDate),
    date: latestDate,
  }
}
