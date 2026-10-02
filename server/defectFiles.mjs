import { stat } from "node:fs/promises"
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects, parquetSchema } from "hyparquet"
import { compressors } from "hyparquet-compressors"
import { getLruEntry, setLruEntry } from "./boundedCache.mjs"

const cache = new Map()

export function buildDefectFilePairs(rows) {
  const contexts = new Map(rows.map((row) => {
    const context = { path: String(row.path ?? ""), main_seq: String(row.main_seq ?? "").trim(), met_seq: String(row.met_seq ?? "").trim() }
    return [JSON.stringify(context), context]
  }))
  return [...contexts.values()].map((context) => {
    const sourcePath = context.path
    const valid = sourcePath.startsWith("/") && !sourcePath.includes("\0")
      && !sourcePath.split("/").includes("..") && /\/fail_[^/]+\.parquet$/.test(sourcePath)
    return {
      ...context,
      fail_path: valid ? sourcePath : "",
      all_path: valid ? sourcePath.replace(/\/fail_([^/]+\.parquet)$/, "/all_$1") : "",
      error: valid ? "" : "path가 절대 경로의 fail_*.parquet 형식이 아닙니다.",
    }
  })
}

export function buildDefectScatterData(rows, columns) {
  const missing = ["tkout_time", "fab_value"].filter((column) => !columns.includes(column))
  if (missing.length) return { points: [], scatter_error: `Scatter 데이터에 ${missing.join(", ")} 컬럼이 필요합니다.`, invalid_point_count: rows.length }
  const points = []
  for (const row of rows) {
    const rawTime = row.tkout_time
    const timeText = typeof rawTime === "string" ? rawTime.trim().replace(" ", "T") : ""
    // 시간대 없는 데이터는 원문 시각을 유지하는 UTC 좌표로 표현한다.
    const timestamp = rawTime instanceof Date ? rawTime.getTime()
      : typeof rawTime === "number" ? rawTime
      : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(timeText)
        ? Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(timeText) ? timeText : `${timeText}Z`) : Number.NaN
    const value = typeof row.fab_value === "number" ? row.fab_value
      : typeof row.fab_value === "string" && row.fab_value.trim() ? Number(row.fab_value) : Number.NaN
    if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue
    const point = { tkout_time: timestamp, fab_value: value, eqp_ch: String(row.eqp_ch ?? "").trim() }
    // 색상과 NG 보호에 필요한 원본 메타데이터만 추가로 전달한다.
    for (const key of ["step_seq", "final_decision", "std_result", "anomaly_type", "lot_id", "wafer_id"]) {
      const metadata = row[key] ?? row[key.toUpperCase()] ?? (key === "lot_id" ? row.lot_wf : undefined)
      if (metadata != null) point[key] = String(metadata)
    }
    points.push(point)
  }
  return { points, invalid_point_count: rows.length - points.length }
}

export function buildDefectRawSummary(rows, columns, { trellis = false } = {}) {
  const summary = { row_count: rows.length, columns }
  if (!trellis) return summary
  if (!columns.includes("eqp_ch")) {
    return { ...summary, eqp_ch_groups: [], trellis_error: "이상감지 RAW데이터에 eqp_ch 컬럼이 없어 차트를 나눌 수 없습니다." }
  }
  const counts = new Map()
  let unassigned = 0
  for (const row of rows) {
    const eqpCh = String(row.eqp_ch ?? "").trim()
    if (!eqpCh) { unassigned += 1; continue }
    counts.set(eqpCh, (counts.get(eqpCh) ?? 0) + 1)
  }
  return {
    ...summary,
    eqp_ch_groups: [...counts].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([eqp_ch, row_count]) => ({ eqp_ch, row_count })),
    unassigned_row_count: unassigned,
  }
}

export async function readDefectFileSummary(filePath) {
  const info = await stat(filePath)
  const cached = getLruEntry(cache, filePath)
  if (cached?.mtimeMs === info.mtimeMs && cached?.size === info.size) return cached.summary
  const file = await asyncBufferFromFile(filePath)
  const metadata = await parquetMetadataAsync(file)
  // 실제 데이터까지 읽어 파일 손상·압축 해제 오류를 확인한다.
  const rows = await parquetReadObjects({ file, compressors })
  const summary = buildDefectRawSummary(rows,
    parquetSchema(metadata).children.map((column) => column.element.name),
    { trellis: /\/fail_[^/]+\.parquet$/.test(filePath) })
  Object.assign(summary, buildDefectScatterData(rows, summary.columns))
  setLruEntry(cache, filePath, { mtimeMs: info.mtimeMs, size: info.size, summary }, 32)
  return summary
}
