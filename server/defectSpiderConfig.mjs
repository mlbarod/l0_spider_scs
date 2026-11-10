import { readdir } from "node:fs/promises"

export const DEFECT_FAIL_LIST_ROOT = "/appdata/abnormal_trend/pic/defect/fail_list_all_scs"
export const DEFECT_DEPO_FAIL_LIST_ROOT = "/appdata/abnormal_trend/pic/defect/fail_list_all_depo_scs"

// step 값이 없거나 "depo"가 아니면 기존 관리스탭 목록을 사용한다.
export function getDefectFailListRoot(step) {
  return step === "depo" ? DEFECT_DEPO_FAIL_LIST_ROOT : DEFECT_FAIL_LIST_ROOT
}

export function resolveDefectFailListPath(entries, now = new Date(), root = DEFECT_FAIL_LIST_ROOT) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now)
  const datePart = (type) => parts.find((part) => part.type === type).value
  const today = `${datePart("year")}-${datePart("month")}-${datePart("day")}`
  const candidates = entries.flatMap((entry) => {
    if (!entry.isDirectory()) return []
    // Accept both "yyyy-mm-dd HH:mm" and "yyyy-mm-dd : HH:mm" folder names.
    const match = /^(\d{4}-\d{2}-\d{2})\s+(?::\s*)?([01]\d|2[0-3]):([0-5]\d)$/.exec(entry.name)
    return match?.[1] === today ? [{ name: entry.name, time: `${match[2]}:${match[3]}` }] : []
  }).sort((a, b) => b.time.localeCompare(a.time) || b.name.localeCompare(a.name))
  if (!candidates.length) {
    const error = new Error(`오늘(${today}, 한국시간)의 이상감지 목록 폴더가 없습니다.`)
    error.code = "DEFECT_LIST_UNAVAILABLE"
    throw error
  }
  return `${root}/${candidates[0].name}/fail_list.parquet`
}

export async function getDefectFailListPath(_line, { readDirectory = readdir, now = new Date(), step = "" } = {}) {
  const root = getDefectFailListRoot(step)
  const entries = await readDirectory(root, { withFileTypes: true })
  return resolveDefectFailListPath(entries, now, root)
}
