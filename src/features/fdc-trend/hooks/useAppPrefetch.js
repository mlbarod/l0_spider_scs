import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { fetchDefectFilters } from "../api/defectSpiderApi"
import { fetchHistoryPosts } from "../api/historyBoardApi"
import { fetchLineMapping } from "../api/mappingConfigApi"

// Pointer must rest on a card this long; quick pass-overs send no request.
const HOVER_INTENT_MS = 150
// Data fetched within this window is reused instead of requested again.
const PREFETCH_FRESH_MS = 60_000

// Only light entry data, with the same query keys the screens use, so the screen renders from cache.
const lineMapping = (client) => client.prefetchQuery({
  queryKey: ["l0-spider-line-mapping"], queryFn: fetchLineMapping, staleTime: PREFETCH_FRESH_MS,
})
const PREFETCHERS = {
  "/self-equipment": lineMapping,
  "/matching-anomaly": lineMapping,
  "/common-commonality-anomaly": lineMapping,
  "/registration": lineMapping,
  // Line mapping, then the PRC Group list for the screen's default selection
  // (first Line, its first SDWT, Management Step), with the screen's own query key.
  "/defect-spider": async (client) => {
    await lineMapping(client)
    const mapping = client.getQueryData(["l0-spider-line-mapping"])?.line_mapping
    if (!mapping || typeof mapping !== "object") return
    const line = Object.values(mapping)[0]
    const team = Object.entries(mapping).find(([, value]) => value === line)?.[0]
    if (!line || !team) return
    await client.prefetchQuery({
      queryKey: ["defect-filters", "", line, team],
      queryFn: ({ signal }) => fetchDefectFilters({ line, pathSdwt: team, step: "", signal }),
      staleTime: PREFETCH_FRESH_MS,
    })
  },
  "/history": (client) => {
    const filters = { page: 1, status: "", search: "", line: "", sdwt: "" }
    return client.prefetchQuery({
      queryKey: ["history-posts", filters],
      queryFn: ({ signal }) => fetchHistoryPosts({ ...filters, signal }),
      staleTime: PREFETCH_FRESH_MS,
    })
  },
}

export function useAppPrefetch(href) {
  const client = useQueryClient()
  const timer = useRef(null)
  const prefetch = PREFETCHERS[href]
  useEffect(() => () => clearTimeout(timer.current), [])
  if (!prefetch) return {}
  // prefetchQuery never throws; a failed prefetch just leaves the screen to load normally.
  const start = () => { clearTimeout(timer.current); void prefetch(client) }
  const cancel = () => clearTimeout(timer.current)
  return {
    onPointerEnter: (event) => {
      if (event.pointerType !== "mouse") return
      clearTimeout(timer.current)
      timer.current = setTimeout(start, HOVER_INTENT_MS)
    },
    onPointerLeave: cancel,
    onPointerDown: start,
    onFocus: start,
  }
}
