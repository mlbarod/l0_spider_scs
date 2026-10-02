import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, ArrowUp } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { fetchDefectFilters, fetchDefectFile } from "../api/defectSpiderApi"
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
    queryKey: ["defect-filters", line, pathSdwt, selected.prc_group, selected.main_seq, selected.met_seq],
    queryFn: ({ signal }) => fetchDefectFilters({
      line, pathSdwt, prcGroup: selected.prc_group, mainSeq: selected.main_seq, metSeq: selected.met_seq, signal,
    }),
    enabled: Boolean(line && pathSdwt),
  })
  const filters = filtersQuery.isSuccess ? filtersQuery.data.filters : {}
  const sourcePath = filtersQuery.isError
    ? filtersQuery.error.sourcePath ?? ""
    : filtersQuery.data?.source_path ?? ""
  useEffect(() => {
    onLoadInfoChange({ line, pathSdwt, sourcePath, status: filtersQuery.status, files: filtersQuery.isSuccess ? filtersQuery.data.files : [], selected })
  }, [line, pathSdwt, sourcePath, filtersQuery.status, filtersQuery.isSuccess, filtersQuery.data, selected, onLoadInfoChange])

  return DEFECT_FILTERS.map(({ key, title }, index) => {
    const values = filters[key] ?? []
    const options = values.map((value) => ({ value, label: value }))
    if (index > 0 && values.length) options.unshift({ value: null, label: "ALL" })
    const ready = Boolean(line && pathSdwt && (index === 0 || selected[DEFECT_FILTERS[index - 1].key] !== ""))
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
        isActive={options.some(({ value }) => value === selected[key])}
        isLoading={ready && filtersQuery.isFetching}
        query={queries[key]}
        onQueryChange={(value) => setQueries((current) => ({ ...current, [key]: value }))}
      >
        {options.filter(({ label }) => label.toLowerCase().includes(query)).map(({ value, label }) => (
          <SelectRow
            key={JSON.stringify(value)}
            label={label}
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

function DefectFileStatus({ kind, pair, selection }) {
  const filePath = kind === "FAIL" ? pair.fail_path : pair.all_path
  const fileQuery = useQuery({
    queryKey: ["defect-file", selection, filePath],
    queryFn: ({ signal }) => fetchDefectFile({ ...selection, filePath, signal }),
    enabled: Boolean(filePath),
    retry: false,
  })
  return (
    <section className="min-w-0 rounded-lg border bg-background">
      <header className="border-b px-4 py-3">
        <Badge variant="outline">{kind}</Badge>
        <p className="mt-2 text-xs text-muted-foreground">로드 경로</p>
        <code className="block select-text break-all text-xs">{filePath || "경로 변환 불가"}</code>
      </header>
      <div className="space-y-2 p-4 text-sm">
        {pair.error ? <p className="text-destructive" role="alert">{pair.error}</p>
          : fileQuery.isError ? (
            <div className="space-y-2" role="alert">
              <p className="text-destructive">{fileQuery.error.message}</p>
              <Button size="sm" variant="outline" disabled={fileQuery.isFetching} onClick={() => fileQuery.refetch()}>Retry</Button>
            </div>
          ) : fileQuery.isPending ? <p>파일 로드 중…</p> : (
            <>
              <p>로드 완료 · {fileQuery.data.row_count.toLocaleString()}행</p>
              <p className="break-all text-xs text-muted-foreground">컬럼: {fileQuery.data.columns.join(", ") || "없음"}</p>
            </>
          )}
      </div>
    </section>
  )
}

function DefectChartCard({ pair, selection, index }) {
  return (
    <article className="min-h-64 min-w-0 overflow-hidden rounded-xl border bg-card">
      <header className="border-b bg-muted/35 px-4 py-3">
        <h3 className="text-sm font-semibold">Chart {index + 1} · FAIL / ALL</h3>
        <p className="mt-2 text-xs text-muted-foreground">path 원문</p>
        <code className="block select-text break-all text-xs">{pair.path || "(빈 값)"}</code>
      </header>
      <div className="grid min-w-0 gap-3 p-4">
        <DefectFileStatus kind="FAIL" pair={pair} selection={selection} />
        <DefectFileStatus kind="ALL" pair={pair} selection={selection} />
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

      <main className="min-w-0 p-4">
        <section className="min-w-0 overflow-hidden rounded-[18px] border bg-card">
          <header className="border-b bg-muted/30 px-5 py-4">
            <h2 className="text-base font-semibold">Scatter chart</h2>
            <p className="mt-1 text-xs text-muted-foreground">차트 하나당 FAIL / ALL 파일 한 쌍의 로드 경로와 상태를 표시합니다.</p>
          </header>
          {currentLoadInfo?.status === "success" && currentLoadInfo.files?.length ? (
            <div className="overflow-x-auto p-4">
              <div className="grid min-w-[640px] grid-cols-2 gap-4">
                {currentLoadInfo.files.map((pair, index) => (
                  <DefectChartCard
                    key={JSON.stringify([activeLine, activeTeam, pair.path])}
                    index={index}
                    pair={pair}
                    selection={{ line: activeLine, pathSdwt: activeTeam,
                      prcGroup: currentLoadInfo.selected.prc_group,
                      mainSeq: currentLoadInfo.selected.main_seq,
                      metSeq: currentLoadInfo.selected.met_seq }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              {currentLoadInfo?.status === "pending" ? "선택 조건의 파일 목록을 확인 중입니다."
                : currentLoadInfo?.status === "error" ? "필터의 오류 안내를 확인하세요."
                : currentLoadInfo?.selected && Object.values(currentLoadInfo.selected).every((value) => value !== "")
                  ? "선택 조건에 해당하는 파일이 없습니다."
                  : "PRC_Group, main_seq, met_seq를 선택하세요. ALL을 선택하면 해당 단계의 전체 값을 조회합니다."}
            </p>
          )}
        </section>
      </main>

      <Button type="button" size="icon" className="fixed bottom-6 right-6 z-40 rounded-full shadow-lg" aria-label="Back to top" onClick={() => pageRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>
        <ArrowUp className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}
