import { stat } from "node:fs/promises"
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects, parquetSchema } from "hyparquet"
import { compressors } from "hyparquet-compressors"

export const DEFECT_PM_HISTORY_PATH = "/appdata/abnormal_trend/pic/xian_change_point/pm_code_info.parquet"
export const DEFECT_MWO_HISTORY_PATH = "/appdata/abnormal_trend/pic/xian_change_point/mnu_code_info.parquet"
export const DEFECT_CHANGE_HISTORY_PATHS = Object.freeze([DEFECT_PM_HISTORY_PATH, DEFECT_MWO_HISTORY_PATH])
const PM_DROPPED_COLUMNS = new Set(["asset_cls"])
const caches = new Map()
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
  if (["asset", "inprg_dt", "work_type"].some((column) => !columns.includes(column))) {
    throw new Error("변경점 파일에 asset, inprg_dt, work_type 컬럼이 필요합니다.")
  }
  const byEquipment = new Map()
  for (const row of rows) {
    const eqpCh = String(row.asset ?? "").trim().replaceAll("-", "_")
    if (!eqpCh) continue
    const group = byEquipment.get(eqpCh) ?? []
    group.push({
      eqp_ch: eqpCh,
      timestamp: parseDefectPmTime(row.inprg_dt),
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

// PM rows (without asset_cls) followed by MWO rows; columns are the union in first-seen order.
export function mergeDefectChangeHistory(pm, mwo) {
  const pmColumns = pm.columns.filter((column) => !PM_DROPPED_COLUMNS.has(column))
  const columns = [...new Set([...pmColumns, ...mwo.columns])]
  const pmRows = pm.rows.map((row) => Object.fromEntries(Object.entries(row).filter(([column]) => !PM_DROPPED_COLUMNS.has(column))))
  return { columns, rows: [...pmRows, ...mwo.rows] }
}

async function readParquetTable(path) {
  // Invalidate each file's cache on size/mtime changes.
  const info = await stat(path)
  const cached = caches.get(path)
  if (cached?.mtimeMs === info.mtimeMs && cached?.size === info.size) return cached.table
  const file = await asyncBufferFromFile(path)
  const metadata = await parquetMetadataAsync(file)
  const columns = parquetSchema(metadata).children.map((column) => column.element.name)
  const rows = await parquetReadObjects({ file, compressors })
  const table = { columns, rows }
  caches.set(path, { mtimeMs: info.mtimeMs, size: info.size, table })
  return table
}

export async function readDefectPmHistory() {
  // Coalesce parallel chart loads into one read of the PM + MWO change history files.
  if (pending) return pending
  pending = (async () => {
    const [pm, mwo] = await Promise.all(DEFECT_CHANGE_HISTORY_PATHS.map(readParquetTable))
    const merged = mergeDefectChangeHistory(pm, mwo)
    return buildDefectPmHistory(merged.rows, merged.columns)
  })()
  try { return await pending } finally { pending = null }
}
