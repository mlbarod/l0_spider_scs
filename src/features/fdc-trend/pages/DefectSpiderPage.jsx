import { useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, ArrowUp } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

import { fetchDefectFilters, fetchDefectFile } from "../api/defectSpiderApi"
import { fetchLineMapping } from "../api/mappingConfigApi"
import { isLineMappingQueryReady } from "../api/mappingContract.mjs"
import { DefectScatterChart } from "../components/DefectScatterChart"
import { defectChartTitle } from "../utils/defectScatter.mjs"
import { formatLineDisplayName } from "../utils/lineDisplay.mjs"

function DefectFilterRow({ title, options, selected, onSelect, placeholder }) {
  return (
    <div role="group" aria-label={title} className="flex items-start gap-4 py-2">
      <h2 className="w-24 shrink-0 pt-1.5 text-sm font-semibold">{title}</h2>
      <div className="flex min-w-0 flex-wrap gap-2">
        {options.length ? options.map(({ value, label }) => (
          <Button key={JSON.stringify(value)} type="button"
            variant={selected === value ? "default" : "outline"}
            className={`h-auto rounded-full px-[15px] text-xs leading-[18px] font-normal shadow-none transition-colors active:scale-95 ${selected === value
              ? "bg-[#0066cc] py-[7.5px] text-white hover:bg-[#0071e3]"
              : "border-[#0066cc] bg-white py-[6.5px] text-[#0066cc] hover:bg-[#f5f5f7] hover:text-[#0066cc]"}`}
            aria-pressed={selected === value} onClick={() => onSelect(value)}>
            {label}
          </Button>
        )) : <p className="py-1.5 text-sm text-muted-foreground">{placeholder}</p>}
      </div>
    </div>
  )
}

function DefectGroupCharts({ line, pathSdwt, prcGroup }) {
  const selection = { line, pathSdwt, prcGroup, mainSeq: null, metSeq: null }
  const filesQuery = useQuery({
    queryKey: ["defect-filters", line, pathSdwt, prcGroup, null, null],
    queryFn: ({ signal }) => fetchDefectFilters({ ...selection, signal }),
  })
  return (
    <section className="min-w-0 space-y-3" aria-label={`PRC Group ${prcGroup}`}>
      <h3 className="text-sm font-semibold">{prcGroup}</h3>
      {filesQuery.isError ? (
        <div className="flex items-center gap-3 text-sm text-destructive" role="alert">
          <p>{filesQuery.error.message}</p>
          <Button type="button" size="sm" variant="outline" disabled={filesQuery.isFetching} onClick={() => filesQuery.refetch()}>Retry</Button>
        </div>
      ) : filesQuery.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">선택 조건의 파일 목록을 확인 중입니다.</p>
      ) : filesQuery.data.files?.length ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-[640px] grid-cols-2 gap-4">
            {filesQuery.data.files.map((pair) => (
              <DefectChartTrellis key={JSON.stringify([pair.path, pair.main_seq, pair.met_seq])} pair={pair} selection={selection} />
            ))}
          </div>
        </div>
      ) : <p className="text-sm text-muted-foreground">선택 조건에 해당하는 파일이 없습니다.</p>}
    </section>
  )
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
          <header className="flex items-center justify-between gap-2 border-b bg-muted/35 px-4 py-3">
            <h3 className="min-w-0 break-all text-sm font-semibold">{defectChartTitle(eqp_ch, pair.main_seq, pair.met_seq)}</h3>
            <Badge variant="destructive">중심치 이상</Badge>
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
  const [selectedGroup, setSelectedGroup] = useState(null)
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
  const filtersQuery = useQuery({
    queryKey: ["defect-filters", activeLine, activeTeam],
    queryFn: ({ signal }) => fetchDefectFilters({ line: activeLine, pathSdwt: activeTeam, signal }),
    enabled: Boolean(activeLine && activeTeam),
  })
  const groups = filtersQuery.isSuccess ? filtersQuery.data.filters.prc_group ?? [] : []
  const activeGroup = groups.includes(selectedGroup) ? selectedGroup : null
  const visibleGroups = activeGroup === null ? groups : [activeGroup]

  return (
    <div ref={pageRef} className="relative flex h-full min-h-0 min-w-0 flex-col overflow-y-auto bg-muted/30">
      <header className="shrink-0 border-b bg-card px-6 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Defect SPIDER</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select Line Name, SDWT, and PRC Group to view charts for each main_seq and met_seq.
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
        <div className="divide-y px-6 py-2">
          <DefectFilterRow title="Line Name" options={lines.map((line) => ({ value: line, label: formatLineDisplayName(line) }))}
            selected={activeLine} placeholder={mappingQuery.isPending ? "Loading…" : "No lines are available."}
            onSelect={(line) => {
              setSelectedLine(line)
              setSelectedTeam("")
              setSelectedGroup(null)
            }} />
          <DefectFilterRow title="SDWT" options={teams} selected={activeTeam}
            placeholder={activeLine ? "No matching items." : "Select Line Name first"}
            onSelect={(team) => {
              setSelectedTeam(team)
              setSelectedGroup(null)
            }} />
          <DefectFilterRow title="PRC Group"
            options={groups.length ? [{ value: null, label: "ALL" }, ...groups.map((group) => ({ value: group, label: group }))] : []}
            selected={activeGroup} onSelect={setSelectedGroup}
            placeholder={!activeTeam ? "Select SDWT first" : filtersQuery.isError ? "PRC Group을 불러올 수 없습니다."
              : filtersQuery.isPending ? "Loading…" : "No matching items."} />
        </div>
        {filtersQuery.isError ? (
          <div className="flex items-center justify-between gap-3 border-t px-6 py-2 text-xs text-destructive" role="alert">
            <span>{filtersQuery.error.message}</span>
            <Button type="button" size="sm" variant="outline" disabled={filtersQuery.isFetching} onClick={() => filtersQuery.refetch()}>Retry</Button>
          </div>
        ) : null}
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
          {visibleGroups.length ? (
            <div className="space-y-6 p-4">
              {visibleGroups.map((prcGroup) => (
                <DefectGroupCharts key={JSON.stringify([activeLine, activeTeam, prcGroup])}
                  line={activeLine} pathSdwt={activeTeam} prcGroup={prcGroup} />
              ))}
            </div>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              {!activeTeam ? "Line Name과 SDWT를 선택하세요."
                : filtersQuery.isPending ? "PRC Group 목록을 확인 중입니다."
                : filtersQuery.isError ? "필터의 오류 안내를 확인하세요."
                : "선택 조건에 해당하는 PRC Group이 없습니다."}
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
