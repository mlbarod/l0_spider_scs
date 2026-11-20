import { readdir, realpath, stat } from "node:fs/promises"
import { isAbsolute, join, relative, sep } from "node:path"
import { promisify } from "node:util"
import { gzip } from "node:zlib"
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet"
import { compressors } from "hyparquet-compressors"

import { getLruEntry, setLruEntry } from "./boundedCache.mjs"
import { getRemoteIp, resolveCurrentUser, sendCurrentUserError } from "./currentUser.mjs"
import { FEEDBACK_SAVE_ERROR, runClusterPcFeedback } from "./defectClusterPcFeedback.mjs"

// 몰림성 PC 이상감지: l0_spider의 일일 배치(scripts/defect_cluster_pc.py) 결과를 읽어 필터 목록과 wafer 좌표를 돌려준다.
// l0_spider의 /appdata/hadoop/code/eads 경로를 이 서비스에서는 /appdata/abnormal_trend/pic/defect로 쓴다.
export const DEFECT_CLUSTER_PC_ROOT = "/appdata/abnormal_trend/pic/defect"
export const DEFECT_CLUSTER_PC_CONFIG = Object.freeze({
  listRoot: `${DEFECT_CLUSTER_PC_ROOT}/fail_list_all_scs`,
  rawRoots: Object.freeze([DEFECT_CLUSTER_PC_ROOT]),
})
// 결과 파일의 path 컬럼에는 l0_spider 경로가 들어 있다. 앞부분만 이 서비스 경로로 바꿔 읽는다.
const L0_SPIDER_ROOT = "/appdata/hadoop/code/eads"
export function sourcePath(value) {
  const path = text(value)
  return path === L0_SPIDER_ROOT || path.startsWith(`${L0_SPIDER_ROOT}/`) ? `${DEFECT_CLUSTER_PC_ROOT}${path.slice(L0_SPIDER_ROOT.length)}` : path
}
const LIST_FILE = "fail_list_bias_pc.parquet"
const FILTER_KEYS = ["line", "sdwt", "prcGroup"]
export const NO_VALUE = "(None)"
export const MAX_WAFERS = 400
const READ_CONCURRENCY = 8
const requestError = (message, status = 400) => Object.assign(new Error(message), { status })
const text = (value) => String(value ?? "").trim()

// 파일 버전(mtime, size)이 같으면 다시 읽지 않는다.
function createParquetReader(read, maxEntries = 32) {
  const cache = new Map()
  return async (path) => {
    const info = await stat(path)
    const key = `${path}|${info.mtimeMs}|${info.size}`
    const cached = getLruEntry(cache, key)
    if (cached) return cached
    const rows = await read(path)
    return setLruEntry(cache, key, rows, maxEntries)
  }
}

const readList = createParquetReader(async (path) => parquetReadObjects({ file: await asyncBufferFromFile(path), compressors }), 4)
// 좌표 파일은 좌표 3개 컬럼과 카드 표시용 3개 컬럼만 읽는다(12개 컬럼 전체를 풀지 않아 빠르다). 없는 컬럼은 빈 값이 된다.
const readPoints = createParquetReader(async (path) => parquetReadObjects({ file: await asyncBufferFromFile(path), compressors, columns: ["lot_wf", "coorx", "coory", "tkout_time", "root_lot_id", "slot"] }))

// 실제 경로(symlink 해석 후)가 허용 폴더 안일 때만 그 경로를 돌려준다.
export async function confinedPath(path, roots) {
  const canonical = await realpath(path)
  for (const root of roots) {
    let base
    try { base = await realpath(root) }
    catch (error) { if (error.code === "ENOENT") continue; throw error }
    const rel = relative(base, canonical)
    if (rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`))) return canonical
  }
  throw Object.assign(new Error("DEFECT_PATH_DENIED"), { code: "DEFECT_PATH_DENIED" })
}

export const metSeqNumber = (value) => text(value).replace(/_RANDOM_PC$/i, "")

// 결과의 sdwt, prc_group은 "A,B"처럼 여러 값일 수 있다. 값 목록으로 나누고, 비었으면 NO_VALUE 하나로 둔다.
export const splitValues = (value) => {
  const values = [...new Set(text(value).split(",").map((item) => item.trim()).filter(Boolean))]
  return values.length ? values : [NO_VALUE]
}

// 배치 결과 폴더는 "{YYYY-MM-DD HH:MM}" 이름이다. 결과 파일이 있는 가장 최근 폴더를 쓴다.
export async function latestClusterSnapshot(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const names = entries.filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}/.test(entry.name)).map((entry) => entry.name).sort().reverse()
  for (const name of names) {
    const candidate = join(root, name, LIST_FILE)
    try {
      if ((await stat(candidate)).isFile()) return { snapshot: name, listPath: await confinedPath(candidate, [root]) }
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
  }
  return null
}

// 배치 결과의 clusters 컬럼(JSON 문자열)을 화면 표시용으로 검증한다. 컬럼이 없거나(이전 결과) 깨졌으면 빈 배열.
// 단위: mm, 각도 °. zone = "sector"(방향 비교: deg, width) | "ring"(링 비교: zoneR)
export function parseClusters(value) {
  let list
  try { list = JSON.parse(text(value) || "[]") } catch { return [] }
  if (!Array.isArray(list)) return []
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null)
  return list.slice(0, 20).flatMap((item) => {
    const r = num(item?.r), x = num(item?.x), y = num(item?.y)
    if (r == null || x == null || y == null || r <= 0) return []
    const base = { r, x, y, k: num(item.k) ?? 0, zoneRatio: num(item.zone_ratio) ?? 0, hit: item.hit === true }
    if (item.zone === "ring" && num(item.zone_r) > 0) return [{ ...base, zone: "ring", zoneR: item.zone_r }]
    if (item.zone === "sector" && num(item.deg) != null && num(item.width) > 0) return [{ ...base, zone: "sector", deg: item.deg, width: item.width }]
    return [{ ...base, zone: "" }]
  })
}

export function clusterRows(rows) {
  return rows.map((row) => ({
    line: text(row.line), device: text(row.device), mainSeq: text(row.main_seq), metSeq: metSeqNumber(row.met_seq),
    eqpid: text(row.eqpid), sdwt: splitValues(row.sdwt), prcGroup: splitValues(row.prc_group),
    lotWf: text(row.lot_wf), path: sourcePath(row.path), clusters: parseClusters(row.clusters), clustersRaw: text(row.clusters),
  })).filter((row) => row.line && row.lotWf && row.path)
}

// sdwt, prcGroup은 값 목록 중 하나가 선택값과 같으면 포함한다.
export function selectRows(rows, filters) {
  return rows.filter((row) => FILTER_KEYS.every((key) => {
    const value = filters[key]
    if (!value || value === "ALL") return true
    return Array.isArray(row[key]) ? row[key].includes(value) : row[key] === value
  }))
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index])
    }
  }))
  return results
}

// 좌표는 0.1mm 정수로 줄여 [x0, y0, x1, y1, ...] 배열로 보낸다(응답 크기와 화면 그리기 시간을 줄인다).
export function packPoints(rows, lotWf) {
  const xy = []
  for (const row of rows) {
    if (text(row.lot_wf) !== lotWf) continue
    const x = Number(row.coorx), y = Number(row.coory)
    if (row.coorx == null || row.coory == null || !Number.isFinite(x) || !Number.isFinite(y)) continue
    xy.push(Math.round(x / 100), Math.round(y / 100))
  }
  return xy
}

// tkout_time -> "YYYY-MM-DD HH:MM:SS". 시간대 없는 시각은 원문 시각 그대로 쓴다(Date는 UTC 기준으로 읽는다).
export function formatTkout(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 19).replace("T", " ") : ""
  if (typeof value === "number" || typeof value === "bigint") return formatTkout(new Date(Number(value)))
  const match = text(value).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?/)
  return match ? `${match[1]} ${match[2]}${match[3] || ":00"}` : ""
}

// 카드 상단 정보: wafer 행 중 가장 늦은 tkout_time, 처음 나온 root_lot_id·slot 값.
export function waferInfo(rows, lotWf) {
  const info = { tkoutTime: "", rootLotId: "", slot: "" }
  for (const row of rows) {
    if (text(row.lot_wf) !== lotWf) continue
    const time = formatTkout(row.tkout_time)
    if (time > info.tkoutTime) info.tkoutTime = time
    info.rootLotId ||= text(row.root_lot_id)
    info.slot ||= text(row.slot)
  }
  return info
}

// 판정 피드백: 화면은 wafer 식별값과 판정만 보낸다. clusters는 서버가 최신 결과 파일에서 꺼낸다.
// 값 길이 상한은 DB 컬럼 길이와 같다(scripts/defect_cluster_pc_feedback.sql).
export const FEEDBACK_VERDICTS = { correct: "Y", wrong: "N" }
const FEEDBACK_FIELDS = { snapshot: 16, line: 32, device: 64, mainSeq: 64, metSeq: 64, lotWf: 64 }
const INVALID_FEEDBACK = "Check the verdict request values."
const FEEDBACK_DELETE_ERROR = "Unable to cancel the clustered PC verdict."
const RESULT_CHANGED = "Clustered PC results were updated. Refresh the list."
const RESULT_NOT_FOUND = "Clustered PC result folder was not found."

async function readJsonBody(req, limit = 4096) {
  if (String(req.headers?.["content-type"] || "").split(";")[0].trim() !== "application/json") throw requestError(INVALID_FEEDBACK)
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk)
    if (size > limit) throw requestError(INVALID_FEEDBACK)
    chunks.push(Buffer.from(chunk))
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { throw requestError(INVALID_FEEDBACK) }
}

export function feedbackKey(body) {
  if (!body || typeof body !== "object" || !Object.hasOwn(FEEDBACK_VERDICTS, body.verdict)) throw requestError(INVALID_FEEDBACK)
  const key = {}
  for (const [field, max] of Object.entries(FEEDBACK_FIELDS)) {
    const value = body[field]
    if (typeof value !== "string" || !value.trim() || value.length > max) throw requestError(INVALID_FEEDBACK)
    key[field] = value.trim()
  }
  return { ...key, verdict: FEEDBACK_VERDICTS[body.verdict] }
}

async function requestCurrentUser(req) {
  return resolveCurrentUser(getRemoteIp(req))
}

export function createClusterPcService({ readList: readListFile = readList, readSource = readPoints, saveFeedback = runClusterPcFeedback, currentUser = requestCurrentUser } = {}) {
  async function load(config) {
    const root = config.listRoot
    let latest
    try { latest = await latestClusterSnapshot(root) }
    catch (error) { if (error.code === "ENOENT") return { configured: false }; throw error }
    if (!latest) return { configured: true, snapshot: "", rows: [] }
    return { configured: true, snapshot: latest.snapshot, rows: clusterRows(await readListFile(latest.listPath)) }
  }

  // POST = 판정 저장(덮어쓰기), DELETE = 같은 판정을 다시 눌러 취소(그 판정 행만 지운다).
  async function feedback(req, config) {
    const remove = req.method === "DELETE"
    const user = await currentUser(req)
    const key = feedbackKey(await readJsonBody(req))
    const data = await load(config)
    if (!data.configured) throw requestError(RESULT_NOT_FOUND, 404)
    if (key.snapshot !== data.snapshot) throw requestError(RESULT_CHANGED, 410)
    const row = data.rows.find((item) => ["line", "device", "mainSeq", "metSeq", "lotWf"].every((field) => item[field] === key[field]))
    if (!row) throw requestError("This wafer is not in the results.", 404)
    let result
    try {
      result = await saveFeedback(remove ? { ...key, action: "delete", knoxId: user.knoxId } : { ...key, clusters: row.clustersRaw, knoxId: user.knoxId })
    } catch { result = null }
    if (result?.ok !== true) throw requestError(remove ? FEEDBACK_DELETE_ERROR : FEEDBACK_SAVE_ERROR, 500)
    return remove ? { ok: true, verdict: "" } : { ok: true, verdict: key.verdict }
  }

  return async function handleClusterPc(req, url, config = DEFECT_CLUSTER_PC_CONFIG) {
    const command = url.pathname.slice("/api/defect-spider/cluster-pc/".length)
    if (command === "feedback") {
      if (req.method !== "POST" && req.method !== "DELETE") throw requestError("Method not allowed", 405)
      return feedback(req, config)
    }
    if (req.method !== "GET") throw requestError("Method not allowed", 405)
    if (command === "catalog") {
      const data = await load(config)
      // 필터 구성용 값만 보낸다. 파일 경로는 화면에 노출하지 않는다.
      return { ok: true, configured: data.configured, snapshot: data.snapshot || "",
        rows: (data.rows || []).map((row) => [row.line, row.sdwt, row.prcGroup]) }
    }
    if (command !== "maps") throw requestError("Unsupported clustered PC request.", 404)
    const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, text(url.searchParams.get(key))]))
    if (!filters.line) throw requestError("Select a Line.")
    if (!filters.sdwt) throw requestError("Select an SDWT.")
    const data = await load(config)
    if (!data.configured) throw requestError(RESULT_NOT_FOUND, 404)
    // 화면이 본 결과와 다른 시각의 결과를 섞어 그리지 않는다.
    if (text(url.searchParams.get("snapshot")) !== data.snapshot) throw requestError(RESULT_CHANGED, 410)
    const selected = selectRows(data.rows, filters)
    const rows = selected.slice(0, MAX_WAFERS)
    const roots = config.rawRoots
    const wafers = await mapLimit(rows, READ_CONCURRENCY, async (row) => {
      const base = { line: row.line, device: row.device, mainSeq: row.mainSeq, metSeq: row.metSeq, eqpid: row.eqpid, prcGroup: row.prcGroup, lotWf: row.lotWf, clusters: row.clusters }
      try {
        if (!row.path.endsWith(".parquet")) throw requestError("Not a parquet file.")
        const source = await readSource(await confinedPath(row.path, roots))
        return { ...base, ...waferInfo(source, row.lotWf), xy: packPoints(source, row.lotWf) }
      } catch (error) {
        return { ...base, xy: [], error: error.code === "ENOENT" ? "Source file not found." : error.code === "DEFECT_PATH_DENIED" ? "Path is not allowed." : "Unable to read the source file." }
      }
    })
    return { ok: true, snapshot: data.snapshot, total: selected.length, limit: MAX_WAFERS, wafers }
  }
}

const compress = promisify(gzip)
async function send(req, res, status, body) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Accept-Encoding" }
  let payload = JSON.stringify(body)
  const acceptsGzip = String(req.headers?.["accept-encoding"] || "").split(",").some((entry) => {
    const [encoding, ...parameters] = entry.trim().toLowerCase().split(";")
    const quality = parameters.map((value) => value.trim()).find((value) => value.startsWith("q="))
    return encoding === "gzip" && (quality == null || Number(quality.slice(2)) > 0)
  })
  if (acceptsGzip && payload.length >= 32 * 1024) {
    // 큰 응답(wafer 좌표)만 압축한다.
    payload = await compress(payload, { level: 1 })
    headers["Content-Encoding"] = "gzip"
  }
  res.writeHead(status, headers)
  res.end(payload)
}

function dataErrorMessage(error) {
  if (error.code === "ENOENT") return "File or folder not found. Check the data generation status."
  if (["EACCES", "EPERM"].includes(error.code)) return "No permission to read the file. Check the server read permissions."
  if (error.code === "DEFECT_PATH_DENIED") return "Files outside the allowed data folder cannot be read."
  return "Unable to read the data. Check the parquet file format and settings, then try again."
}

export function createDefectClusterPcHandler({ service = createClusterPcService(), config = DEFECT_CLUSTER_PC_CONFIG } = {}) {
  return async function handleDefectClusterPcRequest(req, res, url) {
    try {
      await send(req, res, 200, await service(req, url, config))
    } catch (error) {
      if (sendCurrentUserError(res, error)) return
      await send(req, res, error.status || 500, { ok: false, error: error.status ? error.message : dataErrorMessage(error) })
    }
  }
}

export const handleDefectClusterPcRequest = createDefectClusterPcHandler()
