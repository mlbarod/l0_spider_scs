import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Check, ChevronRight, FileWarning, Loader2 } from "lucide-react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { createClickedCategoryHistory } from "../api/clickedCategoryHistoryApi"
import { createHitHistory } from "../api/hitHistoryApi"
import { ResizableFilterArea } from "../components/ResizableFilterArea"
import {
  buildCommonalityImageUrl,
  fetchCommonalityData,
} from "../api/commonalityApi"
import {
  buildCommonCommonalityImageUrl,
  fetchCommonCommonalityData,
} from "../api/commonCommonalityApi"
import { fetchLineMapping } from "../api/mappingConfigApi"
import { isLineMappingQueryReady } from "../api/mappingContract.mjs"
import { formatLineDisplayName } from "../utils/lineDisplay.mjs"

const EMPTY_MAPPING = Object.freeze({})
const EMPTY_LIST = Object.freeze([])
const ALL_SENSORS = "ALL"
const ALL_CH_STEPS = "ALL"
const IMAGES_PER_PAGE = 18

const PAGE_VARIANTS = Object.freeze({
  matching: Object.freeze({
    queryKey: "commonality-data",
    title: "Similarity Anomaly Detection",
    badge: "Matching",
    description: "View the latest similarity graphs by Line, SDWT, STEP, Sensor, and ch_step.",
    categoryLabel: "STEP",
    categoryOptionKey: "stepSeqs",
    categoryFilterKey: "stepSeq",
    categoryRowKey: "stepSeq",
    categoryQueryKey: "stepSeq",
    latestLoadingText: "Searching similarity paths.",
    resultTitle: "Similarity-Based Anomaly Graphs",
    resultDescription: "Group the final filtered results by step_seq.",
    resultCategoryName: "STEP categories",
    emptySelectionText: "Select Line Name, SDWT, STEP, Sensor, and ch_step to display similarity graphs.",
    fetchData: fetchCommonalityData,
    buildImageUrl: buildCommonalityImageUrl,
  }),
  commonCommonality: Object.freeze({
    queryKey: "common-commonality-data",
    title: "Common Area Similarity Detection",
    badge: "Common Matching",
    description: "View the latest common-area similarity graphs by Line, SDWT, EQP_MODEL, Sensor, and ch_step.",
    categoryLabel: "EQP_MODEL",
    categoryOptionKey: "eqpModels",
    categoryFilterKey: "eqpModel",
    categoryRowKey: "eqpModel",
    categoryQueryKey: "eqpModel",
    latestLoadingText: "Searching common-area similarity paths.",
    resultTitle: "Common Area Similarity Anomaly Graphs",
    resultDescription: "Group the final filtered results by EQP_MODEL.",
    resultCategoryName: "EQP_MODEL categories",
    emptySelectionText: "Select Line Name, SDWT, EQP_MODEL, Sensor, and ch_step to display common-area similarity graphs.",
    fetchData: fetchCommonCommonalityData,
    buildImageUrl: buildCommonCommonalityImageUrl,
  }),
})

function SelectRow({ label, meta, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 w-full min-w-0 items-center gap-3 rounded-md border border-transparent px-3 text-left transition",
        "hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary/30 bg-primary/10 text-primary shadow-sm",
      )}
    >
      <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", selected && "text-primary")} title={label}>
        {label}
      </span>
      {meta ? <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{meta}</span> : null}
      {selected
        ? <Check className="size-3 shrink-0 text-primary" aria-hidden="true" />
        : <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </button>
  )
}

function FilterCard({
  title,
  badge,
  disabled = false,
  placeholder,
  isActive = false,
  isLoading = false,
  query,
  onQueryChange,
  children,
}) {
  const contentRef = useRef(null)
  const scrollPositionRef = useRef(0)
  const isRestoringScrollRef = useRef(false)

  useLayoutEffect(() => {
    if (!contentRef.current) return undefined

    const content = contentRef.current
    const savedScrollTop = scrollPositionRef.current
    isRestoringScrollRef.current = true
    content.scrollTop = savedScrollTop
    const animationFrame = requestAnimationFrame(() => {
      content.scrollTop = savedScrollTop
      isRestoringScrollRef.current = false
    })

    return () => cancelAnimationFrame(animationFrame)
  })

  return (
    <Card className={cn(
      "grid min-h-0 min-w-0 grid-rows-[48px_40px_minmax(0,1fr)] gap-0 overflow-hidden rounded-xl border bg-card py-0 shadow-sm",
      isActive && "ring-2 ring-primary/50",
    )}>
      <div className={cn("flex h-12 items-center border-b px-4", isActive ? "bg-primary/10" : "bg-muted/40")}>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <CardTitle className={cn("truncate text-sm font-semibold", disabled && "text-muted-foreground", isActive && "text-primary")}>
            {title}
          </CardTitle>
          {isLoading
            ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Loading" />
            : badge != null
            ? <Badge variant={isActive ? "default" : "secondary"} className="text-[11px]">{badge}</Badge>
            : null}
        </div>
      </div>
      <div className="border-b px-2 py-1.5">
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search…"
          className="h-7 text-xs"
          disabled={disabled}
        />
      </div>
      <CardContent
        ref={contentRef}
        className="min-h-0 overflow-y-auto overflow-x-hidden bg-background/60 p-2"
        onScroll={(event) => {
          if (!isRestoringScrollRef.current) {
            scrollPositionRef.current = event.currentTarget.scrollTop
          }
        }}
      >
        {disabled ? (
          <div className="flex h-full min-h-16 items-center justify-center px-3 text-center text-sm text-muted-foreground">
            {placeholder}
          </div>
        ) : children.length ? (
          <div className="grid content-start gap-1.5">{children}</div>
        ) : (
          <div className="flex h-full min-h-16 items-center justify-center px-3 text-center text-sm text-muted-foreground">
            {placeholder}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CommonalityImageCard({ row, config, lineId }) {
  const [imageFailed, setImageFailed] = useState(false)
  const imageUrl = config.buildImageUrl(row.filePath)
  const detailText = row.eqpModel
    ? `${row.grade} · ${row.eqpModel}`
    : `${row.grade} · ${row.stepSeq} · ${row.ppid}`
  const saveHitHistoryMutation = useMutation({
    mutationFn: createHitHistory,
    onSuccess: () => toast.success("History saved"),
    onError: (error) => toast.error(error.message),
  })
  const handleHistorySave = () => {
    saveHitHistoryMutation.mutate({
      lineId,
      updateDate: row.latestDate,
      sdwt: row.sdwt,
      filePath: row.filePath,
      execDate: new Date().toISOString(),
    })
  }

  return (
    <article className="grid min-w-0 overflow-hidden rounded-xl border bg-background shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold">{row.sensor} / {row.chStep}</h4>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {detailText}
          </p>
        </div>
        <Badge variant="outline">{row.grade}</Badge>
      </header>
      <div className="grid min-h-[320px] place-items-center bg-muted/10 p-3">
        {imageFailed ? (
          <div className="grid max-w-full justify-items-center gap-3 px-4 text-center">
            <FileWarning className="size-8 text-destructive" aria-hidden="true" />
            <p className="text-sm font-medium text-destructive">Unable to load image.</p>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={`${row[config.categoryRowKey]} ${row.sensor} ${row.chStep} ${config.title}`}
            className="max-h-[520px] w-full object-contain"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
      <footer className="flex items-center justify-end border-t bg-muted/20 px-4 py-2.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 px-[0.9rem] text-sm"
          onClick={handleHistorySave}
          disabled={saveHitHistoryMutation.isPending}
        >
          {saveHitHistoryMutation.isPending
            ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            : null}
          Save History
        </Button>
      </footer>
    </article>
  )
}

function filterValues(values, query) {
  const normalizedQuery = query.trim().toLowerCase()
  return normalizedQuery
    ? values.filter((item) => item.label.toLowerCase().includes(normalizedQuery))
    : values
}

function buildHistoryFilePaths(rows) {
  const categoryKeys = new Set()
  return rows.flatMap((row) => {
    const categoryKey = [row.sdwt, row.grade, row.sensor].join("\u0000")
    if (!row.filePath || categoryKeys.has(categoryKey)) return []
    categoryKeys.add(categoryKey)
    return [row.filePath]
  })
}

function buildPageItems(totalPages, activePage) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = Array.from(new Set([
    1,
    totalPages,
    activePage - 1,
    activePage,
    activePage + 1,
  ].filter((page) => page >= 1 && page <= totalPages))).sort((left, right) => left - right)

  return pages.flatMap((page, index) => {
    const previousPage = pages[index - 1]
    return previousPage && page - previousPage > 1
      ? [`ellipsis-${previousPage}`, page]
      : [page]
  })
}

export function CommonalityAnomalyPage({ variant = "matching" }) {
  const config = PAGE_VARIANTS[variant] ?? PAGE_VARIANTS.matching
  const queryClient = useQueryClient()
  const [selectedLine, setSelectedLine] = useState("")
  const [selectedTeam, setSelectedTeam] = useState("")
  const [selectedStepDesc, setSelectedStepDesc] = useState("")
  const [selectedSensor, setSelectedSensor] = useState("")
  const [selectedChStep, setSelectedChStep] = useState("")
  const [imagePage, setImagePage] = useState(1)
  const [queries, setQueries] = useState({ line: "", team: "", stepDesc: "", sensor: "", chStep: "" })
  const mappingQuery = useQuery({
    queryKey: ["l0-spider-line-mapping"],
    queryFn: fetchLineMapping,
  })
  const mappingReady = isLineMappingQueryReady(mappingQuery)
  const lineMapping = mappingReady ? mappingQuery.data.line_mapping : EMPTY_MAPPING
  const sdwtMapping = mappingReady ? mappingQuery.data.sdwt_mapping : EMPTY_MAPPING
  const lines = useMemo(
    () => Array.from(new Set(Object.values(lineMapping))),
    [lineMapping],
  )
  const activeLine = lines.includes(selectedLine) ? selectedLine : (lines[0] ?? "")
  const teamOptions = useMemo(
    () => Object.entries(lineMapping)
      .filter(([, line]) => line === activeLine)
      .map(([key]) => ({ key, label: sdwtMapping[key] ?? key })),
    [activeLine, lineMapping, sdwtMapping],
  )
  const activeTeam = teamOptions.some((team) => team.key === selectedTeam)
    ? selectedTeam
    : (teamOptions[0]?.key ?? "")
  const activeTeamLabel = teamOptions.find((team) => team.key === activeTeam)?.label ?? ""
  const dataQuery = useQuery({
    queryKey: [
      config.queryKey,
      activeLine,
      activeTeam,
      activeTeamLabel,
      selectedStepDesc,
      selectedSensor,
      selectedChStep,
    ],
    queryFn: () => config.fetchData({
      line: activeLine,
      pathSdwt: activeTeam,
      sdwt: activeTeamLabel,
      [config.categoryQueryKey]: selectedStepDesc,
      sensor: selectedSensor,
      chStep: selectedChStep,
    }),
    enabled: Boolean(mappingReady && activeLine && activeTeam && activeTeamLabel),
  })
  const stepDescs = dataQuery.data?.[config.categoryOptionKey] ?? EMPTY_LIST
  const sensors = dataQuery.data?.sensors ?? EMPTY_LIST
  const chSteps = dataQuery.data?.chSteps ?? EMPTY_LIST
  const activeStepDesc = dataQuery.data?.filters?.[config.categoryFilterKey] ?? ""
  const activeSensor = dataQuery.data?.filters?.sensor ?? ""
  const activeChStep = dataQuery.data?.filters?.chStep ?? ""
  const imageRows = selectedChStep && activeChStep === selectedChStep
    ? dataQuery.data?.rows ?? EMPTY_LIST
    : EMPTY_LIST
  const totalImagePages = Math.ceil(imageRows.length / IMAGES_PER_PAGE)
  const activeImagePage = Math.min(imagePage, Math.max(totalImagePages, 1))
  const visibleImageRows = useMemo(() => {
    const startIndex = (activeImagePage - 1) * IMAGES_PER_PAGE
    return imageRows.slice(startIndex, startIndex + IMAGES_PER_PAGE)
  }, [activeImagePage, imageRows])
  const imageGroups = useMemo(() => {
    const groups = new Map()
    visibleImageRows.forEach((row) => {
      const categoryValue = row[config.categoryRowKey]
      const rows = groups.get(categoryValue) ?? []
      rows.push(row)
      groups.set(categoryValue, rows)
    })
    return Array.from(groups, ([categoryValue, rows]) => ({ categoryValue, rows }))
      .sort((left, right) => left.categoryValue.localeCompare(right.categoryValue, "ko", { numeric: true }))
  }, [config.categoryRowKey, visibleImageRows])
  const pageItems = useMemo(
    () => buildPageItems(totalImagePages, activeImagePage),
    [activeImagePage, totalImagePages],
  )

  const setQuery = (key, value) => setQueries((current) => ({ ...current, [key]: value }))
  const resetStepFilters = () => {
    setSelectedStepDesc("")
    setSelectedSensor("")
    setSelectedChStep("")
    setImagePage(1)
    setQueries((current) => ({ ...current, stepDesc: "", sensor: "", chStep: "" }))
  }
  const handleChStepChange = async (chStep) => {
    const nextChStep = selectedChStep === chStep ? "" : chStep
    const clickedAt = new Date().toISOString()
    setSelectedChStep(nextChStep)
    setImagePage(1)
    if (!nextChStep) return

    try {
      const queryKey = [
        config.queryKey,
        activeLine,
        activeTeam,
        activeTeamLabel,
        selectedStepDesc,
        selectedSensor,
        nextChStep,
      ]
      const payload = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => config.fetchData({
          line: activeLine,
          pathSdwt: activeTeam,
          sdwt: activeTeamLabel,
          [config.categoryQueryKey]: selectedStepDesc,
          sensor: selectedSensor,
          chStep: nextChStep,
        }),
      })
      const filePaths = buildHistoryFilePaths(payload.rows ?? [])
      if (!filePaths.length) {
        throw new Error("No drawing results are available for click history.")
      }
      await createClickedCategoryHistory({
        app: "commonality",
        lineId: activeLine,
        filePaths,
        grades: (payload.rows ?? []).map((row) => row.grade),
        selectedSdwt: payload.rows?.[0]?.sdwt ?? activeTeamLabel,
        selectedSensor,
        clickedAt,
      })
    } catch (error) {
      toast.error(`Failed to save click history: ${error.message}`)
    }
  }
  const filteredLines = filterValues(
    lines.map((line) => ({ label: formatLineDisplayName(line), value: line })),
    queries.line,
  )
  const filteredTeams = filterValues(teamOptions.map((team) => ({ label: team.label, value: team.key })), queries.team)
  const filteredStepDescs = filterValues(
    stepDescs.map((stepDesc) => ({ label: stepDesc, value: stepDesc })),
    queries.stepDesc,
  )
  const filteredSensors = filterValues(
    sensors.length
      ? [
          { label: "ALL", value: ALL_SENSORS },
          ...sensors.map((sensor) => ({ label: sensor, value: sensor })),
        ]
      : [],
    queries.sensor,
  )
  const filteredChSteps = filterValues(
    chSteps.length
      ? selectedSensor === ALL_SENSORS
        ? [{ label: "ALL", value: ALL_CH_STEPS }]
        : [
          { label: "ALL", value: ALL_CH_STEPS },
          ...chSteps.map((chStep) => ({ label: chStep, value: chStep })),
        ]
      : [],
    queries.chStep,
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto bg-muted/30">
      <header className="shrink-0 border-b bg-card px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">{config.title}</h1>
              <Badge variant="outline">{config.badge}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {config.description}
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

      <section className="shrink-0 border-b bg-card">
        <ResizableFilterArea defaultHeight={316} minHeight={160} maxHeight={720}>
          <div className="h-full overflow-x-auto px-6 py-2">
            <div className="grid h-full min-w-[1120px] grid-cols-5 gap-4">
            <FilterCard
              title="Line Name"
              badge={lines.length}
              disabled={mappingQuery.isLoading || !lines.length}
              placeholder={mappingQuery.isLoading ? "Loading…" : "No lines are available."}
              isActive={Boolean(activeLine)}
              isLoading={mappingQuery.isFetching}
              query={queries.line}
              onQueryChange={(value) => setQuery("line", value)}
            >
              {filteredLines.map((item) => (
                <SelectRow
                  key={item.value}
                  label={item.label}
                  selected={activeLine === item.value}
                  onClick={() => {
                    setSelectedLine(item.value)
                    setSelectedTeam("")
                    setQueries((current) => ({ ...current, team: "" }))
                    resetStepFilters()
                  }}
                />
              ))}
            </FilterCard>
            <FilterCard
              title="SDWT"
              badge={teamOptions.length}
              disabled={!activeLine}
              placeholder="Select Line Name first"
              isActive={Boolean(activeTeam)}
              query={queries.team}
              onQueryChange={(value) => setQuery("team", value)}
            >
              {filteredTeams.map((item) => (
                <SelectRow
                  key={item.value}
                  label={item.label}
                  selected={activeTeam === item.value}
                  onClick={() => {
                    setSelectedTeam(item.value)
                    resetStepFilters()
                  }}
                />
              ))}
            </FilterCard>
            <FilterCard
              title={config.categoryLabel}
              badge={stepDescs.length}
              disabled={!activeTeam || dataQuery.isLoading}
              placeholder={dataQuery.isLoading ? config.latestLoadingText : `No ${config.categoryLabel} matches the selected SDWT.`}
              isActive={Boolean(activeStepDesc)}
              isLoading={dataQuery.isFetching && !selectedStepDesc}
              query={queries.stepDesc}
              onQueryChange={(value) => setQuery("stepDesc", value)}
            >
              {filteredStepDescs.map((item) => (
                <SelectRow
                  key={item.value}
                  label={item.label}
                  selected={activeStepDesc === item.value}
                  onClick={() => {
                    setSelectedStepDesc((current) => current === item.value ? "" : item.value)
                    setSelectedSensor("")
                    setSelectedChStep("")
                    setImagePage(1)
                    setQueries((current) => ({ ...current, sensor: "", chStep: "" }))
                  }}
                />
              ))}
            </FilterCard>
            <FilterCard
              title="Sensor"
              badge={sensors.length}
              disabled={!selectedStepDesc || dataQuery.isLoading}
              placeholder={selectedStepDesc ? `No Sensor matches the selected ${config.categoryLabel}.` : `Select ${config.categoryLabel} first`}
              isActive={Boolean(activeSensor)}
              isLoading={dataQuery.isFetching && !selectedSensor}
              query={queries.sensor}
              onQueryChange={(value) => setQuery("sensor", value)}
            >
              {filteredSensors.map((item) => (
                <SelectRow
                  key={item.value}
                  label={item.label}
                  selected={activeSensor === item.value}
                  onClick={() => {
                    setSelectedSensor((current) => current === item.value ? "" : item.value)
                    setSelectedChStep("")
                    setImagePage(1)
                    setQuery("chStep", "")
                  }}
                />
              ))}
            </FilterCard>
            <FilterCard
              title="ch_step"
              badge={chSteps.length}
              disabled={!selectedSensor || dataQuery.isLoading}
              placeholder={selectedSensor ? "No ch_step matches the selected Sensor." : "Select Sensor first"}
              isActive={Boolean(activeChStep)}
              isLoading={dataQuery.isFetching && Boolean(selectedSensor)}
              query={queries.chStep}
              onQueryChange={(value) => setQuery("chStep", value)}
            >
              {filteredChSteps.map((item) => (
                <SelectRow
                  key={item.value}
                  label={item.label}
                  selected={activeChStep === item.value}
                  onClick={() => { void handleChStepChange(item.value) }}
                />
              ))}
            </FilterCard>
            </div>
          </div>
        </ResizableFilterArea>
        {mappingQuery.isError ? (
          <div className="flex items-center justify-between gap-3 border-t px-6 py-2 text-xs text-destructive">
            <span>Reference mapping error: {mappingQuery.error.message}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={mappingQuery.isFetching}
              onClick={() => mappingQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : null}
      </section>

      <main className="grid min-w-0 gap-4 p-4">
        {dataQuery.data?.latest ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3 text-xs">
            <span className="font-semibold">{dataQuery.data.latest.name}</span>
            <code className="text-muted-foreground">{dataQuery.data.latest.date}</code>
          </div>
        ) : null}
        {dataQuery.isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {dataQuery.error.message}
          </div>
        ) : null}

        <section className="grid min-w-0 gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{config.resultTitle}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{config.resultDescription}</p>
            </div>
            {activeChStep ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{imageGroups.length.toLocaleString()} {config.resultCategoryName}</Badge>
                <Badge variant="outline">{imageRows.length.toLocaleString()} images</Badge>
              </div>
            ) : null}
          </div>

          {activeChStep && totalImagePages > 1 ? (
            <nav
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
              aria-label={`${config.title} image pages`}
            >
              <span className="text-xs tabular-nums text-muted-foreground">
                {((activeImagePage - 1) * IMAGES_PER_PAGE + 1).toLocaleString()}
                –
                {Math.min(activeImagePage * IMAGES_PER_PAGE, imageRows.length).toLocaleString()}
                {" / "}
                {imageRows.length.toLocaleString()} images
              </span>
              <div className="flex flex-wrap items-center justify-end gap-1">
                {pageItems.map((item) => typeof item === "number" ? (
                  <Button
                    key={item}
                    type="button"
                    size="sm"
                    variant={activeImagePage === item ? "default" : "outline"}
                    className="h-8 min-w-8 px-2 text-xs"
                    aria-label={`Page ${item}`}
                    aria-current={activeImagePage === item ? "page" : undefined}
                    onClick={() => setImagePage(item)}
                  >
                    {item}
                  </Button>
                ) : (
                  <span key={item} className="grid h-8 min-w-6 place-items-center text-xs text-muted-foreground" aria-hidden="true">
                    …
                  </span>
                ))}
              </div>
            </nav>
          ) : null}

          {!activeChStep ? (
            <div className="grid min-h-52 place-items-center rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
              {config.emptySelectionText}
            </div>
          ) : imageGroups.length ? (
            <div className="grid min-w-0 gap-5">
              {imageGroups.map((group) => (
                <section key={group.categoryValue} className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
                  <header className="flex items-center justify-between gap-3 border-b bg-muted/60 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge>{config.categoryLabel}</Badge>
                      <h3 className="truncate text-sm font-semibold">{group.categoryValue}</h3>
                    </div>
                    <Badge variant="secondary">{group.rows.length.toLocaleString()} images</Badge>
                  </header>
                  <div className="grid min-w-0 grid-cols-1 gap-4 p-4 lg:grid-cols-2 xl:grid-cols-3">
                    {group.rows.map((row) => (
                      <CommonalityImageCard key={row.id} row={row} config={config} lineId={activeLine} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid min-h-52 place-items-center rounded-lg border bg-card text-sm text-muted-foreground">
              {dataQuery.isFetching ? "Loading image list." : "No img.png matches the selected filters."}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
