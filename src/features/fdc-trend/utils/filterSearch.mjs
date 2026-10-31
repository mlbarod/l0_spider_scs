// Empty strings remain valid queries so existing dependent-filter resets also reset the mode.
export function normalizeFilterSearch(query) {
  return typeof query === "string" ? { text: query, mode: "include" } : query
}

export function filterItems(items, query) {
  const { text, mode } = normalizeFilterSearch(query)
  const normalizedText = text.trim().toLowerCase()
  if (!normalizedText) return items

  return items.filter((item) => {
    const includes = item.label.toLowerCase().includes(normalizedText)
    return mode === "exclude" ? !includes : includes
  })
}
