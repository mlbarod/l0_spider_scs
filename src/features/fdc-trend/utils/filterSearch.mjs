// Empty strings remain valid queries so existing dependent-filter resets also reset the mode.
export function normalizeFilterSearch(query = "") {
  return typeof query === "string" ? { text: query, mode: "include" } : query
}

export function filterItems(items, query) {
  if (!normalizeFilterSearch(query).text.trim()) return items
  return items.filter((item) => matchesFilterSearch(item.label, query))
}

export function matchesFilterSearch(label, query) {
  const { text, mode } = normalizeFilterSearch(query)
  const normalizedText = text.trim().toLowerCase()
  if (!normalizedText) return true
  const includes = String(label ?? "").toLowerCase().includes(normalizedText)
  return mode === "exclude" ? !includes : includes
}

// ALL is an action over the matching candidates, not a searchable candidate itself.
export function filterItemsWithAll(items, query) {
  const all = items.find((item) => item.value === "ALL")
  const candidates = items.filter((item) => item.value !== "ALL")
  const visible = filterItems(candidates, query)
  if (!all || (candidates.length && !visible.length)) return visible
  const total = visible.every((item) => Number.isFinite(item.rowCount)) && visible.length
    ? { meta: `${visible.reduce((count, item) => count + item.rowCount, 0).toLocaleString()} rows` }
    : {}
  return [{ ...all, ...total }, ...visible]
}

const SEARCH_KEYS = ["prcGroup", "eqpCh", "stepSeq", "sensor", "chStep"]

export function getAllFilterSearch(filters, queries = {}) {
  return Object.fromEntries(SEARCH_KEYS.flatMap((key) => {
    const { text, mode } = normalizeFilterSearch(queries[key])
    return filters[key] === "ALL" && text.trim()
      ? [[key, { text: text.trim(), mode: mode === "exclude" ? "exclude" : "include" }]]
      : []
  }))
}

export function appendFilterSearchParams(params, filterSearch = {}) {
  for (const key of SEARCH_KEYS) {
    const { text, mode } = normalizeFilterSearch(filterSearch[key])
    if (!text.trim()) continue
    params.set(`${key}Search`, text.trim())
    params.set(`${key}SearchMode`, mode === "exclude" ? "exclude" : "include")
  }
}

export function readFilterSearchParams(params) {
  return Object.fromEntries(SEARCH_KEYS.flatMap((key) => {
    const text = params.get(`${key}Search`)?.trim()
    return text ? [[key, { text, mode: params.get(`${key}SearchMode`) === "exclude" ? "exclude" : "include" }]] : []
  }))
}
