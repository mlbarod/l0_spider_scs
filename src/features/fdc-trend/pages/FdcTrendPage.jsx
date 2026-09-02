import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ArrowUp, Check, ChevronRight, Loader2 } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { createClickedCategoryHistory } from "../api/clickedCategoryHistoryApi"
import { ResizableFilterArea } from "../components/ResizableFilterArea"
import { fetchCurrentUser } from "../api/currentUserApi"
import { createHitHistory } from "../api/hitHistoryApi"
import { fetchLineMapping } from "../api/mappingConfigApi"
import {
  areDbConnectionsEnabled,
  getSelfEquipmentFileConnectionState,
  isLineMappingQueryReady,
  isSelfEquipmentDbEnabled,
} from "../api/mappingContract.mjs"
import {
  createPassHistory,
  createPassHistoryBatch,
  deletePassHistory,
  fetchPassHistory,
  fetchSkipListData,
} from "../api/passHistoryApi"
import {
  fetchErdIdentityData,
  fetchErdScatterData,
  fetchEqpAllSkipTargets,
  fetchSelfEquipmentData,
  getErdChartRequest,
  getSelfEquipmentHistoryFilePath,
  getSelfEquipmentHistoryFilePaths,
  getSelfEquipmentPassHistoryFields,
  isSelfEquipmentHistoryActionAvailable,
} from "../api/selfEquipmentApi"
import { SENSOR_GRADES } from "../utils/fdcTrendMockData"
import { getLowestChStepRowsByPpid } from "../utils/chStepGrouping.mjs"
import { paginateChartGroups } from "../utils/chartPagination.mjs"
import { formatLineDisplayName } from "../utils/lineDisplay.mjs"
import {
  readSelfEquipmentUrlFilters,
  resolveSelfEquipmentGrades,
  resolveSelfEquipmentTeam,
} from "../utils/selfEquipmentUrlFilters.mjs"
import {
  buildRenderedScatterSeries,
  buildIdentityChartPoints,
  ERD_SCATTER_SERIES_DATA_KEYS,
  selectRenderedIdentityPoints,
} from "../utils/identityChart.mjs"

const EMPTY_MAPPING = Object.freeze({})
const EMPTY_LIST = Object.freeze([])
const ALL_EQP_CHANNELS = "ALL"
const ALL_SENSORS = "ALL"
const ALL_CH_STEPS = "ALL"
const ALL_STEPS = "ALL"
const SKIP_LIST_TEAM = "__SKIP_LIST__"
const SKIP_LIST_LABEL = "SKIP LIST"
const SCATTER_CHART_MARGIN = Object.freeze({ top: 42, right: 18, bottom: 28, left: 16 })
const SCATTER_Y_AXIS_WIDTH = 64
const SCATTER_X_AXIS_HEIGHT = 30
const EMPTY_EQP_SET = new Set()
function expandPriorities(grades) {
  return Array.from(new Set(
    grades.flatMap((grade) => (grade === "A/B" ? ["A", "B"] : [grade])),
  ))
}

function SelectRow({ label, meta, selected, multiple = false, onClick }) {
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
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-foreground",
          selected && "text-primary",
        )}
        title={label}
      >
        {label}
      </span>
      {meta ? (
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{meta}</span>
      ) : null}
      {multiple ? (
        <Check className={cn("size-3 shrink-0", selected ? "text-primary" : "text-transparent")} />
      ) : (
        <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
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
  scrollPositionRef,
  children,
}) {
  const contentRef = useRef(null)
  const localScrollPositionRef = useRef(0)
  const activeScrollPositionRef = scrollPositionRef ?? localScrollPositionRef
  const isRestoringScrollRef = useRef(false)

  useLayoutEffect(() => {
    if (!contentRef.current) return undefined

    const content = contentRef.current
    const savedScrollTop = activeScrollPositionRef.current
    isRestoringScrollRef.current = true
    content.scrollTop = savedScrollTop
    const animationFrame = requestAnimationFrame(() => {
      content.scrollTop = savedScrollTop
      isRestoringScrollRef.current = false
    })

    return () => cancelAnimationFrame(animationFrame)
  })

  return (
    <Card
      className={cn(
        "grid min-h-0 min-w-0 grid-rows-[48px_40px_minmax(0,1fr)] gap-0 overflow-hidden rounded-xl border bg-card py-0 shadow-sm transition-all",
        isActive && "ring-2 ring-primary/50",
      )}
    >
      <div
        className={cn(
          "flex h-12 items-center border-b px-4",
          isActive ? "bg-primary/10" : "bg-muted/40",
        )}
      >
        <div className="flex h-full min-w-0 flex-1 items-center justify-between gap-2">
          <CardTitle
            className={cn(
              "truncate text-sm font-semibold leading-5",
              disabled && "text-muted-foreground",
              isActive && "text-primary",
            )}
          >
            {title}
          </CardTitle>
          {isLoading ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="Loading" />
          ) : badge != null ? (
            <Badge variant={isActive ? "default" : "secondary"} className="shrink-0 text-[11px]">
              {badge}
            </Badge>
          ) : null}
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
            activeScrollPositionRef.current = event.currentTarget.scrollTop
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

function stripPngExtension(value) {
  return String(value ?? "").replace(/\.png$/i, "")
}

function getLatestDateFromErdPath(filePath) {
  const normalizedPath = String(filePath ?? "").replaceAll("/pic_server2/", "/pic/")
  return normalizedPath.match(/\/erd\/([^/]+)\//)?.[1] ?? ""
}

function normalizePassHistoryDate(value) {
  const text = String(value ?? "")
  const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/)
  if (!match) return text
  return !match[2] || match[2] === "00:00:00" ? match[1] : `${match[1]} ${match[2]}`
}

function buildChartPassHistoryKey(lineId, row) {
  return [
    lineId,
    row.ver,
    row.sdwt,
    row.desc,
    row.recipe_id,
    normalizePassHistoryDate(row.latest_date || getLatestDateFromErdPath(getSelfEquipmentHistoryFilePath(row))),
    row.priority,
    row.sensor,
    row.step,
    stripPngExtension(row.eqp),
  ].map((value) => String(value ?? "")).join("\u0000")
}

function buildRecordPassHistoryKey(record) {
  return [
    record.line_id,
    record.ver,
    record.sdwt,
    record.desc,
    record.recipe_id,
    normalizePassHistoryDate(record.update_date),
    record.priority,
    record.sensor,
    record.step,
    stripPngExtension(record.eqp),
  ].map((value) => String(value ?? "")).join("\u0000")
}

function formatActTimeTick(value) {
  if (Number.isFinite(Number(value))) {
    return new Date(Number(value)).toISOString().slice(0, 10).replaceAll("-", "/")
  }
  const text = String(value ?? "")
  return text.slice(0, 10).replaceAll("-", "/")
}

function safeHistoryUrl(value) {
  const url = String(value ?? "").trim()
  return /^(https?:\/\/|\/)/i.test(url) ? url : ""
}

function numericDomain(values, fallbackPadding) {
  let minimum = Infinity
  let maximum = -Infinity
  values.forEach((value) => {
    if (!Number.isFinite(value)) return
    minimum = Math.min(minimum, value)
    maximum = Math.max(maximum, value)
  })
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return [0, 1]
  if (minimum !== maximum) {
    const padding = (maximum - minimum) * 0.025
    return [minimum - padding, maximum + padding]
  }

  const padding = Math.abs(minimum) * 0.05 || fallbackPadding
  return [minimum - padding, maximum + padding]
}

function drawZoomOverlay(element, start, end) {
  if (!element || !start || !end) return

  const left = Math.min(start.pixelX, end.pixelX)
  const top = Math.min(start.pixelY, end.pixelY)
  element.style.display = "block"
  element.style.width = `${Math.abs(end.pixelX - start.pixelX)}px`
  element.style.height = `${Math.abs(end.pixelY - start.pixelY)}px`
  element.style.transform = `translate3d(${left}px, ${top}px, 0)`
}

function hideZoomOverlay(element) {
  if (element) element.style.display = "none"
}

function ChangeHistoryLabel({ viewBox, history }) {
  if (!viewBox || !history) return null

  const label = history.workType || "Change"
  const details = [history.date, history.description, history.ctttmUrl].filter(Boolean).join(" · ")
  const url = safeHistoryUrl(history.ctttmUrl)
  const text = (
    <text
      x={viewBox.x}
      y={Math.max(viewBox.y - 8, 12)}
      fill="#15803d"
      fontSize="10"
      fontWeight="600"
      textAnchor="middle"
    >
      <title>{details}</title>
      {label}
    </text>
  )

  return url ? (
    <a href={url} target="_blank" rel="noreferrer">{text}</a>
  ) : text
}

function ScatterPointTooltip({ active, payload, axisColumn, lotIdLabel = "root_lot_id" }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null

  const rows = [
    ...(point.eqpCb ? [["eqp_cb", point.eqpCb]] : []),
    ["eqp_id", point.eqpId],
    ["disp_name", point.dispName],
    ["wafer_id", point.waferId],
    [lotIdLabel, point.rootLotId],
    [axisColumn, Number(point.value).toFixed(2)],
    ["act_time", point.actTime],
  ]

  return (
    <div className="grid min-w-52 gap-1.5 rounded-md border bg-background p-3 text-xs shadow-md">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
          <span className="text-muted-foreground">{label}</span>
          <span className="break-all text-right font-mono text-foreground">
            {value === "" || value === null || value === undefined ? "-" : value}
          </span>
        </div>
      ))}
    </div>
  )
}

function IdentityScatterPoint({ cx, cy, payload }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !payload) return null
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill={payload.isSelected ? "#ef4444" : "#9ca3af"}
      stroke="none"
    />
  )
}

function IdentityXAxisTick({ x, y, payload, groups }) {
  const index = Math.floor(Number(payload?.value))
  const group = groups[index]
  if (!group) return null

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={-8}
        y={0}
        transform="rotate(-90)"
        fill={group.isSelected ? "#dc2626" : "var(--muted-foreground)"}
        fontSize="11"
        fontWeight={group.isSelected ? "700" : "500"}
        textAnchor="end"
        dominantBaseline="middle"
      >
        {group.eqpCb}
      </text>
    </g>
  )
}

function useChartDrawReveal(chartRef, revealToken, chartReady) {
  useLayoutEffect(() => {
    const chart = chartRef.current
    if (!chart || !revealToken || !chartReady) return undefined

    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return undefined
    }

    if (typeof requestAnimationFrame !== "function") {
      return undefined
    }

    let chartObserver = null
    let drawFrame = null
    let revealFrame = null
    const handleAnimationEnd = (event) => {
      if (event.animationName !== "chart-plot-enter") return
      chart.classList.remove("chart-plot-enter", "chart-plot-enter-active")
      chart.removeEventListener("animationend", handleAnimationEnd)
    }
    const revealChart = () => {
      chartObserver?.disconnect()
      chartObserver = null
      chart.classList.add("chart-plot-enter")
      chart.addEventListener("animationend", handleAnimationEnd)
      drawFrame = requestAnimationFrame(() => {
        revealFrame = requestAnimationFrame(() => {
          chart.classList.add("chart-plot-enter-active")
        })
      })
    }

    if (chart.querySelector("svg.recharts-surface") || typeof MutationObserver === "undefined") {
      revealChart()
    } else {
      chartObserver = new MutationObserver(() => {
        if (chart.querySelector("svg.recharts-surface")) revealChart()
      })
      chartObserver.observe(chart, { childList: true, subtree: true })
    }

    return () => {
      chartObserver?.disconnect()
      if (drawFrame !== null) cancelAnimationFrame(drawFrame)
      if (revealFrame !== null) cancelAnimationFrame(revealFrame)
      chart.removeEventListener("animationend", handleAnimationEnd)
      chart.classList.remove("chart-plot-enter", "chart-plot-enter-active")
    }
  }, [chartReady, chartRef, revealToken])
}

function ChartLoadingSurface({ active, label }) {
  return (
    <div className="chart-loading-surface relative grid h-[320px] w-full min-w-0 place-items-center overflow-hidden rounded-md">
      {active ? <div className="chart-loading-gauge" aria-hidden="true" /> : null}
      <span className="sr-only">{label}</span>
    </div>
  )
}

function ChartLoadError({ error }) {
  return (
    <div className="px-4 text-center text-sm text-destructive">
      <p>{error?.message ?? "Unable to load chart data."}</p>
    </div>
  )
}

export function IdentityChartDialog({
  row,
  eqp,
  identityFetcher = fetchErdIdentityData,
  queryKeyPrefix = "erd-identity-data",
  lotIdLabel = "root_lot_id",
}) {
  const chartRef = useRef(null)
  const zoomOverlayRef = useRef(null)
  const zoomSelectionRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [zoomDomain, setZoomDomain] = useState(null)
  const [referenceLineMode, setReferenceLineMode] = useState(false)
  const [referenceLines, setReferenceLines] = useState([])
  const identityQuery = useQuery({
    queryKey: [
      queryKeyPrefix,
      row.file_path,
      row.latest_date,
      eqp,
      row.sensor,
      row.step,
      row.ver,
      row.path_sdwt,
    ],
    queryFn: ({ signal }) => identityFetcher(getErdChartRequest(row, eqp, { signal })),
    enabled: Boolean(open && row.file_path && eqp && row.sensor && row.step),
    staleTime: Infinity,
    gcTime: Infinity,
  })
  const groups = identityQuery.data?.groups ?? EMPTY_LIST
  const axisColumn = identityQuery.data?.axisColumn ?? `${row.sensor}_${row.step}`
  const sharedYDomain = useMemo(
    () => numericDomain(
      groups.flatMap((group) => group.points.map((point) => point.value)),
      1,
    ),
    [groups],
  )
  const identityPoints = useMemo(() => buildIdentityChartPoints(groups), [groups])
  const renderedIdentitySeries = useMemo(
    () => selectRenderedIdentityPoints(groups, identityPoints, zoomDomain),
    [groups, identityPoints, zoomDomain],
  )
  const fullXDomain = [0, Math.max(groups.length, 1)]
  const xTicks = groups.map((_, index) => index + 0.5)
  const identityXAxisHeight = Math.min(
    150,
    Math.max(68, groups.reduce((length, group) => Math.max(length, group.eqpCb.length), 0) * 7 + 18),
  )
  const identityMargin = { top: 18, right: 14, bottom: 8, left: 8 }

  const updateZoomSelection = (selection) => {
    zoomSelectionRef.current = selection
    if (!selection) hideZoomOverlay(zoomOverlayRef.current)
  }
  const getZoomPoint = (event) => {
    const chart = chartRef.current
    if (!chart || !event) return null

    const bounds = chart.getBoundingClientRect()
    const plotLeft = identityMargin.left + SCATTER_Y_AXIS_WIDTH
    const plotRight = bounds.width - identityMargin.right
    const plotTop = identityMargin.top
    const plotBottom = bounds.height - identityMargin.bottom - identityXAxisHeight
    const chartX = Math.min(Math.max(event.clientX - bounds.left, plotLeft), plotRight)
    const chartY = Math.min(Math.max(event.clientY - bounds.top, plotTop), plotBottom)
    const xDomain = zoomDomain?.x ?? fullXDomain
    const yDomain = zoomDomain?.y ?? sharedYDomain
    const xRatio = (chartX - plotLeft) / Math.max(plotRight - plotLeft, 1)
    const yRatio = (chartY - plotTop) / Math.max(plotBottom - plotTop, 1)

    return {
      x: xDomain[0] + xRatio * (xDomain[1] - xDomain[0]),
      y: yDomain[1] - yRatio * (yDomain[1] - yDomain[0]),
      pixelX: chartX,
      pixelY: chartY,
    }
  }
  const handleZoomStart = (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    const point = getZoomPoint(event)
    if (!point) return
    if (referenceLineMode) {
      const nextLines = [...referenceLines.slice(0, 1), point.y]
      setReferenceLines(nextLines)
      if (nextLines.length === 2) setReferenceLineMode(false)
      return
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    updateZoomSelection(point)
    drawZoomOverlay(zoomOverlayRef.current, point, point)
  }
  const handleZoomMove = (event) => {
    const start = zoomSelectionRef.current
    if (!start) return
    const point = getZoomPoint(event)
    if (point) drawZoomOverlay(zoomOverlayRef.current, start, point)
  }
  const handleZoomEnd = (event) => {
    const start = zoomSelectionRef.current
    if (!start) return
    const point = getZoomPoint(event)
    if (point && Math.abs(point.pixelX - start.pixelX) > 4 && Math.abs(point.pixelY - start.pixelY) > 4) {
      setZoomDomain({
        x: [Math.min(start.x, point.x), Math.max(start.x, point.x)],
        y: [Math.min(start.y, point.y), Math.max(start.y, point.y)],
      })
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    updateZoomSelection(null)
  }
  const resetZoom = () => {
    updateZoomSelection(null)
    setZoomDomain(null)
  }
  const handleReferenceLineMode = () => {
    setReferenceLineMode((current) => {
      if (current) return false
      if (referenceLines.length >= 2) setReferenceLines([])
      return true
    })
  }
  const clearReferenceLines = () => {
    setReferenceLineMode(false)
    setReferenceLines([])
  }
  const handleChartContextMenu = (event) => {
    event.preventDefault()
    clearReferenceLines()
  }
  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetZoom()
      clearReferenceLines()
    }
  }
  const visibleXDomain = zoomDomain?.x ?? fullXDomain
  const referenceBand = referenceLines.length === 2
    ? [Math.min(...referenceLines), Math.max(...referenceLines)]
    : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 px-[0.9rem] text-sm">Similarity Chart</Button>
      </DialogTrigger>
      <DialogContent className="h-[88vh] w-[96vw] max-w-[96vw] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-[96vw]">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
            <DialogTitle>{eqp || "Unspecified EQP"} Similarity Chart</DialogTitle>
            <Button
              type="button"
              size="sm"
              variant={referenceLineMode ? "default" : "outline"}
              onClick={handleReferenceLineMode}
            >
              Draw Reference Lines
            </Button>
          </div>
          <DialogDescription className="grid gap-1">
            <span className="font-medium text-foreground">
              {row.recipe_id || "Unspecified PPID"} / {row.sensor || "Unspecified sensor"} / {row.step || "Unspecified ch_step"}
            </span>
            <span>
              {identityQuery.data
                ? `${identityQuery.data.groupCount.toLocaleString()} EQPs · ${identityQuery.data.pointCount.toLocaleString()} points`
                : "Compare all eqp_cb values in the same data file."}
            </span>
          </DialogDescription>
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
            Hover: details · Left-drag: zoom area · Double-click: reset zoom ·
            After enabling reference lines, click twice: mark range · Right-click: remove lines
          </p>
        </DialogHeader>
        {identityQuery.isLoading ? (
          <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              Loading similarity chart data.
            </span>
          </div>
        ) : identityQuery.isError ? (
          <div className="grid min-h-80 place-items-center px-6">
            <ChartLoadError error={identityQuery.error} />
          </div>
        ) : groups.length ? (
          <div
            ref={chartRef}
            className="relative min-h-0 w-full cursor-crosshair select-none touch-none rounded-md border bg-background"
            onPointerDown={handleZoomStart}
            onPointerMove={handleZoomMove}
            onPointerUp={handleZoomEnd}
            onPointerCancel={() => updateZoomSelection(null)}
            onDoubleClick={resetZoom}
            onContextMenu={handleChartContextMenu}
          >
            <div
              ref={zoomOverlayRef}
              className="pointer-events-none absolute left-0 top-0 z-10 hidden border border-primary bg-primary/10 will-change-transform"
              aria-hidden="true"
            />
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={identityMargin}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="identityX"
                  type="number"
                  height={identityXAxisHeight}
                  domain={zoomDomain?.x ?? fullXDomain}
                  allowDataOverflow={Boolean(zoomDomain)}
                  ticks={xTicks}
                  tick={<IdentityXAxisTick groups={groups} />}
                  interval={0}
                />
                <YAxis
                  dataKey="value"
                  type="number"
                  name={axisColumn}
                  width={SCATTER_Y_AXIS_WIDTH}
                  domain={zoomDomain?.y ?? sharedYDomain}
                  allowDataOverflow={Boolean(zoomDomain)}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  tickFormatter={(value) => Number(value).toFixed(2)}
                />
                <RechartsTooltip
                  content={<ScatterPointTooltip axisColumn={axisColumn} lotIdLabel={lotIdLabel} />}
                  cursor={false}
                  isAnimationActive={false}
                  animationDuration={0}
                  wrapperStyle={{ transition: "none", willChange: "auto" }}
                />
                {referenceBand ? (
                  <ReferenceArea
                    x1={visibleXDomain[0]}
                    x2={visibleXDomain[1]}
                    y1={referenceBand[0]}
                    y2={referenceBand[1]}
                    fill="#fb923c"
                    fillOpacity={0.16}
                    stroke="none"
                    ifOverflow="visible"
                  />
                ) : null}
                {referenceLines.map((value, index) => (
                  <ReferenceLine
                    key={`user-reference-${index}`}
                    y={value}
                    stroke="#f97316"
                    strokeWidth={1.75}
                    ifOverflow="extendDomain"
                  />
                ))}
                {groups.slice(1).map((group, index) => (
                  <ReferenceLine
                    key={group.eqpCb}
                    x={index + 1}
                    stroke="var(--foreground)"
                    strokeWidth={1.25}
                  />
                ))}
                <Scatter
                  data={renderedIdentitySeries.points}
                  dataKey="value"
                  shape={<IdentityScatterPoint />}
                  fill="#9ca3af"
                  stroke="none"
                  isAnimationActive={false}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">
            No eqp_cb data to display.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const ThreeDayIdentityChartCard = memo(function ThreeDayIdentityChartCard({ row, eqp }) {
  const cardRef = useRef(null)
  const chartRef = useRef(null)
  const [isNearViewport, setIsNearViewport] = useState(false)

  useEffect(() => {
    const card = cardRef.current
    if (!card || typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true)
      return undefined
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setIsNearViewport(true)
      observer.disconnect()
    }, { rootMargin: "500px 0px" })
    observer.observe(card)
    return () => observer.disconnect()
  }, [])

  const identityQuery = useQuery({
    queryKey: [
      "erd-identity-data",
      row.file_path,
      row.latest_date,
      eqp,
      row.sensor,
      row.step,
      row.ver,
      row.path_sdwt,
      3,
    ],
    queryFn: ({ signal }) => fetchErdIdentityData(getErdChartRequest(row, eqp, {
      days: 3,
      signal,
    })),
    enabled: Boolean(isNearViewport && row.file_path && eqp && row.sensor && row.step),
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
  })
  const groups = identityQuery.data?.groups ?? EMPTY_LIST
  const axisColumn = identityQuery.data?.axisColumn ?? `${row.sensor}_${row.step}`
  const identityPoints = useMemo(() => buildIdentityChartPoints(groups), [groups])
  const renderedPoints = useMemo(
    () => selectRenderedIdentityPoints(groups, identityPoints, null).points,
    [groups, identityPoints],
  )
  const yDomain = useMemo(
    () => numericDomain(groups.flatMap((group) => group.points.map((point) => point.value)), 1),
    [groups],
  )
  const xDomain = [0, Math.max(groups.length, 1)]
  const xTicks = groups.map((_, index) => index + 0.5)
  const xAxisHeight = Math.min(
    120,
    Math.max(62, groups.reduce((length, group) => Math.max(length, group.eqpCb.length), 0) * 6 + 16),
  )
  useChartDrawReveal(
    chartRef,
    identityQuery.dataUpdatedAt,
    Boolean(isNearViewport && groups.length),
  )

  return (
    <article ref={cardRef} className="grid min-h-[400px] min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-primary/25 bg-card shadow-sm">
      <header className="border-b border-primary/20 bg-primary/5 px-3 py-2">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">Last 3 Days Similarity Chart</h3>
            <p className="truncate text-[11px] text-muted-foreground">
              {row.recipe_id || "Unspecified PPID"} · {row.sensor || "Unspecified sensor"} · {row.step || "Unspecified ch_step"}
            </p>
          </div>
          {identityQuery.data ? (
            <Badge variant="secondary" className="shrink-0">
              {groups.length.toLocaleString()} EQP · {identityQuery.data.pointCount.toLocaleString()} points
            </Badge>
          ) : null}
        </div>
      </header>
      <div
        className="grid min-h-[320px] place-items-center bg-background p-3"
        aria-busy={!isNearViewport || identityQuery.isLoading}
      >
        {!isNearViewport || identityQuery.isLoading ? (
          <ChartLoadingSurface
            active={isNearViewport && identityQuery.isLoading}
            label="Preparing the last 3 days similarity chart."
          />
        ) : identityQuery.isError ? (
          <ChartLoadError error={identityQuery.error} />
        ) : groups.length ? (
          <div ref={chartRef} className="h-[320px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 18, right: 14, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="identityX"
                  type="number"
                  height={xAxisHeight}
                  domain={xDomain}
                  ticks={xTicks}
                  tick={<IdentityXAxisTick groups={groups} />}
                  interval={0}
                />
                <YAxis
                  dataKey="value"
                  type="number"
                  name={axisColumn}
                  width={SCATTER_Y_AXIS_WIDTH}
                  domain={yDomain}
                  tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  tickFormatter={(value) => Number(value).toFixed(2)}
                />
                <RechartsTooltip
                  content={<ScatterPointTooltip axisColumn={axisColumn} />}
                  cursor={false}
                  isAnimationActive={false}
                  animationDuration={0}
                  wrapperStyle={{ transition: "none", willChange: "auto" }}
                />
                {groups.slice(1).map((group, index) => (
                  <ReferenceLine
                    key={group.eqpCb}
                    x={index + 1}
                    stroke="var(--foreground)"
                    strokeWidth={1.25}
                  />
                ))}
                <Scatter
                  data={renderedPoints}
                  dataKey="value"
                  shape={<IdentityScatterPoint />}
                  fill="#9ca3af"
                  stroke="none"
                  isAnimationActive={false}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="px-4 text-center text-sm text-muted-foreground">
            No similarity data is available for the last 3 days.
          </div>
        )}
      </div>
    </article>
  )
})

export const SkipChartDialog = memo(function SkipChartDialog({
  eqp,
  filePath,
  lineId,
  historyFields,
  disabled,
  prcGroup = "",
  dataQueryKeyPrefix = "self-equipment-data",
}) {
  const queryClient = useQueryClient()
  const [skipDialogOpen, setSkipDialogOpen] = useState(false)
  const [skipComment, setSkipComment] = useState("")
  const [skipClickedAt, setSkipClickedAt] = useState("")

  const refreshPassHistory = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["pass-history", lineId] }),
    queryClient.invalidateQueries({ queryKey: ["skip-list-data", lineId] }),
    queryClient.invalidateQueries({ queryKey: ["common-anomaly-skip-list", lineId] }),
    queryClient.invalidateQueries({ queryKey: [dataQueryKeyPrefix, lineId] }),
  ])
  const createSkipMutation = useMutation({
    mutationFn: createPassHistory,
    onSuccess: async () => {
      setSkipDialogOpen(false)
      setSkipComment("")
      setSkipClickedAt("")
      await refreshPassHistory()
      toast.success("SKIP completed")
    },
    onError: (error) => toast.error(error.message),
  })
  const handleSkipDialogChange = (nextOpen) => {
    if (createSkipMutation.isPending) return
    setSkipDialogOpen(nextOpen)
    if (nextOpen) {
      setSkipClickedAt(new Date().toISOString())
      return
    }
    setSkipComment("")
    setSkipClickedAt("")
  }

  const handleSkipConfirm = () => {
    createSkipMutation.mutate({
      lineId,
      filePath,
      eqp,
      prcGroup,
      ...historyFields,
      comment: skipComment,
      execDate: skipClickedAt || new Date().toISOString(),
    })
  }

  return (
    <Dialog open={skipDialogOpen} onOpenChange={handleSkipDialogChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>SKIP</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{eqp || "Unspecified EQP"} Anomaly SKIP</DialogTitle>
          <DialogDescription>
            You can enter a one-line reason for SKIP. The comment is optional.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={skipComment}
          onChange={(event) => setSkipComment(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing && !createSkipMutation.isPending) {
              event.preventDefault()
              handleSkipConfirm()
            }
          }}
          placeholder="Enter comment (optional)"
          aria-label="SKIP comment"
          autoFocus
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSkipDialogChange(false)}
            disabled={createSkipMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSkipConfirm} disabled={createSkipMutation.isPending}>
            {createSkipMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export const EqpAllSkipDialog = memo(function EqpAllSkipDialog({
  eqp,
  sensor,
  lineId,
  loadTargets,
  dataQueryKeyPrefix,
  disabled = false,
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [comment, setComment] = useState("")
  const [clickedAt, setClickedAt] = useState("")
  const refreshPassHistory = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["pass-history", lineId] }),
    queryClient.invalidateQueries({ queryKey: ["skip-list-data", lineId] }),
    queryClient.invalidateQueries({ queryKey: ["common-anomaly-skip-list", lineId] }),
    queryClient.invalidateQueries({ queryKey: [dataQueryKeyPrefix, lineId] }),
  ])
  const createAllSkipMutation = useMutation({
    mutationFn: async () => {
      const targets = await loadTargets(sensor)
      const uniqueTargets = Array.from(new Map(targets.map((target) => [
        [target.filePath, target.eqp, target.prcGroup].join("\u0000"),
        { lineId, ...target },
      ])).values())
      if (!uniqueTargets.length) throw new Error("No ch_step data is available for bulk SKIP.")
      return createPassHistoryBatch({
        records: uniqueTargets,
        comment,
        execDate: clickedAt || new Date().toISOString(),
      })
    },
    onSuccess: async (result) => {
      setOpen(false)
      setComment("")
      setClickedAt("")
      await refreshPassHistory()
      toast.success(`EQP ALL SKIP completed (${result.requestedRows?.toLocaleString() ?? 0} rows)`)
    },
    onError: (error) => toast.error(error.message),
  })
  const handleOpenChange = (nextOpen) => {
    if (createAllSkipMutation.isPending) return
    setOpen(nextOpen)
    if (nextOpen) {
      setClickedAt(new Date().toISOString())
      return
    }
    setComment("")
    setClickedAt("")
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          EQP ALL SKIP
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {eqp || "Unspecified EQP"} / {sensor || "Unspecified sensor"} ALL SKIP
          </DialogTitle>
          <DialogDescription>
            Register every ch_step for this EQP and sensor in PASS history.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Enter comment (optional)"
          aria-label="EQP ALL SKIP comment"
          autoFocus
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={createAllSkipMutation.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => createAllSkipMutation.mutate()} disabled={createAllSkipMutation.isPending}>
            {createAllSkipMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

const ErdScatterCard = memo(function ErdScatterCard({
  row,
  lineId,
  passRecord,
  allSkipLoadTargets,
  dataQueryKeyPrefix,
}) {
  const eqp = stripPngExtension(row.eqp)
  const queryClient = useQueryClient()
  const cardRef = useRef(null)
  const chartContainerRef = useRef(null)
  const zoomOverlayRef = useRef(null)
  const zoomSelectionRef = useRef(null)
  const [isNearViewport, setIsNearViewport] = useState(false)
  const [zoomDomain, setZoomDomain] = useState(null)
  const isSkipped = Boolean(passRecord)
  const historyFilePath = getSelfEquipmentHistoryFilePath(row)
  const passHistoryFields = getSelfEquipmentPassHistoryFields(row)
  const historyActionsEnabled = isSelfEquipmentHistoryActionAvailable(row)

  const refreshPassHistory = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["pass-history", lineId] }),
    queryClient.invalidateQueries({ queryKey: ["skip-list-data", lineId] }),
    queryClient.invalidateQueries({ queryKey: [dataQueryKeyPrefix, lineId] }),
  ])
  const deleteSkipMutation = useMutation({
    mutationFn: deletePassHistory,
    onSuccess: async () => {
      await refreshPassHistory()
      toast.success("SKIP removed")
    },
    onError: (error) => toast.error(error.message),
  })
  const handleSkipDelete = () => {
    deleteSkipMutation.mutate({ lineId, filePath: historyFilePath, ...passHistoryFields })
  }
  const saveHitHistoryMutation = useMutation({
    mutationFn: createHitHistory,
    onSuccess: () => toast.success("History saved"),
    onError: (error) => toast.error(error.message),
  })
  const handleHistorySave = () => {
    saveHitHistoryMutation.mutate({
      lineId,
      updateDate: passHistoryFields.updateDate,
      sdwt: passHistoryFields.sdwt,
      filePath: historyFilePath,
      execDate: new Date().toISOString(),
    })
  }

  useEffect(() => {
    const card = cardRef.current
    if (!card || typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true)
      return undefined
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setIsNearViewport(true)
      observer.disconnect()
    }, { rootMargin: "600px 0px" })
    observer.observe(card)
    return () => observer.disconnect()
  }, [])

  const chartQuery = useQuery({
    queryKey: [
      "erd-scatter-data",
      row.file_path,
      row.latest_date,
      eqp,
      row.sensor,
      row.step,
      row.ver,
      row.path_sdwt,
    ],
    queryFn: () => fetchErdScatterData(getErdChartRequest(row, eqp)),
    enabled: Boolean(isNearViewport && row.file_path && eqp && row.sensor && row.step),
    staleTime: Infinity,
    gcTime: Infinity,
  })
  const points = chartQuery.data?.points ?? EMPTY_LIST
  const changeHistory = chartQuery.data?.changeHistory ?? EMPTY_LIST
  useChartDrawReveal(
    chartContainerRef,
    chartQuery.dataUpdatedAt,
    Boolean(isNearViewport && points.length),
  )
  const renderedPointSeries = useMemo(
    () => buildRenderedScatterSeries(points, zoomDomain),
    [points, zoomDomain],
  )
  const axisColumn = chartQuery.data?.axisColumn ?? `${row.sensor}_${row.step}`
  const baseDomain = useMemo(() => ({
    x: numericDomain([
      ...points.map((point) => point.actTimeMs),
      ...changeHistory.map((history) => history.dateMs),
    ], 60 * 60 * 1000),
    y: numericDomain(points.map((point) => point.value), 1),
  }), [changeHistory, points])

  const getZoomPoint = (event) => {
    const chart = chartContainerRef.current
    if (!chart || !event) return null

    const bounds = chart.getBoundingClientRect()
    const plotLeft = SCATTER_CHART_MARGIN.left + SCATTER_Y_AXIS_WIDTH
    const plotRight = bounds.width - SCATTER_CHART_MARGIN.right
    const plotTop = SCATTER_CHART_MARGIN.top
    const plotBottom = bounds.height - SCATTER_CHART_MARGIN.bottom - SCATTER_X_AXIS_HEIGHT
    const chartX = Math.min(Math.max(event.clientX - bounds.left, plotLeft), plotRight)
    const chartY = Math.min(Math.max(event.clientY - bounds.top, plotTop), plotBottom)
    const xDomain = zoomDomain?.x ?? baseDomain.x
    const yDomain = zoomDomain?.y ?? baseDomain.y
    const xRatio = (chartX - plotLeft) / Math.max(plotRight - plotLeft, 1)
    const yRatio = (chartY - plotTop) / Math.max(plotBottom - plotTop, 1)

    return {
      x: xDomain[0] + xRatio * (xDomain[1] - xDomain[0]),
      y: yDomain[1] - yRatio * (yDomain[1] - yDomain[0]),
      pixelX: chartX,
      pixelY: chartY,
    }
  }
  const updateZoomSelection = (selection) => {
    zoomSelectionRef.current = selection
    if (!selection) hideZoomOverlay(zoomOverlayRef.current)
  }
  const handleZoomStart = (event) => {
    if (event?.button !== 0) return
    event.preventDefault()
    const point = getZoomPoint(event)
    if (!point) return

    event.currentTarget.setPointerCapture?.(event.pointerId)
    updateZoomSelection(point)
    drawZoomOverlay(zoomOverlayRef.current, point, point)
  }
  const handleZoomMove = (event) => {
    const start = zoomSelectionRef.current
    if (!start) return
    const point = getZoomPoint(event)
    if (point) drawZoomOverlay(zoomOverlayRef.current, start, point)
  }
  const handleZoomEnd = (event) => {
    const start = zoomSelectionRef.current
    if (!start) return

    const point = getZoomPoint(event)
    if (point && Math.abs(point.pixelX - start.pixelX) > 4 && Math.abs(point.pixelY - start.pixelY) > 4) {
      setZoomDomain({
        x: [Math.min(start.x, point.x), Math.max(start.x, point.x)],
        y: [Math.min(start.y, point.y), Math.max(start.y, point.y)],
      })
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    updateZoomSelection(null)
  }
  const resetZoom = () => {
    updateZoomSelection(null)
    setZoomDomain(null)
  }

  return (
    <article ref={cardRef} className="grid min-h-[400px] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border bg-card shadow-sm">
      <header className="border-b bg-muted/50 px-3 py-2">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h3 className="shrink-0 text-sm font-semibold">{eqp || "Unspecified EQP"}</h3>
            <p className="truncate text-[11px] text-muted-foreground">
              {row.recipe_id || "Unspecified PPID"} · {row.sensor || "Unspecified sensor"} · {row.step || "Unspecified ch_step"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isSkipped ? <Badge variant="destructive">Anomaly SKIP</Badge> : null}
            {chartQuery.data ? (
              <Badge variant="secondary">{points.length.toLocaleString()} points</Badge>
            ) : null}
            <Badge variant="outline">{row.priority ? `${row.priority} Grade` : "Unspecified Grade"}</Badge>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-red-500" /> Anomaly data
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-gray-400" /> Previous data
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed border-green-600" /> Change history
          </span>
          <span>Drag to zoom · Double-click to reset</span>
        </div>
      </header>
      <div
        className="grid min-h-[320px] place-items-center bg-background p-3"
        aria-busy={!isNearViewport || chartQuery.isLoading}
      >
        {!isNearViewport || chartQuery.isLoading ? (
          <ChartLoadingSurface
            active={isNearViewport && chartQuery.isLoading}
            label="Preparing scatter chart."
          />
        ) : chartQuery.isError ? (
          <ChartLoadError error={chartQuery.error} />
        ) : points.length ? (
          <div
            ref={chartContainerRef}
            className="relative h-[320px] w-full min-w-0 cursor-crosshair select-none touch-none"
            onPointerDown={handleZoomStart}
            onPointerMove={handleZoomMove}
            onPointerUp={handleZoomEnd}
            onPointerCancel={() => updateZoomSelection(null)}
            onDoubleClick={resetZoom}
          >
            <div
              ref={zoomOverlayRef}
              className="pointer-events-none absolute left-0 top-0 z-10 hidden border border-primary bg-primary/10 will-change-transform"
              aria-hidden="true"
            />
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={SCATTER_CHART_MARGIN}
              >
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="actTimeMs"
                  type="number"
                  name="act_time"
                  height={SCATTER_X_AXIS_HEIGHT}
                  domain={zoomDomain?.x ?? baseDomain.x}
                  allowDataOverflow={Boolean(zoomDomain)}
                  scale="time"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={formatActTimeTick}
                  label={{ value: "act_time", position: "insideBottom", offset: -18, fontSize: 11 }}
                />
                <YAxis
                  dataKey="value"
                  type="number"
                  name={axisColumn}
                  width={SCATTER_Y_AXIS_WIDTH}
                  domain={zoomDomain?.y ?? baseDomain.y}
                  allowDataOverflow={Boolean(zoomDomain)}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickFormatter={(value) => Number(value).toFixed(2)}
                />
                <RechartsTooltip
                  content={<ScatterPointTooltip axisColumn={axisColumn} />}
                  cursor={false}
                  isAnimationActive={false}
                  animationDuration={0}
                  wrapperStyle={{ transition: "none", willChange: "auto" }}
                />
                {changeHistory.map((history, index) => (
                  <ReferenceLine
                    key={`${history.dateMs}-${index}`}
                    x={history.dateMs}
                    stroke="#16a34a"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    ifOverflow="extendDomain"
                    label={<ChangeHistoryLabel history={history} />}
                  />
                ))}
                <Scatter
                  data={renderedPointSeries.previous}
                  dataKey={ERD_SCATTER_SERIES_DATA_KEYS.previous}
                  fill="#9ca3af"
                  isAnimationActive={false}
                />
                <Scatter
                  data={renderedPointSeries.recent}
                  dataKey={ERD_SCATTER_SERIES_DATA_KEYS.recent}
                  fill="#ef4444"
                  isAnimationActive={false}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="px-4 text-center text-sm text-muted-foreground">
            No valid scatter data is available for {eqp}.
          </div>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {historyActionsEnabled ? (
            <SkipChartDialog
              eqp={eqp}
              filePath={historyFilePath}
              lineId={lineId}
              historyFields={passHistoryFields}
              dataQueryKeyPrefix={dataQueryKeyPrefix}
              disabled={isSkipped}
            />
          ) : null}
          {historyActionsEnabled && allSkipLoadTargets ? (
            <EqpAllSkipDialog
              eqp={eqp}
              sensor={row.sensor}
              lineId={lineId}
              dataQueryKeyPrefix={dataQueryKeyPrefix}
              loadTargets={allSkipLoadTargets}
            />
          ) : null}
          {isSkipped ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSkipDelete}
              disabled={deleteSkipMutation.isPending}
            >
              {deleteSkipMutation.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              Remove SKIP
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <IdentityChartDialog row={row} eqp={eqp} />
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-9 px-[0.9rem] text-sm">Change History</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>{eqp || "Unspecified EQP"} Change History</DialogTitle>
              <DialogDescription>
                {changeHistory.length.toLocaleString()} change history records.
              </DialogDescription>
            </DialogHeader>
            {chartQuery.isLoading ? (
              <div className="grid min-h-32 place-items-center rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Loading change history.
                </span>
              </div>
            ) : changeHistory.length ? (
              <div className="max-h-[65vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>date</TableHead>
                      <TableHead>work_type</TableHead>
                      <TableHead>desc</TableHead>
                      <TableHead className="w-20 text-center">LINK</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {changeHistory.map((history, index) => {
                      const historyUrl = safeHistoryUrl(history.ctttmUrl)
                      return (
                        <TableRow key={`${history.dateMs}-${index}`}>
                          <TableCell className="font-mono text-xs">{history.date || "-"}</TableCell>
                          <TableCell>{history.workType || "-"}</TableCell>
                          <TableCell className="min-w-64 whitespace-normal break-words">
                            {history.description || "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            {historyUrl ? (
                              <Button type="button" variant="outline" size="sm" asChild>
                                <a href={historyUrl} target="_blank" rel="noreferrer">LINK</a>
                              </Button>
                            ) : (
                              <Button type="button" variant="outline" size="sm" disabled>LINK</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="grid min-h-32 place-items-center rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">
                {chartQuery.data?.historyError || "No change history to display."}
              </div>
            )}
            </DialogContent>
          </Dialog>
          {historyActionsEnabled ? (
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
          ) : null}
        </div>
      </footer>
    </article>
  )
})

export function FdcTrendPage() {
  const pageRef = useRef(null)
  const stepScrollPositionRef = useRef(0)
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const requestedFilters = useMemo(
    () => readSelfEquipmentUrlFilters(searchParams),
    [searchParams],
  )
  const [selectedLine, setSelectedLine] = useState(() => requestedFilters.line)
  const [selectedTeam, setSelectedTeam] = useState(() => requestedFilters.sdwts[0] ?? "")
  const [selectedGrades, setSelectedGrades] = useState(() => (
    resolveSelfEquipmentGrades(requestedFilters.grades, SENSOR_GRADES).length
      ? resolveSelfEquipmentGrades(requestedFilters.grades, SENSOR_GRADES)
      : ["A/B"]
  ))
  const [selectedDesc, setSelectedDesc] = useState(() => (
    requestedFilters.stepToken === ALL_STEPS ? ALL_STEPS : ""
  ))
  const [selectedEqpCh, setSelectedEqpCh] = useState(() => requestedFilters.eqpCh)
  const [selectedSensor, setSelectedSensor] = useState("")
  const [selectedChStep, setSelectedChStep] = useState("")
  const [chartPage, setChartPage] = useState(1)
  const [showThreeDayIdentity, setShowThreeDayIdentity] = useState(true)
  const [expandedChSteps, setExpandedChSteps] = useState({
    contextKey: "",
    eqps: EMPTY_EQP_SET,
    lastEqp: "",
  })
  const [queries, setQueries] = useState({
    line: "",
    team: "",
    grade: "",
    step: "",
    eqpCh: "",
    sensor: "",
    chStep: "",
  })
  const mappingQuery = useQuery({
    queryKey: ["l0-spider-line-mapping"],
    queryFn: fetchLineMapping,
  })
  const mappingReady = isLineMappingQueryReady(mappingQuery)
  const selfEquipmentFileConnectionState = getSelfEquipmentFileConnectionState(mappingQuery)
  const selfEquipmentFileReadEnabled = selfEquipmentFileConnectionState === "enabled"
  const dbConnectionsEnabled = areDbConnectionsEnabled(mappingQuery.data)
  const selfEquipmentDbEnabled = isSelfEquipmentDbEnabled(mappingQuery.data)
  const currentUserQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    enabled: Boolean(mappingReady && dbConnectionsEnabled),
    staleTime: Infinity,
    retry: false,
  })
  const lineMapping = mappingReady ? mappingQuery.data.line_mapping : EMPTY_MAPPING
  const sdwtMapping = mappingReady ? mappingQuery.data.sdwt_mapping : EMPTY_MAPPING
  const lines = useMemo(
    () => Array.from(new Set(Object.values(lineMapping))),
    [lineMapping],
  )
  const activeLine = lines.includes(selectedLine) ? selectedLine : (lines[0] ?? "")
  const teamOptions = useMemo(
    () => [
      ...Object.entries(lineMapping)
        .filter(([, line]) => line === activeLine)
        .map(([key]) => ({ key, label: sdwtMapping[key] ?? key })),
      ...(activeLine ? [{ key: SKIP_LIST_TEAM, label: SKIP_LIST_LABEL }] : []),
    ],
    [activeLine, lineMapping, sdwtMapping],
  )
  const resolvedSelectedTeam = resolveSelfEquipmentTeam(teamOptions, [selectedTeam])
  const activeTeam = resolvedSelectedTeam
    ? resolvedSelectedTeam
    : (teamOptions[0]?.key ?? "")
  const activeTeamLabel = teamOptions.find((team) => team.key === activeTeam)?.label ?? ""
  const isSkipList = activeTeam === SKIP_LIST_TEAM
  const priorities = useMemo(() => expandPriorities(selectedGrades), [selectedGrades])
  const dataQueryKey = [
    isSkipList ? "skip-list-data" : "self-equipment-data",
    activeLine,
    activeTeam,
    activeTeamLabel,
    priorities,
    selectedDesc,
    selectedEqpCh,
    selectedSensor,
    selectedChStep,
  ]
  const dataQuery = useQuery({
    queryKey: dataQueryKey,
    queryFn: () => isSkipList
      ? fetchSkipListData({
          lineId: activeLine,
          priorities,
          prcGroup: selectedDesc,
          eqpCh: selectedEqpCh,
          sensor: selectedSensor,
          chStep: selectedChStep,
        })
      : fetchSelfEquipmentData({
          line: activeLine,
          pathSdwt: activeTeam,
          sdwt: activeTeamLabel,
          priorities,
          prcGroup: selectedDesc,
          eqpCh: selectedEqpCh,
          sensor: selectedSensor,
          chStep: selectedChStep,
        }),
    enabled: Boolean(
      mappingReady
      && selfEquipmentFileReadEnabled
      && activeLine
      && activeTeam
      && activeTeamLabel
    ),
    placeholderData: (previousData, previousQuery) => {
      const previousKey = previousQuery?.queryKey ?? []
      const sameFiltersExceptChStep = JSON.stringify(previousKey.slice(0, -1))
        === JSON.stringify(dataQueryKey.slice(0, -1))
      return sameFiltersExceptChStep ? previousData : undefined
    },
  })
  const steps = dataQuery.data?.prcGroups ?? []
  const eqpChannels = dataQuery.data?.eqpChannels ?? []
  const sensors = dataQuery.data?.sensors ?? []
  const chSteps = dataQuery.data?.chSteps ?? []
  const activeDesc = dataQuery.data?.filters?.prcGroup ?? ""
  const activeEqpCh = dataQuery.data?.filters?.eqpCh ?? ""
  const activeSensor = dataQuery.data?.filters?.sensor ?? ""
  const activeChStep = dataQuery.data?.filters?.chStep ?? ""
  const gatherContextKey = [
    activeLine,
    activeTeam,
    activeDesc,
    activeEqpCh,
    activeSensor,
    activeChStep,
  ].join("\u0000")
  const expandedEqps = expandedChSteps.contextKey === gatherContextKey
    ? expandedChSteps.eqps
    : EMPTY_EQP_SET
  const passHistoryQuery = useQuery({
    queryKey: ["pass-history", activeLine],
    queryFn: () => fetchPassHistory({
      lineId: activeLine,
      sdwt: "",
      desc: "",
    }),
    enabled: Boolean(
      mappingReady
      && !isSkipList
      && activeLine
      && activeTeamLabel
      && activeDesc
    ),
    staleTime: 30 * 1000,
    retry: false,
  })
  const passHistoryByKey = useMemo(() => new Map(
    (passHistoryQuery.data?.records ?? EMPTY_LIST).map((record) => [
      buildRecordPassHistoryKey(record),
      record,
    ]),
  ), [passHistoryQuery.data?.records])
  const chStepIsSelected = Boolean(selectedChStep && activeChStep === selectedChStep)
  const dataRows = dataQuery.data?.rows
  const chartRows = useMemo(() => {
    if (!chStepIsSelected) return []
    return dataRows ?? []
  }, [chStepIsSelected, dataRows])
  const chartGroups = useMemo(() => {
    const groups = new Map()

    chartRows.forEach((row) => {
      const eqp = stripPngExtension(row.eqp) || "Unspecified EQP"
      const groupRows = groups.get(eqp) ?? []
      groupRows.push(row)
      groups.set(eqp, groupRows)
    })

    return Array.from(groups, ([eqp, rows]) => ({ eqp, rows }))
      .sort((left, right) => left.eqp.localeCompare(right.eqp, "ko", { numeric: true }))
  }, [chartRows])
  const visibleChartGroups = useMemo(() => chartGroups.map((group) => {
    const gathered = !expandedEqps.has(group.eqp)
    const visibleRows = gathered ? getLowestChStepRowsByPpid(group.rows) : group.rows
    return {
      ...group,
      gathered,
      visibleRows,
      chartsPerRow: gathered && showThreeDayIdentity ? 2 : 1,
      animate: expandedChSteps.contextKey === gatherContextKey
        && expandedChSteps.lastEqp === group.eqp,
    }
  }), [
    chartGroups,
    expandedChSteps.contextKey,
    expandedChSteps.lastEqp,
    expandedEqps,
    gatherContextKey,
    showThreeDayIdentity,
  ])
  const chartPagination = useMemo(
    () => paginateChartGroups(visibleChartGroups, chartPage),
    [chartPage, visibleChartGroups],
  )
  const pageChartGroups = chartPagination.pageGroups
  const activeChartPage = chartPagination.page
  const chartPageCount = chartPagination.totalPages

  useEffect(() => {
    setChartPage(1)
  }, [gatherContextKey])

  useEffect(() => {
    if (chartPage !== activeChartPage) setChartPage(activeChartPage)
  }, [activeChartPage, chartPage])
  const allSkipLoadTargetsByEqp = useMemo(() => {
    if (isSkipList) return new Map()
    return new Map(chartGroups.map((group) => [group.eqp, async (sensor) => {
      return fetchEqpAllSkipTargets({
        line: activeLine,
        pathSdwt: activeTeam,
        sdwt: activeTeamLabel,
        priorities,
        prcGroup: activeDesc,
        eqpCh: group.rows[0]?.eqp ?? group.eqp,
        sensor,
      })
    }]))
  }, [
    activeDesc,
    activeLine,
    activeTeam,
    activeTeamLabel,
    chartGroups,
    isSkipList,
    priorities,
  ])

  const filteredLines = filterItems(
    lines.map((line) => ({ value: line, label: formatLineDisplayName(line) })),
    queries.line,
  )
  const filteredTeams = filterItems(
    teamOptions.map((team) => ({ value: team.key, label: team.label })),
    queries.team,
  )
  const gradeOptions = useMemo(() => {
    if (!isSkipList) return SENSOR_GRADES
    return Array.from(new Set(
      (dataQuery.data?.availablePriorities ?? EMPTY_LIST)
        .map((priority) => (["A", "B"].includes(priority) ? "A/B" : priority)),
    )).filter((grade) => SENSOR_GRADES.includes(grade))
  }, [dataQuery.data?.availablePriorities, isSkipList])
  const filteredGrades = filterItems(
    gradeOptions.map((grade) => ({ value: grade, label: grade })),
    queries.grade,
  )
  const filteredSteps = filterItems(
    steps.map((item) => ({
      value: item.prcGroup,
      label: item.prcGroup,
      meta: `${item.rowCount.toLocaleString()} rows · ${item.equipmentCount.toLocaleString()} eqp`,
    })),
    queries.step,
  )
  const filteredEqpChannels = filterItems(
    eqpChannels.length ? [
      {
        value: ALL_EQP_CHANNELS,
        label: "ALL",
        meta: `${eqpChannels.reduce((total, item) => total + item.rowCount, 0).toLocaleString()} rows`,
      },
      ...eqpChannels.map((item) => ({
        value: item.eqpCh,
        label: stripPngExtension(item.eqpCh),
        meta: `${item.rowCount.toLocaleString()} rows`,
      })),
    ] : [],
    queries.eqpCh,
  )
  const filteredSensors = filterItems(
    sensors.length ? [
      {
        value: ALL_SENSORS,
        label: "ALL",
        meta: `${sensors.reduce((total, item) => total + item.rowCount, 0).toLocaleString()} rows`,
      },
      ...sensors.map((item) => ({
        value: item.sensor,
        label: item.sensor,
        meta: `${item.rowCount.toLocaleString()} rows`,
      })),
    ] : [],
    queries.sensor,
  )
  const filteredChSteps = filterItems(
    chSteps.length ? [
      {
        value: ALL_CH_STEPS,
        label: "ALL",
        meta: `${chSteps.reduce((total, item) => total + item.rowCount, 0).toLocaleString()} rows`,
      },
      ...(selectedSensor === ALL_SENSORS ? [] : chSteps.map((item) => ({
        value: item.step,
        label: item.step.split("@")[0],
        meta: `${item.rowCount.toLocaleString()} rows · ${item.equipmentCount.toLocaleString()} eqp`,
      }))),
    ] : [],
    queries.chStep,
  )

  const setQuery = (key, value) => setQueries((current) => ({ ...current, [key]: value }))

  const resetStepAndSensor = () => {
    setSelectedDesc("")
    setSelectedEqpCh("")
    setSelectedSensor("")
    setSelectedChStep("")
    setQueries((current) => ({ ...current, step: "", eqpCh: "", sensor: "", chStep: "" }))
  }
  const handleLineChange = (line) => {
    setSelectedLine(line)
    setSelectedTeam("")
    setQueries((current) => ({ ...current, team: "", step: "", eqpCh: "", sensor: "", chStep: "" }))
    resetStepAndSensor()
  }
  const handleTeamChange = (team) => {
    setSelectedTeam(team)
    resetStepAndSensor()
  }
  const toggleGrade = (grade) => {
    setSelectedGrades((current) => (
      current.includes(grade)
        ? current.filter((item) => item !== grade)
        : gradeOptions.filter((item) => [...current, grade].includes(item))
    ))
    resetStepAndSensor()
  }
  const handleChStepChange = async (chStep) => {
    if (selectedSensor === ALL_SENSORS && chStep !== ALL_CH_STEPS) return
    const nextChStep = selectedChStep === chStep ? "" : chStep
    const clickedAt = new Date().toISOString()
    setSelectedChStep(nextChStep)
    if (!nextChStep || isSkipList) return

    try {
      const queryKey = [
        "self-equipment-data",
        activeLine,
        activeTeam,
        activeTeamLabel,
        priorities,
        selectedDesc,
        selectedEqpCh,
        selectedSensor,
        nextChStep,
      ]
      const payload = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => fetchSelfEquipmentData({
          line: activeLine,
          pathSdwt: activeTeam,
          sdwt: activeTeamLabel,
          priorities,
          prcGroup: selectedDesc,
          eqpCh: selectedEqpCh,
          sensor: selectedSensor,
          chStep: nextChStep,
        }),
      })
      const filePaths = getSelfEquipmentHistoryFilePaths(payload.rows)
      if (!filePaths.length) {
        throw new Error("No file_path is available for click history.")
      }
      await createClickedCategoryHistory({
        app: "self",
        lineId: activeLine,
        filePaths,
        grades: payload.filters?.priorities ?? priorities,
        selectedSdwt: payload.filters?.sdwt || activeTeamLabel,
        selectedSensor: payload.filters?.sensor || selectedSensor,
        clickedAt,
      })
    } catch (error) {
      toast.error(`Failed to save click history: ${error.message}`)
    }
  }
  const toggleGatheredChSteps = (eqp) => {
    setExpandedChSteps((current) => {
      const nextEqps = new Set(current.contextKey === gatherContextKey ? current.eqps : EMPTY_EQP_SET)
      if (nextEqps.has(eqp)) nextEqps.delete(eqp)
      else nextEqps.add(eqp)
      return { contextKey: gatherContextKey, eqps: nextEqps, lastEqp: eqp }
    })
  }

  return (
    <div ref={pageRef} className="relative flex h-full min-h-0 min-w-0 flex-col overflow-y-auto bg-muted/30">
      <header className="shrink-0 border-b bg-card px-6 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">Equipment Anomaly Detection</h1>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select a line, team, sensor grade, PRC_Group, eqp_ch, sensor, and ch_step to view ERD results.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="text-sm font-medium text-foreground" aria-live="polite">
              {currentUserQuery.data?.knoxId
                ? `Client IP: ${currentUserQuery.data.knoxId}`
                : !dbConnectionsEnabled
                ? "DB features are not connected."
                : currentUserQuery.isLoading
                ? "Checking client IP…"
                : "Unable to determine client IP."}
            </p>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/">
                <ArrowLeft className="size-4" aria-hidden="true" />
                SPIDER Home
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="shrink-0 border-b bg-card px-6 py-3">
        <div className="flex justify-start">
          <button
            type="button"
            className="group inline-flex items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            role="switch"
            aria-checked={showThreeDayIdentity}
            onClick={() => setShowThreeDayIdentity((current) => !current)}
          >
            <span className={cn(
              "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ease-in-out",
              showThreeDayIdentity
                ? "border-primary bg-primary"
                : "border-input bg-muted-foreground/35",
            )}>
              <span className={cn(
                "absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out",
                showThreeDayIdentity && "translate-x-5",
              )} />
            </span>
            <span>
              <span className="block text-sm font-medium text-foreground">Show 3-Day Similarity Chart</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                In grouped ch_step view, show the last 72 hours similarity chart to the right.
              </span>
            </span>
            <span className="sr-only">{showThreeDayIdentity ? "On" : "Off"}</span>
          </button>
        </div>
      </section>

      <section className="shrink-0 border-b bg-card">
        <ResizableFilterArea defaultHeight={332} minHeight={160} maxHeight={720}>
          <div className="h-full overflow-x-auto px-6 py-2">
            <div className="grid h-full min-w-[1640px] grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,.8fr)_minmax(0,1.45fr)_minmax(0,1.15fr)_minmax(0,1.2fr)_minmax(0,1.05fr)] gap-4">
            <FilterCard
              title="Line Name"
              badge={lines.length ? `${lines.length}` : null}
              disabled={lines.length === 0}
              placeholder="No lines are available."
              isActive={Boolean(activeLine)}
              isLoading={mappingQuery.isFetching && lines.length === 0}
              query={queries.line}
              onQueryChange={(value) => setQuery("line", value)}
            >
              {filteredLines.map((item) => (
                <SelectRow
                  key={item.value}
                  label={item.label}
                  selected={activeLine === item.value}
                  onClick={() => handleLineChange(item.value)}
                />
              ))}
            </FilterCard>
            <FilterCard
              title="SDWT"
              badge={teamOptions.length ? `${teamOptions.length}` : null}
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
                  onClick={() => handleTeamChange(item.value)}
                />
              ))}
            </FilterCard>
            <FilterCard
              title="Sensor Grade"
              badge={`${gradeOptions.length}`}
              disabled={!activeTeam}
              placeholder={!activeTeam
                ? "Select SDWT first"
                : dataQuery.isLoading
                ? "Loading…"
                : isSkipList
                ? "No skipped charts are available."
                : "No Sensor Grades are available."}
              isActive={selectedGrades.length > 0}
              query={queries.grade}
              onQueryChange={(value) => setQuery("grade", value)}
            >
              {filteredGrades.map((item) => (
                <SelectRow
                  key={item.value}
                  label={item.label}
                  selected={selectedGrades.includes(item.value)}
                  multiple
                  onClick={() => toggleGrade(item.value)}
                />
              ))}
            </FilterCard>
            <FilterCard
              title="PRC_Group"
              badge={steps.length ? `${steps.length}` : null}
              disabled={!activeTeam || dataQuery.isLoading}
              placeholder={dataQuery.isLoading
                ? "Loading…"
                : "No PRC_Group matches the selected filters."}
              isActive={Boolean(activeDesc)}
              isLoading={dataQuery.isFetching && !selectedDesc}
              query={queries.step}
              onQueryChange={(value) => setQuery("step", value)}
              scrollPositionRef={stepScrollPositionRef}
            >
              {filteredSteps.map((item) => (
                <SelectRow
                  key={item.value}
                  label={item.label}
                  meta={item.meta}
                  selected={activeDesc === item.value}
                  onClick={() => {
                    setSelectedDesc(activeDesc === item.value ? "" : item.value)
                    setSelectedEqpCh("")
                    setSelectedSensor("")
                    setSelectedChStep("")
                    setQuery("eqpCh", "")
                    setQuery("sensor", "")
                    setQuery("chStep", "")
                  }}
                />
              ))}
            </FilterCard>
            <FilterCard
              title="eqp_ch"
              badge={eqpChannels.length ? `${eqpChannels.length}` : null}
              disabled={!activeDesc || dataQuery.isLoading}
              placeholder={activeDesc
                ? "No eqp_ch matches the selected PRC_Group."
                : "Select PRC_Group first"}
              isActive={Boolean(activeEqpCh)}
              isLoading={dataQuery.isFetching && Boolean(activeDesc) && !selectedEqpCh}
              query={queries.eqpCh}
              onQueryChange={(value) => setQuery("eqpCh", value)}
            >
              {filteredEqpChannels.map((item) => (
                <SelectRow
                  key={item.value}
                  label={item.label}
                  meta={item.meta}
                  selected={activeEqpCh === item.value}
                  onClick={() => {
                    setSelectedEqpCh((current) => current === item.value ? "" : item.value)
                    setSelectedSensor("")
                    setSelectedChStep("")
                    setQuery("sensor", "")
                    setQuery("chStep", "")
                  }}
                />
              ))}
            </FilterCard>
            <FilterCard
              title="sensor"
              badge={sensors.length ? `${sensors.length}` : null}
              disabled={!selectedEqpCh || dataQuery.isLoading}
              placeholder={selectedEqpCh ? "No sensor matches the selected eqp_ch." : "Select eqp_ch first"}
              isActive={Boolean(activeSensor)}
              isLoading={dataQuery.isFetching && Boolean(selectedEqpCh)}
              query={queries.sensor}
              onQueryChange={(value) => setQuery("sensor", value)}
            >
              {filteredSensors.map((item) => (
                <SelectRow
                  key={item.value}
                  label={item.label}
                  meta={item.meta}
                  selected={activeSensor === item.value}
                  onClick={() => {
                    setSelectedSensor((current) => current === item.value ? "" : item.value)
                    setSelectedChStep("")
                    setQuery("chStep", "")
                  }}
                />
              ))}
            </FilterCard>
            <FilterCard
              title="ch_step"
              badge={chSteps.length ? `${chSteps.length}` : null}
              disabled={!selectedSensor || dataQuery.isLoading}
              placeholder={selectedSensor ? "No ch_step matches the selected sensor." : "Select sensor first"}
              isActive={Boolean(activeChStep)}
              isLoading={dataQuery.isFetching && Boolean(selectedSensor)}
              query={queries.chStep}
              onQueryChange={(value) => setQuery("chStep", value)}
            >
              {filteredChSteps.map((item) => (
                <SelectRow
                  key={item.value}
                  label={item.label}
                  meta={item.meta}
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
        {selfEquipmentFileReadEnabled && !selfEquipmentDbEnabled ? (
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-800 dark:text-sky-200">
            The server reports that DB capability is disabled. SKIP, click history, and save-history requests
            may be rejected by the server DB gate.
          </div>
        ) : null}
        {dataQuery.isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {dataQuery.error.message}
          </div>
        ) : null}
        {!isSkipList && passHistoryQuery.isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Unable to load PASS history: {passHistoryQuery.error.message}
          </div>
        ) : null}

        <section className="grid min-w-0 gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Scatter chart</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Select ch_step to display act_time and the actual sensor/ch_step values from the latest ERD anomaly data.
              </p>
            </div>
            {chStepIsSelected ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{chartGroups.length.toLocaleString()} EQP categories</Badge>
                <Badge variant="outline">{chartRows.length.toLocaleString()} charts</Badge>
              </div>
            ) : null}
          </div>
          {chStepIsSelected && chartPageCount > 1 ? (
            <nav
              className="flex flex-wrap items-center justify-center gap-1 rounded-lg border bg-card px-3 py-2"
              aria-label="Chart pages"
            >
              {Array.from({ length: chartPageCount }, (_, index) => {
                const page = index + 1
                return (
                  <Button
                    key={page}
                    type="button"
                    variant={activeChartPage === page ? "default" : "outline"}
                    size="sm"
                    className="size-8 p-0"
                    aria-label={`Page ${page}`}
                    aria-current={activeChartPage === page ? "page" : undefined}
                    onClick={() => setChartPage(page)}
                  >
                    {page}
                  </Button>
                )
              })}
            </nav>
          ) : null}
          {!chStepIsSelected ? (
            <div className="grid min-h-52 place-items-center rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
              Select PRC_Group, eqp_ch, sensor, and ch_step to display the scatter chart.
            </div>
          ) : chartGroups.length ? (
            <div className="grid min-w-0 gap-5">
              {pageChartGroups.map((group) => (
                <section key={group.eqp} className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
                  <header className="flex items-center justify-between gap-3 border-b bg-muted/60 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge>EQP</Badge>
                      <h3 className="truncate text-sm font-semibold">{group.eqp}</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 px-2.5 text-xs"
                        aria-pressed={group.gathered}
                        onClick={() => toggleGatheredChSteps(group.eqp)}
                      >
                        {group.gathered ? "Show All ch_steps" : "Group ch_steps"}
                      </Button>
                    </div>
                    <Badge variant="secondary">
                      {group.visibleRows.length.toLocaleString()}
                      {group.totalVisibleRows !== group.visibleRows.length
                        ? ` / ${group.totalVisibleRows.toLocaleString()}`
                        : group.gathered
                        ? ` / ${group.rows.length.toLocaleString()}`
                        : ""} charts
                    </Badge>
                  </header>
                  <div
                    className={cn(
                      "grid min-w-0 grid-cols-1 gap-4 p-4 lg:grid-cols-2",
                      !group.gathered && "xl:grid-cols-3",
                      group.animate && (group.gathered ? "animate-ch-step-gather" : "animate-ch-step-expand"),
                    )}
                  >
                    {group.visibleRows.map((row) => (
                        <Fragment key={row.id}>
                          <div className="min-w-0">
                            <ErdScatterCard
                              row={row}
                              lineId={activeLine}
                              passRecord={isSkipList
                                ? row.pass_history
                                : passHistoryByKey.get(buildChartPassHistoryKey(activeLine, row))}
                              allSkipLoadTargets={allSkipLoadTargetsByEqp.get(group.eqp) ?? null}
                              dataQueryKeyPrefix="self-equipment-data"
                            />
                          </div>
                          {group.gathered && showThreeDayIdentity ? (
                            <ThreeDayIdentityChartCard row={row} eqp={group.eqp} />
                          ) : null}
                        </Fragment>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid min-h-52 place-items-center rounded-lg border bg-card text-sm text-muted-foreground">
              {dataQuery.isLoading ? "Loading data." : "No file_path data to display."}
            </div>
          )}
        </section>
      </main>

      <Button
        type="button"
        size="icon"
        className="fixed bottom-6 right-6 z-40 rounded-full shadow-lg"
        aria-label="Back to top"
        onClick={() => pageRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <ArrowUp className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}

function filterItems(items, query) {
  const normalizedQuery = query.trim().toLowerCase()
  return normalizedQuery
    ? items.filter((item) => item.label.toLowerCase().includes(normalizedQuery))
    : items
}
