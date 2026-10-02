import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, ArrowUp } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { fetchDefectFilters } from "../api/defectSpiderApi"
import { fetchLineMapping } from "../api/mappingConfigApi"
import { isLineMappingQueryReady } from "../api/mappingContract.mjs"
import { ResizableFilterArea } from "../components/ResizableFilterArea"
import { formatLineDisplayName } from "../utils/lineDisplay.mjs"
import { FilterCard, SelectRow } from "./FdcTrendPage"

const DEFECT_FILTERS = [
  { key: "prc_group", title: "PRC_Group" },
  { key: "main_seq", title: "main_seq" },
  { key: "met_seq", title: "met_seq" },
]

function DefectDataFilters({ line, pathSdwt, onLoadInfoChange }) {
  const [selected, setSelected] = useState({ prc_group: "", main_seq: "", met_seq: "" })
  const [queries, setQueries] = useState({ prc_group: "", main_seq: "", met_seq: "" })
  const filtersQuery = useQuery({
    queryKey: ["defect-filters", line, pathSdwt, selected.prc_group, selected.main_seq],
    queryFn: ({ signal }) => fetchDefectFilters({
      line, pathSdwt, prcGroup: selected.prc_group, mainSeq: selected.main_seq, signal,
    }),
    enabled: Boolean(line && pathSdwt),
  })
  const filters = filtersQuery.isSuccess ? filtersQuery.data.filters : {}
  const sourcePath = filtersQuery.isError
    ? filtersQuery.error.sourcePath ?? ""
    : filtersQuery.data?.source_path ?? ""
  useEffect(() => {
    onLoadInfoChange({ line, pathSdwt, sourcePath, status: filtersQuery.status })
  }, [line, pathSdwt, sourcePath, filtersQuery.status, onLoadInfoChange])

  return DEFECT_FILTERS.map(({ key, title }, index) => {
    const options = filters[key] ?? []
    const ready = Boolean(line && pathSdwt && (index === 0 || selected[DEFECT_FILTERS[index - 1].key]))
    const query = queries[key].trim().toLowerCase()
    return (
      <FilterCard
        key={key}
        title={title}
        badge={options.length || null}
        disabled={!ready || !options.length}
        placeholder={filtersQuery.isError && index === 0 ? (
          <div className="space-y-2 text-xs text-destructive" role="alert">
            <p>{filtersQuery.error.message}</p>
            <Button type="button" size="sm" variant="outline" disabled={filtersQuery.isFetching} onClick={() => filtersQuery.refetch()}>Retry</Button>
          </div>
        ) : !ready ? "이전 필터를 먼저 선택하세요." : filtersQuery.isPending ? "Loading…" : "No matching items."}
        isActive={options.includes(selected[key])}
        isLoading={ready && filtersQuery.isFetching}
        query={queries[key]}
        onQueryChange={(value) => setQueries((current) => ({ ...current, [key]: value }))}
      >
        {options.filter((value) => value.toLowerCase().includes(query)).map((value) => (
          <SelectRow
            key={value}
            label={value}
            selected={selected[key] === value}
            onClick={() => {
              const cleared = Object.fromEntries(DEFECT_FILTERS.slice(index + 1).map((filter) => [filter.key, ""]))
              setSelected((current) => ({ ...current, ...cleared, [key]: value }))
              setQueries((current) => ({ ...current, ...cleared }))
            }}
          />
        ))}
      </FilterCard>
    )
  })
}

function DefectChartPlaceholder({ similarity = false }) {
  return (
    <article className="grid min-h-[400px] min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border bg-card">
      <header className="border-b bg-muted/35 px-4 py-3">
        <h3 className="text-sm font-semibold">
          {similarity ? "Show 3-Day Similarity Chart" : "Scatter chart"}
        </h3>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {similarity ? "Last 72 hours" : "main_seq · met_seq"}
        </p>
      </header>
      <div className="flex min-h-72 items-center justify-center p-6">
        <div className="grid min-h-60 w-full place-items-center rounded-xl border border-dashed bg-muted/15 p-6 text-center text-sm text-muted-foreground">
          Defect data is not connected yet.
        </div>
      </div>
    </article>
  )
}

export function DefectSpiderPage() {
  const pageRef = useRef(null)
  const [selectedLine, setSelectedLine] = useState("")
  const [selectedTeam, setSelectedTeam] = useState("")
  const [loadInfo, setLoadInfo] = useState(null)
  const [queries, setQueries] = useState({ line: "", team: "" })
  const [grouped, setGrouped] = useState(true)
  const [showSimilarity, setShowSimilarity] = useState(true)
  const mappingQuery = useQuery({
    queryKey: ["l0-spider-line-mapping"],
    queryFn: fetchLineMapping,
  })
  const mappingReady = isLineMappingQueryReady(mappingQuery)
  const lineMapping = mappingReady ? mappingQuery.data.line_mapping : {}
  const sdwtMapping = mappingReady ? mappingQuery.data.sdwt_mapping : {}
  const lines = Array.from(new Set(Object.values(lineMapping)))
  const activeLine = lines.includes(selectedLine) ? selectedLine : (lines[0] ?? "")
  const teams = Object.entries(lineMapping)
    .filter(([, line]) => line === activeLine)
    .map(([value]) => ({ value, label: sdwtMapping[value] ?? value }))
  const activeTeam = teams.some(({ value }) => value === selectedTeam)
    ? selectedTeam
    : (teams[0]?.value ?? "")
  const filteredLines = lines.filter((line) => (
    formatLineDisplayName(line).toLowerCase().includes(queries.line.trim().toLowerCase())
  ))
  const filteredTeams = teams.filter(({ label }) => (
    label.toLowerCase().includes(queries.team.trim().toLowerCase())
  ))
  const currentLoadInfo = loadInfo?.line === activeLine && loadInfo?.pathSdwt === activeTeam
    ? loadInfo : null

  return (
    <div ref={pageRef} className="relative flex h-full min-h-0 min-w-0 flex-col overflow-y-auto bg-muted/30">
      <header className="shrink-0 border-b bg-card px-6 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Defect SPIDER</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select Line Name, SDWT, PRC_Group, main_seq, and met_seq to view Defect results.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              SPIDER Home
            </Link>
          </Button>
        </div>
      </header>

      <section className="shrink-0 border-b bg-card px-6 py-3">
        <button
          type="button"
          className="group inline-flex items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          role="switch"
          aria-label="Show 3-Day Similarity Chart"
          aria-checked={showSimilarity}
          onClick={() => setShowSimilarity((current) => !current)}
        >
          <span className={cn(
            "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200",
            showSimilarity ? "border-primary bg-primary" : "border-input bg-muted-foreground/35",
          )}>
            <span className={cn(
              "absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200",
              showSimilarity && "translate-x-5",
            )} />
          </span>
          <span>
            <span className="block text-sm font-medium text-foreground">Show 3-Day Similarity Chart</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              In grouped view, show the similarity chart to the right.
            </span>
          </span>
          <span className="sr-only">{showSimilarity ? "On" : "Off"}</span>
        </button>
      </section>

      <section className="shrink-0 border-b border-[#e0e0e0] bg-[#f5f5f7]">
        <ResizableFilterArea defaultHeight={332} minHeight={160} maxHeight={720}>
          <div className="h-full overflow-x-auto px-6 py-2">
            <div className="grid h-full min-w-[1080px] grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.45fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] gap-4">
              <FilterCard
                title="Line Name"
                badge={lines.length || null}
                disabled={!lines.length}
                placeholder={mappingQuery.isPending ? "Loading…" : "No lines are available."}
                isActive={Boolean(activeLine)}
                isLoading={mappingQuery.isFetching && !lines.length}
                query={queries.line}
                onQueryChange={(line) => setQueries((current) => ({ ...current, line }))}
              >
                {filteredLines.map((line) => (
                  <SelectRow
                    key={line}
                    label={formatLineDisplayName(line)}
                    selected={activeLine === line}
                    onClick={() => {
                      setSelectedLine(line)
                      setSelectedTeam("")
                      setQueries((current) => ({ ...current, team: "" }))
                    }}
                  />
                ))}
              </FilterCard>
              <FilterCard
                title="SDWT"
                badge={teams.length || null}
                disabled={!activeLine}
                placeholder={activeLine ? "No matching items." : "Select Line Name first"}
                isActive={Boolean(activeTeam)}
                query={queries.team}
                onQueryChange={(team) => setQueries((current) => ({ ...current, team }))}
              >
                {filteredTeams.map(({ value, label }) => (
                  <SelectRow
                    key={value}
                    label={label}
                    selected={activeTeam === value}
                    onClick={() => setSelectedTeam(value)}
                  />
                ))}
              </FilterCard>
              <DefectDataFilters key={JSON.stringify([activeLine, activeTeam])} line={activeLine} pathSdwt={activeTeam} onLoadInfoChange={setLoadInfo} />
            </div>
          </div>
        </ResizableFilterArea>
        <div className="border-t bg-card px-6 py-2 text-xs" aria-live="polite">
          <span className="font-medium">이상감지 리스트 로드 경로: </span>
          {currentLoadInfo?.sourcePath ? (
            <code className="select-text break-all">{currentLoadInfo.sourcePath}</code>
          ) : (
            <span className="text-muted-foreground">
              {!activeLine || !activeTeam ? "Line과 SDWT를 선택하세요."
                : currentLoadInfo?.status === "error" ? "파일 경로를 확인하지 못했습니다. 위 오류 안내를 확인하세요."
                : "서버에서 파일 경로를 확인 중입니다."}
            </span>
          )}
        </div>
        {mappingQuery.isError ? (
          <div className="flex items-center justify-between gap-3 border-t px-6 py-2 text-xs text-destructive" role="alert">
            <span>Reference mapping error: {mappingQuery.error.message}</span>
            <Button type="button" size="sm" variant="outline" disabled={mappingQuery.isFetching} onClick={() => mappingQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}
      </section>

      <main className="grid min-w-0 gap-4 p-4">
        <section className="min-w-0 overflow-hidden rounded-[18px] border bg-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">Scatter chart</h2>
              <p className="mt-1 text-xs text-muted-foreground">Defect data is not connected yet.</p>
            </div>
            <Badge variant="outline">Layout preview</Badge>
          </header>
          <div className="grid min-w-0 gap-4 p-4">
            <section className="min-w-0 overflow-hidden rounded-2xl border bg-background">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge>EQP</Badge>
                  <h3 className="text-sm font-semibold">Layout preview</h3>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 px-2.5 text-xs" aria-pressed={grouped} onClick={() => setGrouped((current) => !current)}>
                  {grouped ? "Show all charts" : "Group charts"}
                </Button>
              </header>
              <div className={cn("grid min-w-0 grid-cols-1 gap-4 p-4 lg:grid-cols-2", !grouped && "xl:grid-cols-3")}>
                <DefectChartPlaceholder />
                {grouped ? (
                  showSimilarity ? <DefectChartPlaceholder similarity /> : null
                ) : (
                  <>
                    <DefectChartPlaceholder />
                    <DefectChartPlaceholder />
                  </>
                )}
              </div>
            </section>
          </div>
        </section>
      </main>

      <Button type="button" size="icon" className="fixed bottom-6 right-6 z-40 rounded-full shadow-lg" aria-label="Back to top" onClick={() => pageRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>
        <ArrowUp className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}
