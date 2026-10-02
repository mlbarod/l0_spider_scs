import { stat } from "node:fs/promises"
import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects, parquetSchema } from "hyparquet"
import { compressors } from "hyparquet-compressors"
import { getLruEntry, setLruEntry } from "./boundedCache.mjs"

const cache = new Map()

export function buildDefectFilePairs(rows) {
  return [...new Set(rows.map((row) => String(row.path ?? "")))].map((sourcePath) => {
    const valid = sourcePath.startsWith("/") && !sourcePath.includes("\0")
      && !sourcePath.split("/").includes("..") && /\/fail_[^/]+\.parquet$/.test(sourcePath)
    return {
      path: sourcePath,
      fail_path: valid ? sourcePath : "",
      all_path: valid ? sourcePath.replace(/\/fail_([^/]+\.parquet)$/, "/all_$1") : "",
      error: valid ? "" : "path가 절대 경로의 fail_*.parquet 형식이 아닙니다.",
    }
  })
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
  setLruEntry(cache, filePath, { mtimeMs: info.mtimeMs, size: info.size, summary }, 32)
  return summary
}
