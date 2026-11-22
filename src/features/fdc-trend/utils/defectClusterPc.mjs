// 몰림PC 이상감지 화면의 필터와 wafer 묶음 계산(화면 상태와 분리해 test로 확인한다).
// 전라인 챔버별 이상감지와 같은 구성: Line Name, SDWT는 하나를 골라야 하고 PRC_Group은 ALL이 기본값이다.
export const FILTERS = [
  { key: "line", title: "Line Name" },
  { key: "sdwt", title: "SDWT" },
  { key: "prcGroup", title: "PRC_Group" },
]
export const EMPTY_FILTERS = { line: "", sdwt: "", prcGroup: "ALL" }
// 서버(server/defectClusterPc.mjs)의 NO_VALUE와 같은 값이다.
export const NO_VALUE = "(None)"
export const NO_EQPID = "(No EQPID)"

const sorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

// catalog row = [line, sdwt 값 목록, prcGroup 값 목록]. 각 필터의 선택지는 위쪽 필터 선택값으로 좁힌다.
export function clusterFilterOptions(rows, filters) {
  const options = {}
  let matched = rows
  FILTERS.forEach((filter, index) => {
    options[filter.key] = sorted(matched.flatMap((row) => row[index]))
    const value = filters[filter.key]
    if (value && value !== "ALL") matched = matched.filter((row) => [row[index]].flat().includes(value))
  })
  return options
}

// EQPID별로 묶고, 묶음과 그 안의 wafer를 이름 순으로 정렬한다.
export function groupByEqp(wafers) {
  const groups = new Map()
  for (const wafer of wafers) {
    const key = wafer.eqpid || NO_EQPID
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(wafer)
  }
  const compare = (a, b) => a.localeCompare(b, undefined, { numeric: true })
  return [...groups.entries()].sort(([a], [b]) => compare(a, b))
    .map(([key, list]) => [key, list.sort((a, b) => compare(a.lotWf, b.lotWf) || compare(a.metSeq, b.metSeq))])
}

// wafer map 화면: PRC_Group별로 묶고, 그 안을 EQP별, 다시 챔버(EQPID)별로 묶는다. 여러 값(["ETCH", "CVD"])인 wafer는
// "ETCH,CVD" 묶음 하나에 넣는다(같은 wafer를 두 번 그리지 않게). NO_VALUE 묶음은 맨 뒤에 둔다.
export const GRID_COLUMNS = 5

// eqpid "EQA01_1" = EQP "EQA01" + 챔버 "1"(화면 표시 "Chamber: 1"). 쉼표로 여러 값이면 EQP는 중복 없이 쉼표로 잇고,
// 챔버 이름은 EQP가 하나일 때만 "_" 뒤 값으로 줄인다(여러 EQP가 섞이면 eqpid 전체를 쓴다).
// "_"가 없는 eqpid는 챔버 값이 없으므로 "Chamber: "를 붙이지 않고 eqpid 그대로 쓴다.
export function splitEqpid(eqpid) {
  const parts = String(eqpid || "").split(",").map((value) => value.trim()).filter(Boolean)
  if (!parts.length) return { eqp: NO_EQPID, chamber: NO_EQPID }
  const eqps = [...new Set(parts.map((value) => value.split("_")[0]))]
  const chambers = parts.map((value) => (value.includes("_") ? value.slice(value.indexOf("_") + 1) : value))
  const label = parts.every((value) => value.includes("_")) ? `Chamber: ${chambers.join(",")}` : chambers.join(",")
  return { eqp: eqps.join(","), chamber: eqps.length === 1 ? label : parts.join(",") }
}

// EQP 묶음 = { eqp, span, count, chambers: [{ eqpid, chamber, span, wafers }] }
// 챔버 묶음은 wafer 수만큼, EQP 묶음은 챔버 칸 수 합만큼 칸을 차지한다(둘 다 최대 GRID_COLUMNS칸).
export function groupEqpChambers(wafers) {
  const eqps = new Map()
  for (const [eqpid, list] of groupByEqp(wafers)) {
    const { eqp, chamber } = splitEqpid(eqpid)
    if (!eqps.has(eqp)) eqps.set(eqp, [])
    eqps.get(eqp).push({ eqpid, chamber, span: eqpSpan(list.length), wafers: list })
  }
  const compare = (a, b) => a.localeCompare(b, undefined, { numeric: true })
  return [...eqps.entries()].sort(([a], [b]) => compare(a, b)).map(([eqp, chambers]) => ({
    eqp, chambers,
    span: eqpSpan(chambers.reduce((sum, item) => sum + item.span, 0)),
    count: chambers.reduce((sum, item) => sum + item.wafers.length, 0),
  }))
}

export function groupByPrcEqp(wafers) {
  const groups = new Map()
  for (const wafer of wafers) {
    const key = (wafer.prcGroup || []).join(",") || NO_VALUE
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(wafer)
  }
  const rank = (key) => (key === NO_VALUE ? 1 : 0)
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true }))
    .map(([key, list]) => [key, groupEqpChambers(list)])
}

// "7일내 이상건수" 정렬: PRC_Group·EQP로 묶지 않고 챔버(EQPID)를 과거 7일 이상건수가 많은 순(같으면 이름 순)으로 늘어놓는다.
// 화면이 EQP 묶음 구조를 그대로 쓰도록 챔버 하나를 EQP 묶음 하나로 감싼다. id는 같은 EQP의 챔버끼리 겹치지 않게 eqpid를 쓴다.
// history = { eqpid: 건수 }. 값이 없는 챔버는 0건으로 본다.
export function groupByHistory(wafers, history = {}) {
  const count = (eqpid) => (typeof history?.[eqpid] === "number" ? history[eqpid] : 0)
  return groupByEqp(wafers)
    .sort(([a], [b]) => count(b) - count(a) || a.localeCompare(b, undefined, { numeric: true }))
    .map(([eqpid, list]) => {
      const { eqp, chamber } = splitEqpid(eqpid)
      const span = eqpSpan(list.length)
      return { id: eqpid, eqp, span, count: list.length, chambers: [{ eqpid, chamber, span, wafers: list }] }
    })
}

// 묶음이 차지할 칸 수: 1 ~ GRID_COLUMNS칸.
export const eqpSpan = (count) => Math.max(1, Math.min(GRID_COLUMNS, count))

// 판정 피드백 상태를 wafer별로 기억하는 키(결과 시각 안에서 wafer 1매를 가리킨다).
export const waferKey = (wafer) => [wafer.line, wafer.device, wafer.mainSeq, wafer.metSeq, wafer.lotWf].join("|")

// 군집 1개 요약 글자: 창 반경, 창 안 defect 수, 비교 방식과 배수(예: "r 1.5mm · 5개 · 방향 3.5배").
export const CLUSTER_LABEL_TEXT = {
  ko: { count: (k) => `${k}개`, ring: "링", sector: "방향", other: "비교", ratio: (value) => `${value}배` },
  en: { count: (k) => `${k} pts`, ring: "ring", sector: "sector", other: "compare", ratio: (value) => `${value}x` },
  "zh-CN": { count: (k) => `${k}个`, ring: "环形", sector: "方向", other: "比较", ratio: (value) => `${value}倍` },
}

export function clusterLabel(cluster, language = "ko") {
  const t = CLUSTER_LABEL_TEXT[language] ?? CLUSTER_LABEL_TEXT.ko
  const zone = cluster.zone === "ring" ? t.ring : cluster.zone === "sector" ? t.sector : t.other
  return `r ${cluster.r}mm · ${t.count(cluster.k)} · ${zone} ${t.ratio(cluster.zoneRatio.toFixed(1))}`
}
