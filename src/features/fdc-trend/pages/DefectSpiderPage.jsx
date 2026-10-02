import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, ArrowUp } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"

import { fetchDefectFilters, fetchDefectFile } from "../api/defectSpiderApi"
import { fetchLineMapping } from "../api/mappingConfigApi"
import { isLineMappingQueryReady } from "../api/mappingContract.mjs"
import { DefectScatterChart } from "../components/DefectScatterChart"
import { defectChartTitle } from "../utils/defectScatter.mjs"
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
  useEffect(() => {
    onLoadInfoChange({ line, pathSdwt, status: filtersQuery.status, files: filtersQuery.isSuccess ? filtersQuery.data.files : [], selected })
  }, [line, pathSdwt, filtersQuery.status, filtersQuery.isSuccess, filtersQuery.data, selected, onLoadInfoChange])

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

function DefectChartTrellis({ pair, selection }) {
  const failQuery = useQuery({
    queryKey: ["defect-file", selection, pair.fail_path],
    queryFn: ({ signal }) => fetchDefectFile({ ...selection, filePath: pair.fail_path, signal }),
    enabled: Boolean(pair.fail_path),
    retry: false,
  })
  // ALL 데이터는 eqp_ch 조건을 보내지 않고 파일 쌍마다 한 번 조회해 공유한다.
  const allQuery = useQuery({
    queryKey: ["defect-file", selection, pair.all_path],
    queryFn: ({ signal }) => fetchDefectFile({ ...selection, filePath: pair.all_path, signal }),
    enabled: Boolean(pair.all_path),
    retry: false,
  })
  const groups = failQuery.isSuccess ? failQuery.data.eqp_ch_groups ?? [] : []
  if (!groups.length) {
    return (
      <section className="col-span-2 min-w-0 space-y-3 rounded-xl border bg-card p-4">
        <p className="text-sm" role={failQuery.data?.trellis_error ? "alert" : "status"}>
          {pair.error || (failQuery.isError ? "이상감지 RAW데이터를 읽지 못해 eqp_ch별 차트를 구성할 수 없습니다."
            : failQuery.isPending ? "이상감지 RAW데이터의 eqp_ch를 확인 중입니다."
            : failQuery.data.trellis_error || "차트로 표시할 eqp_ch 값이 없습니다.")}
        </p>
        {failQuery.isError ? <Button size="sm" variant="outline" disabled={failQuery.isFetching} onClick={() => failQuery.refetch()}>Retry</Button> : null}
      </section>
    )
  }
  return (
    <>
      {failQuery.data.unassigned_row_count > 0 ? (
        <p className="col-span-2 text-xs text-muted-foreground">eqp_ch가 비어 있는 {failQuery.data.unassigned_row_count}행은 차트 구분에서 제외했습니다.</p>
      ) : null}
      {groups.map(({ eqp_ch }) => (
        <article key={eqp_ch} className="min-h-64 min-w-0 overflow-hidden rounded-xl border bg-card">
          <header className="border-b bg-muted/35 px-4 py-3">
            <h3 className="break-all text-sm font-semibold">{defectChartTitle(eqp_ch, pair.main_seq, pair.met_seq)}</h3>
          </header>
          {allQuery.isSuccess ? (
            <DefectScatterChart failData={failQuery.data} allData={allQuery.data} eqpCh={eqp_ch} />
          ) : (
            <div className="grid h-[340px] place-items-center p-4 text-sm text-muted-foreground">
              {allQuery.isError ? "이상감지 스탭 ALL RAW데이터를 읽지 못했습니다. 재시도해 주세요." : "차트 데이터를 불러오는 중입니다."}
              {allQuery.isError ? <Button size="sm" variant="outline" disabled={allQuery.isFetching} onClick={() => allQuery.refetch()}>Retry</Button> : null}
            </div>
          )}
        </article>
      ))}
    </>
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
            <p className="mt-1 text-xs text-muted-foreground">eqp_ch별 이상감지 RAW데이터와 이상감지 스탭 ALL RAW데이터를 겹쳐 표시합니다.</p>
          </header>
          {currentLoadInfo?.status === "success" && currentLoadInfo.files?.length ? (
            <div className="overflow-x-auto p-4">
              <div className="grid min-w-[640px] grid-cols-2 gap-4">
                {currentLoadInfo.files.map((pair) => (
                  <DefectChartTrellis
                    key={JSON.stringify([activeLine, activeTeam, pair.path, pair.main_seq, pair.met_seq])}
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
