import { existsSync, statSync } from "node:fs"

import {
  asyncBufferFromFile,
  parquetMetadataAsync,
  parquetReadObjects,
  parquetSchema,
} from "hyparquet"
import { compressors } from "hyparquet-compressors"

import { SPIDER_DATA_PATH_TEMPLATES } from "../src/config/spiderDataPaths.mjs"
import { getLruEntry, setLruEntry } from "./boundedCache.mjs"

export const EQP_REFERENCE_COLUMNS = Object.freeze([
  "line_no",
  "fdc_model",
  "main",
  "disp_name",
  "sdwt_prod",
  "prc_group",
])

const EQP_REFERENCE_PATH = process.env.SCS_EQP_REFERENCE_PATH
  ?? SPIDER_DATA_PATH_TEMPLATES.eqpReference
const EQP_REFERENCE_CACHE_MAX_ENTRIES = 2
const eqpReferenceCache = new Map()

function normalizeText(value) {
  return value === null || value === undefined ? "" : String(value).trim()
}

export function resolveEqpReferenceProjection(schemaColumns) {
  const availableColumns = new Set(schemaColumns)
  if (!availableColumns.has("main") || !availableColumns.has("prc_group")) {
    throw new Error("The eqp reference data requires main and prc_group columns.")
  }
  return {
    joinColumn: "main",
    columns: EQP_REFERENCE_COLUMNS.filter((column) => availableColumns.has(column)),
  }
}

export async function readEqpReferenceRows(filePath = EQP_REFERENCE_PATH) {
  const fallbackPath = filePath.endsWith(".parque") ? `${filePath}t` : ""
  const resolvedFilePath = existsSync(filePath)
    ? filePath
    : fallbackPath && existsSync(fallbackPath)
    ? fallbackPath
    : filePath
  const fileStat = statSync(resolvedFilePath)
  const cached = getLruEntry(eqpReferenceCache, resolvedFilePath)
  if (cached?.mtimeMs === fileStat.mtimeMs && cached?.size === fileStat.size) {
    return {
      filePath: resolvedFilePath,
      rows: cached.rows,
      joinColumn: cached.joinColumn,
    }
  }

  const file = await asyncBufferFromFile(resolvedFilePath)
  const metadata = await parquetMetadataAsync(file)
  const schemaColumns = parquetSchema(metadata).children.map((column) => column.element.name)
  const projection = resolveEqpReferenceProjection(schemaColumns)
  const rows = (await parquetReadObjects({
    file,
    columns: projection.columns,
    compressors,
  })).map((row) => Object.fromEntries(projection.columns.map((column) => [
    column,
    normalizeText(row[column]),
  ])))
  setLruEntry(
    eqpReferenceCache,
    resolvedFilePath,
    {
      mtimeMs: fileStat.mtimeMs,
      size: fileStat.size,
      rows,
      joinColumn: projection.joinColumn,
    },
    EQP_REFERENCE_CACHE_MAX_ENTRIES,
  )
  return { filePath: resolvedFilePath, rows, joinColumn: projection.joinColumn }
}
