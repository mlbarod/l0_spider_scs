import { stat } from "node:fs/promises"
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects, parquetSchema } from "hyparquet"
import { compressors } from "hyparquet-compressors"

export const DEFECT_PM_HISTORY_PATH = "/appdata/abnormal_trend/pic/xian_change_point/pm_code_info.parquet"
let cache
let pending

export function parseDefectPmTime(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  let text = String(value ?? "").trim().replace(" ", "T")
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += "T00:00:00"
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return null
  // Match the scatter's UTC coordinates for timestamps without a time zone.
  const time = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`)
  return Number.isFinite(time) ? time : null
}

function rawValue(value) {
  if (value == null) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  if (typeof value === "bigint") return String(value)
  if (typeof value === "object") return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? String(item) : item)
  return value
}

export function buildDefectPmHistory(rows, columns) {
  if (["asset", "inprt_dt", "work_type"].some((column) => !columns.includes(column))) {
    throw new Error("변경점 파일에 asset, inprt_dt, work_type 컬럼이 필요합니다.")
  }
  const byEquipment = new Map()
  for (const row of rows) {
    const eqpCh = String(row.asset ?? "").trim().replaceAll("-", "_")
    if (!eqpCh) continue
    const group = byEquipment.get(eqpCh) ?? []
    group.push({
      eqp_ch: eqpCh,
      timestamp: parseDefectPmTime(row.inprt_dt),
      work_type: String(row.work_type ?? ""),
      raw: Object.fromEntries(columns.map((column) => [column, rawValue(row[column])])),
    })
    byEquipment.set(eqpCh, group)
  }
  return { columns, byEquipment }
}

export function selectDefectPmHistory(history, eqpChs) {
  return { columns: history.columns, rows: [...new Set(eqpChs)].flatMap((eqpCh) => history.byEquipment.get(eqpCh) ?? []) }
}

export async function readDefectPmHistory() {
  // Coalesce parallel chart loads; invalidate the single-file cache on size/mtime changes.
  if (pending) return pending
  pending = (async () => {
    const info = await stat(DEFECT_PM_HISTORY_PATH)
    if (cache?.mtimeMs === info.mtimeMs && cache?.size === info.size) return cache.history
    const file = await asyncBufferFromFile(DEFECT_PM_HISTORY_PATH)
    const metadata = await parquetMetadataAsync(file)
    const columns = parquetSchema(metadata).children.map((column) => column.element.name)
    const rows = await parquetReadObjects({ file, compressors })
    const history = buildDefectPmHistory(rows, columns)
    cache = { mtimeMs: info.mtimeMs, size: info.size, history }
    return history
  })()
  try { return await pending } finally { pending = null }
}
