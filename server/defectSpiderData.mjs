import { stat } from "node:fs/promises"
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects, parquetSchema } from "hyparquet"
import { compressors } from "hyparquet-compressors"

import { getDefectFailListPath } from "./defectSpiderConfig.mjs"
import { assertKnownMappingLineSdwt, requireLineMapping } from "./mappingConfig.mjs"

export const DEFECT_COLUMNS = ["sdwt", "prc_group", "main_seq", "met_seq", "eqpid", "path"]
const text = (value) => String(value ?? "").trim()
let cache

export async function readDefectFailList(filePath) {
  const info = await stat(filePath)
  if (cache?.filePath === filePath && cache.mtimeMs === info.mtimeMs && cache.size === info.size) {
    return cache.rows
  }
  const file = await asyncBufferFromFile(filePath)
  const metadata = await parquetMetadataAsync(file)
  const columns = new Set(parquetSchema(metadata).children.map((column) => column.element.name))
  if (DEFECT_COLUMNS.some((column) => !columns.has(column))) {
    const error = new Error("이상감지 리스트에 sdwt, prc_group, main_seq, met_seq, eqpid, path 컬럼이 필요합니다.")
    error.code = "DEFECT_SCHEMA_INVALID"
    throw error
  }
  const rows = (await parquetReadObjects({ file, columns: DEFECT_COLUMNS, compressors }))
    .map((row) => Object.fromEntries(DEFECT_COLUMNS.map((column) => [column, text(row[column])])))
  cache = { filePath, mtimeMs: info.mtimeMs, size: info.size, rows }
  return rows
}

export function buildDefectFilters(rows, { prcGroup = "", mainSeq = "" } = {}) {
  const unique = (items, column) => [...new Set(items.map((row) => text(row[column])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const groupRows = prcGroup ? rows.filter((row) => text(row.prc_group) === prcGroup) : []
  const mainRows = mainSeq ? groupRows.filter((row) => text(row.main_seq) === mainSeq) : []
  return {
    prc_group: unique(rows, "prc_group"),
    main_seq: unique(groupRows, "main_seq"),
    met_seq: unique(mainRows, "met_seq"),
  }
}

export function scopeDefectRows(rows, { sdwt, pathSdwt }) {
  return rows.filter((row) => text(row.sdwt) === sdwt || text(row.sdwt) === pathSdwt)
}

export async function handleDefectFiltersRequest(req, res, url, dependencies = {}) {
  const send = (status, payload) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
    res.end(JSON.stringify(payload))
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    send(405, { error: "Method not allowed" })
    return
  }
  let filePath = ""
  try {
    const mapping = await requireLineMapping(dependencies.readMapping)
    const line = text(url.searchParams.get("line"))
    const pathSdwt = text(url.searchParams.get("pathSdwt"))
    assertKnownMappingLineSdwt(mapping, { line, pathSdwt })
    filePath = (dependencies.resolvePath ?? getDefectFailListPath)(line)
    const rows = await (dependencies.readRows ?? readDefectFailList)(filePath)
    const scopedRows = scopeDefectRows(rows, {
      pathSdwt, sdwt: mapping.sdwt_mapping[pathSdwt] ?? pathSdwt,
    })
    send(200, { source_path: filePath, filters: buildDefectFilters(scopedRows, {
      prcGroup: text(url.searchParams.get("prcGroup")),
      mainSeq: text(url.searchParams.get("mainSeq")),
    }) })
  } catch (error) {
    const invalidScope = error.code === "MAPPING_SCOPE_MISMATCH"
    const configured = error.code === "DEFECT_CONFIG_INVALID"
    send(invalidScope ? 400 : 503, {
      source_path: filePath,
      error: invalidScope ? "Line Name과 SDWT 선택을 확인하세요."
        : configured || error.code === "DEFECT_SCHEMA_INVALID" ? error.message
        : "이상감지 리스트를 불러올 수 없습니다. 서버 설정과 파일을 확인하세요.",
    })
  }
}
