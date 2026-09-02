export function getLruEntry(cache, key) {
  if (!cache.has(key)) return undefined
  const value = cache.get(key)
  cache.delete(key)
  cache.set(key, value)
  return value
}

export function setLruEntry(cache, key, value, maxEntries) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error("maxEntries must be an integer greater than or equal to 1.")
  }

  cache.delete(key)
  cache.set(key, value)
  while (cache.size > maxEntries) {
    cache.delete(cache.keys().next().value)
  }
  return value
}
