import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Loader2,
  MessageSquareText,
  Save,
  Search,
  Settings2,
  Trash2,
  UserRound,
  X,
} from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { fetchLineMapping } from "../api/mappingConfigApi"
import { areDbConnectionsEnabled, getSelfEquipmentFileConnectionState, isLineMappingQueryReady } from "../api/mappingContract.mjs"
import { fetchCurrentUser } from "../api/currentUserApi"
import { ResizableFilterArea } from "../components/ResizableFilterArea"
import {
  createMyEqpRegistration,
  deleteMyEqpRegistration,
  fetchMyEqpRegistrations,
} from "../api/myEqpRegistrationApi"
import { fetchMyEqpReference } from "../api/myEqpReferenceApi"
import { formatLineDisplayName } from "../utils/lineDisplay.mjs"
import { filterMyEqpReferenceRowsBySdwt } from "../utils/myEqpReferenceMatching.mjs"

const EMPTY_MAPPING = Object.freeze({})
const EMPTY_LIST = Object.freeze([])
const ALL_EQP = "ALL"
const MAX_COMMENT_LENGTH = 90
const KNOX_ID_PATTERN = /^[A-Za-z0-9._-]+$/
function matchesQuery(value, query) {
  return String(value).toLocaleLowerCase("ko").includes(query.trim().toLocaleLowerCase("ko"))
}

function normalizeKnoxId(value) {
  const text = String(value ?? "").trim()
  return text.includes("@") ? text.slice(0, text.indexOf("@")) : text
}

function FilterPanel({
  step,
  title,
  description,
  options,
  selectedValue,
  selectedValues = EMPTY_LIST,
  multiple = false,
  onSelect,
  isOptionDisabled,
  query,
  onQueryChange,
  disabled = false,
  isLoading = false,
  emptyMessage,
}) {
  const hasSelection = multiple ? selectedValues.length > 0 : Boolean(selectedValue)

  return (
    <Card className={cn(
      "h-full min-h-[300px] gap-0 overflow-hidden rounded-[18px] border-[#e0e0e0] bg-white py-0",
      hasSelection && "ring-2 ring-[#0071e3]",
    )}>
      <CardHeader className={cn(
        "gap-1 border-b border-[#e0e0e0] px-4 py-4",
        hasSelection ? "bg-[#f5f5f7]" : "bg-[#fafafc]",
      )}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
              hasSelection ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}>
              {step}
            </span>
            <CardTitle className="truncate text-sm">{title}</CardTitle>
          </div>
          {isLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
          ) : (
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {multiple && selectedValues.length ? `${selectedValues.length} selected` : options.length}
            </Badge>
          )}
        </div>
        <CardDescription className="pl-8 text-xs leading-5">{description}</CardDescription>
      </CardHeader>
      <div className="border-b border-[#e0e0e0] bg-white px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={`${title} search`}
            className="h-8 rounded-full border-[#e0e0e0] bg-white pl-8 text-xs"
            disabled={disabled}
            aria-label={`${title} search`}
          />
        </div>
      </div>
      <CardContent className="min-h-0 flex-1 overflow-y-auto bg-white p-2.5">
        {disabled || options.length === 0 ? (
          <div className="grid min-h-32 place-items-center px-5 text-center text-xs leading-5 text-muted-foreground">
            {isLoading ? "Loading reference data…" : emptyMessage}
          </div>
        ) : (
          <div className="grid gap-1.5">
            {options.map((option) => {
              const selected = multiple
                ? selectedValues.includes(option.value)
                : selectedValue === option.value
              const optionDisabled = isOptionDisabled?.(option) ?? false
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSelect(option.value)}
                  disabled={optionDisabled}
                  className={cn(
                    "flex min-h-9 w-full items-center gap-2 rounded-full border border-transparent px-3 py-2 text-left text-xs transition",
                    "hover:border-[#d2d2d7] hover:bg-[#f5f5f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] disabled:cursor-not-allowed disabled:opacity-40",
                    selected && "border-[#0071e3] bg-white text-[#0066cc] ring-1 ring-[#0071e3]",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-medium" title={option.label}>
                    {option.label}
                  </span>
                  {option.meta ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{option.meta}</span>
                  ) : null}
                  {multiple ? (
                    <span className={cn(
                      "grid size-4 shrink-0 place-items-center rounded border",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                    )}>
                      <Check className={cn("size-3", !selected && "text-transparent")} aria-hidden="true" />
                    </span>
                  ) : selected ? (
                    <Check className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SelectionItem({ label, value, complete }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <span className={cn(
          "size-1.5 shrink-0 rounded-full",
          complete ? "bg-primary" : "bg-muted-foreground/40",
        )} />
        <p className={cn(
          "truncate text-sm font-semibold",
          complete ? "text-foreground" : "text-muted-foreground",
        )} title={value}>
          {value || "Not selected"}
        </p>
      </div>
    </div>
  )
}

function RegisteredMyEqpSection({ activeLine, registrationsQuery, onDelete }) {
  return (
    <section className="grid gap-3" aria-labelledby="registered-my-eqp-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="registered-my-eqp-title" className="text-base font-semibold">Registered MY EQP conditions</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatLineDisplayName(activeLine)} · <span>Conditions assigned to you or previously made public.</span>
          </p>
        </div>
        <Badge variant="secondary">
          {(registrationsQuery.data?.length ?? 0).toLocaleString()}
        </Badge>
      </div>

      {registrationsQuery.isLoading ? (
        <Card className="grid min-h-32 place-items-center py-6 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-label="Loading registrations" />
        </Card>
      ) : registrationsQuery.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Registration lookup error: {registrationsQuery.error.message}
        </div>
      ) : registrationsQuery.data?.length ? (
        <div className="grid gap-3">
          {registrationsQuery.data.map((registration) => (
            <Card key={registration.id} className="gap-4 py-5">
              <CardHeader className="gap-3 px-5 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={registration.active ? "default" : "secondary"}>
                      {registration.active ? "Monitoring" : "Expired"}
                    </Badge>
                    <Badge variant="outline">
                      {registration.isPublic ? "Previously public" : "Designated users"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      <span>Registered at</span> {registration.execDate} · <span>Expires at</span> {registration.expiresAt || "-"}
                    </span>
                  </div>
                  {registration.ownedByCurrentUser ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => onDelete(registration)}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      Delete
                    </Button>
                  ) : (
                    <Badge variant="secondary">Public registration by another user</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 px-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
                <SelectionItem label="Line Name" value={formatLineDisplayName(registration.line)} complete />
                <SelectionItem label="SDWT" value={registration.sdwt} complete />
                <SelectionItem label="PRC Group" value={registration.prcGroup} complete />
                <SelectionItem label="EQP" value={registration.eqps.join(", ")} complete />
              </CardContent>
              <div className="grid gap-2 border-t px-5 pt-4 text-xs sm:grid-cols-[auto_minmax(0,1fr)] sm:px-6">
                <span className="font-medium text-foreground"><span>Monitoring period</span> {registration.periode} <span>days</span></span>
                <span className="break-words text-muted-foreground sm:text-right">
                  Comment: {registration.comment || "-"}
                </span>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="grid min-h-32 place-items-center px-5 py-6 text-center text-sm text-muted-foreground">
          No MY EQP conditions are available for this Line.
        </Card>
      )}
    </section>
  )
}

export function MyEqpRegistrationPage({ embedded = false }) {
  const queryClient = useQueryClient()
  const initializedKnoxId = useRef(false)
  const [selectedLine, setSelectedLine] = useState("")
  const [selectedSdwt, setSelectedSdwt] = useState("")
  const [selectedPrcGroup, setSelectedPrcGroup] = useState("")
  const [selectedEqps, setSelectedEqps] = useState([])
  const [monitoringDays, setMonitoringDays] = useState("")
  const [comment, setComment] = useState("")
  const [recipientKnoxInput, setRecipientKnoxInput] = useState("")
  const [recipientKnoxIds, setRecipientKnoxIds] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [queries, setQueries] = useState({ line: "", sdwt: "", prcGroup: "", eqp: "" })

  const currentUserQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  useEffect(() => {
    const currentKnoxId = normalizeKnoxId(currentUserQuery.data?.knoxId)
    if (!currentKnoxId || initializedKnoxId.current) return
    initializedKnoxId.current = true
    setRecipientKnoxIds([currentKnoxId])
  }, [currentUserQuery.data?.knoxId])

  const mappingQuery = useQuery({
    queryKey: ["l0-spider-line-mapping"],
    queryFn: fetchLineMapping,
  })
  const mappingReady = isLineMappingQueryReady(mappingQuery)
  const referenceQuery = useQuery({
    queryKey: ["my-eqp-reference"],
    queryFn: fetchMyEqpReference,
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: mappingReady && getSelfEquipmentFileConnectionState(mappingQuery) === "enabled",
  })
  const registrationMutation = useMutation({
    mutationFn: createMyEqpRegistration,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["my-eqp-registrations"] })
      queryClient.invalidateQueries({ queryKey: ["my-eqp-equipment-data"] })
      toast.success("MY EQP conditions saved.", {
        description: `${result.requestedRows?.toLocaleString() ?? 0} rows`,
      })
    },
    onError: (error) => toast.error(error.message),
  })

  const lineMapping = mappingReady ? mappingQuery.data.line_mapping : EMPTY_MAPPING
  const sdwtMapping = mappingReady ? mappingQuery.data.sdwt_mapping : EMPTY_MAPPING
  const lines = useMemo(
    () => Array.from(new Set(Object.values(lineMapping))).sort((left, right) => (
      left.localeCompare(right, "ko", { numeric: true })
    )),
    [lineMapping],
  )
  const activeLine = lines.includes(selectedLine) ? selectedLine : (lines[0] ?? "")
  const registrationsQuery = useQuery({
    queryKey: ["my-eqp-registrations", activeLine, false],
    queryFn: () => fetchMyEqpRegistrations({ line: activeLine }),
    enabled: Boolean(mappingReady && areDbConnectionsEnabled(mappingQuery.data) && activeLine),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    retry: false,
  })
  const deleteMutation = useMutation({
    mutationFn: deleteMyEqpRegistration,
    onSuccess: (result) => {
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ["my-eqp-registrations"] })
      queryClient.invalidateQueries({ queryKey: ["my-eqp-equipment-data"] })
      toast.success("MY EQP conditions deleted.", { description: `${result.affectedRows?.toLocaleString() ?? 0} rows` })
    },
    onError: (error) => toast.error(error.message),
  })
  const sdwtOptions = useMemo(() => Object.entries(lineMapping)
    .filter(([, line]) => line === activeLine)
    .map(([value]) => ({ value, label: sdwtMapping[value] ?? value }))
    .sort((left, right) => left.label.localeCompare(right.label, "ko", { numeric: true })),
  [activeLine, lineMapping, sdwtMapping])
  const activeSdwt = sdwtOptions.some((option) => option.value === selectedSdwt)
    ? selectedSdwt
    : (sdwtOptions[0]?.value ?? "")
  const activeSdwtLabel = sdwtOptions.find((option) => option.value === activeSdwt)?.label ?? ""

  const sdwtReferenceRows = useMemo(() => filterMyEqpReferenceRowsBySdwt(
    referenceQuery.data,
    [activeSdwtLabel, activeSdwt],
  ), [activeSdwt, activeSdwtLabel, referenceQuery.data])
  const prcGroups = useMemo(() => Array.from(new Set(
    sdwtReferenceRows.map((row) => row.prc_group).filter(Boolean),
  )).sort((left, right) => left.localeCompare(right, "ko", { numeric: true })), [sdwtReferenceRows])
  const activePrcGroup = prcGroups.includes(selectedPrcGroup) ? selectedPrcGroup : ""
  const eqpRows = useMemo(() => {
    const seen = new Set()
    return sdwtReferenceRows
      .filter((row) => row.prc_group === activePrcGroup)
      .map((row) => ({ ...row, label: `${row.main}_${row.disp_name}` }))
      .filter((row) => {
        if (seen.has(row.label)) return false
        seen.add(row.label)
        return true
      })
      .sort((left, right) => left.label.localeCompare(right.label, "ko", { numeric: true }))
  }, [activePrcGroup, sdwtReferenceRows])
  const eqpValues = useMemo(() => new Set(eqpRows.map((row) => row.label)), [eqpRows])
  const activeEqps = useMemo(() => (
    selectedEqps.includes(ALL_EQP) && eqpRows.length > 0
      ? [ALL_EQP]
      : selectedEqps.filter((eqp) => eqpValues.has(eqp))
  ), [eqpRows.length, eqpValues, selectedEqps])

  const lineOptions = lines
    .map((line) => ({ value: line, label: formatLineDisplayName(line) }))
    .filter((option) => matchesQuery(option.label, queries.line))
  const visibleSdwtOptions = sdwtOptions.filter((option) => matchesQuery(option.label, queries.sdwt))
  const prcGroupOptions = prcGroups
    .map((group) => ({ value: group, label: group }))
    .filter((option) => matchesQuery(option.label, queries.prcGroup))
  const eqpOptions = (eqpRows.length ? [
    { value: ALL_EQP, label: "ALL", meta: `${eqpRows.length.toLocaleString()} EQPs` },
    ...eqpRows.map((row) => ({ value: row.label, label: row.label })),
  ] : []).filter((option) => matchesQuery(option.label, queries.eqp))

  const selectedEqpLabel = activeEqps.includes(ALL_EQP)
    ? `ALL (${eqpRows.length.toLocaleString()} EQPs)`
    : activeEqps.join(", ")
  const parsedMonitoringDays = Number(monitoringDays)
  const hasValidMonitoringDays = Number.isInteger(parsedMonitoringDays) && parsedMonitoringDays > 0
  const isReadyToSave = Boolean(
    mappingReady
      && areDbConnectionsEnabled(mappingQuery.data)
      && currentUserQuery.data?.knoxId
      && !referenceQuery.isError
      && activeLine
      && activeSdwt
      && activePrcGroup
      && activeEqps.length > 0
      && hasValidMonitoringDays
      && recipientKnoxIds.length > 0,
  )

  const changeQuery = (key, value) => {
    setQueries((current) => ({ ...current, [key]: value }))
  }

  const handleLineChange = (line) => {
    setSelectedLine(line)
    setSelectedSdwt("")
    setSelectedPrcGroup("")
    setSelectedEqps([])
    setQueries((current) => ({ ...current, sdwt: "", prcGroup: "", eqp: "" }))
  }

  const handleSdwtChange = (sdwt) => {
    setSelectedSdwt(sdwt)
    setSelectedPrcGroup("")
    setSelectedEqps([])
    setQueries((current) => ({ ...current, prcGroup: "", eqp: "" }))
  }

  const handlePrcGroupChange = (prcGroup) => {
    setSelectedPrcGroup(prcGroup)
    setSelectedEqps([])
    setQueries((current) => ({ ...current, eqp: "" }))
  }

  const toggleEqp = (eqp) => {
    if (eqp === ALL_EQP) {
      setSelectedEqps((current) => current.includes(ALL_EQP) ? [] : [ALL_EQP])
      return
    }

    setSelectedEqps((current) => (
      current.includes(eqp)
        ? current.filter((item) => item !== eqp)
        : [...current.filter((item) => item !== ALL_EQP), eqp]
    ))
  }

  const addRecipientKnoxId = () => {
    const knoxId = normalizeKnoxId(recipientKnoxInput)
    if (!knoxId || knoxId.length > 128 || !KNOX_ID_PATTERN.test(knoxId)) {
      toast.error("Check the knox_id format.", {
        description: "Only letters, numbers, periods (.), underscores (_), and hyphens (-) are allowed.",
      })
      return
    }
    setRecipientKnoxIds((current) => current.includes(knoxId) ? current : [...current, knoxId])
    setRecipientKnoxInput("")
  }

  const removeRecipientKnoxId = (knoxId) => {
    setRecipientKnoxIds((current) => current.filter((value) => value !== knoxId))
  }

  const buildSavePayload = useCallback(() => {
    const eqps = activeEqps.includes(ALL_EQP)
      ? eqpRows.map((row) => row.label)
      : activeEqps
    return {
      line: activeLine,
      sdwt: activeSdwtLabel,
      prcGroup: activePrcGroup,
      eqps,
      periode: parsedMonitoringDays,
      comment,
      knoxIds: recipientKnoxIds,
    }
  }, [
    activeEqps,
    activeLine,
    activePrcGroup,
    activeSdwtLabel,
    comment,
    eqpRows,
    parsedMonitoringDays,
    recipientKnoxIds,
  ])

  const handleSave = () => {
    if (!isReadyToSave || registrationMutation.isPending) return
    registrationMutation.mutate(buildSavePayload())
  }

  return (
    <div className={cn(
      "min-w-0",
      !embedded && "flex h-full min-h-0 flex-col overflow-y-auto bg-muted/30",
    )}>
      {!embedded ? (
        <header className="shrink-0 border-b bg-card px-5 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Settings2 className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">MY EQP Registration</h1>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Register equipment and monitoring periods for Equipment-Level In-SPEC Anomaly Detection.
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to home
            </Link>
          </Button>
        </div>
        </header>
      ) : null}

      <main className={cn("w-full flex-1", embedded ? "py-1" : "px-4 py-5 sm:px-6 lg:px-8")}>
        <div className="mx-auto grid w-full max-w-[1680px] gap-5">
          <section aria-labelledby="filter-title">
            <div className="mb-3">
              <div>
                <h2 id="filter-title" className="text-base font-semibold">Select equipment reference data</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select from left to right to enable the next filter.
                </p>
              </div>
            </div>

            <ResizableFilterArea defaultHeight={324} minHeight={220} maxHeight={760}>
              <div className="h-full overflow-y-auto pb-1">
                <div className="grid min-h-full gap-4 md:grid-cols-2 md:auto-rows-[minmax(300px,1fr)] 2xl:h-full 2xl:grid-cols-4 2xl:grid-rows-1">
              <FilterPanel
                step="1"
                title="Line Name"
                description="Select a Line to monitor."
                options={lineOptions}
                selectedValue={activeLine}
                onSelect={handleLineChange}
                query={queries.line}
                onQueryChange={(value) => changeQuery("line", value)}
                disabled={mappingQuery.isLoading || lines.length === 0}
                isLoading={mappingQuery.isFetching}
                emptyMessage="No Lines are available."
              />
              <FilterPanel
                step="2"
                title="SDWT"
                description="Select an SDWT from the selected Line."
                options={visibleSdwtOptions}
                selectedValue={activeSdwt}
                onSelect={handleSdwtChange}
                query={queries.sdwt}
                onQueryChange={(value) => changeQuery("sdwt", value)}
                disabled={!activeLine}
                emptyMessage="Select Line Name first."
              />
              <FilterPanel
                step="3"
                title="PRC Group"
                description="Process groups linked to this SDWT."
                options={prcGroupOptions}
                selectedValue={activePrcGroup}
                onSelect={handlePrcGroupChange}
                query={queries.prcGroup}
                onQueryChange={(value) => changeQuery("prcGroup", value)}
                disabled={!activeSdwt || referenceQuery.isLoading}
                isLoading={referenceQuery.isFetching}
                emptyMessage={activeSdwt ? "No PRC Groups are available for this SDWT." : "Select SDWT first."}
              />
              <FilterPanel
                step="4"
                title="EQP"
                description="Select multiple EQPs, or select ALL alone."
                options={eqpOptions}
                selectedValues={activeEqps}
                multiple
                onSelect={toggleEqp}
                isOptionDisabled={(option) => activeEqps.includes(ALL_EQP) && option.value !== ALL_EQP}
                query={queries.eqp}
                onQueryChange={(value) => changeQuery("eqp", value)}
                disabled={!activePrcGroup || referenceQuery.isLoading}
                isLoading={referenceQuery.isFetching && Boolean(activePrcGroup)}
                emptyMessage={activePrcGroup ? "No EQPs are available for this PRC Group." : "Select PRC Group first."}
              />
                </div>
              </div>
            </ResizableFilterArea>

            {mappingQuery.isError || referenceQuery.isError ? (
              <div className="mt-3 grid gap-2">
                {mappingQuery.isError ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
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
                {referenceQuery.isError ? (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
                    Equipment reference lookup error: {referenceQuery.error.message}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <Card className="gap-4 py-5">
            <CardHeader className="gap-1 px-5 sm:px-6">
              <CardTitle className="text-base">Selected conditions</CardTitle>
              <CardDescription className="text-xs">MY EQP conditions to be saved.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 px-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
              <SelectionItem label="Line Name" value={formatLineDisplayName(activeLine)} complete={Boolean(activeLine)} />
              <SelectionItem label="SDWT" value={activeSdwtLabel} complete={Boolean(activeSdwt)} />
              <SelectionItem label="PRC Group" value={activePrcGroup} complete={Boolean(activePrcGroup)} />
              <SelectionItem label="EQP" value={selectedEqpLabel} complete={activeEqps.length > 0} />
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <CardContent className="grid p-0 lg:grid-cols-2">
              <section className="p-5 sm:p-6" aria-labelledby="monitoring-period-title">
                <div className="flex items-center gap-2">
                  <Clock3 className="size-4 text-primary" aria-hidden="true" />
                  <h2 id="monitoring-period-title" className="text-base font-semibold">Monitoring period</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter how many days this registration should remain active.
                </p>
                <label htmlFor="monitoring-days" className="mb-2 mt-5 block text-xs font-medium text-foreground">
                  Number of days
                </label>
                <div className="max-w-md">
                  <div className="relative">
                    <Input
                      id="monitoring-days"
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={monitoringDays}
                      onChange={(event) => setMonitoringDays(event.target.value)}
                      placeholder="Enter the monitoring period"
                      className="h-12 pr-14 text-base font-semibold"
                      aria-describedby="monitoring-days-help"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                      <span>days</span>
                    </span>
                  </div>
                  <p id="monitoring-days-help" className={cn(
                    "mt-2 text-xs",
                    monitoringDays && !hasValidMonitoringDays ? "text-destructive" : "text-muted-foreground",
                  )}>
                    {monitoringDays && !hasValidMonitoringDays
                      ? "Enter an integer of at least 1."
                      : "Enter a duration of at least one day."}
                  </p>
                </div>
              </section>
              <section
                className="border-t p-5 sm:p-6 lg:border-l lg:border-t-0"
                aria-labelledby="my-eqp-comment-title"
              >
                <div className="flex items-center gap-2">
                  <MessageSquareText className="size-4 text-primary" aria-hidden="true" />
                  <h2 id="my-eqp-comment-title" className="text-base font-semibold">Comment</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add notes about these MY EQP conditions.
                </p>
                <label htmlFor="my-eqp-comment" className="mb-2 mt-5 block text-xs font-medium text-foreground">
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                  id="my-eqp-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value.slice(0, MAX_COMMENT_LENGTH))}
                  maxLength={MAX_COMMENT_LENGTH}
                  placeholder="Enter the reason for selecting this equipment or monitoring notes."
                  className="min-h-24 resize-none text-sm leading-6"
                  aria-describedby="my-eqp-comment-count"
                />
                <p id="my-eqp-comment-count" className="mt-2 text-right text-xs tabular-nums text-muted-foreground">
                  {comment.length}/{MAX_COMMENT_LENGTH}
                </p>
              </section>
            </CardContent>
          </Card>

          <Card className="gap-4 py-5">
            <CardHeader className="gap-1 px-5 sm:px-6">
              <div className="flex items-center gap-2">
                <UserRound className="size-4 text-primary" aria-hidden="true" />
                <CardTitle className="text-base">Viewers and mail recipients</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Enter a knox_id and press Enter. MY EQP conditions are saved for each designated user.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 px-5 sm:px-6">
              <div className="max-w-2xl">
                <label htmlFor="my-eqp-recipient-knox-id" className="mb-2 block text-xs font-medium">
                  Enter knox_id
                </label>
                <Input
                  id="my-eqp-recipient-knox-id"
                  value={recipientKnoxInput}
                  onChange={(event) => setRecipientKnoxInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return
                    event.preventDefault()
                    addRecipientKnoxId()
                  }}
                  placeholder={currentUserQuery.isLoading ? "Checking current user…" : "Enter knox_id and press Enter"}
                  className="h-12 text-base font-semibold"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  You can designate multiple users. Each user can view these MY EQP conditions in Equipment-Level In-SPEC Anomaly Detection.
                </p>
              </div>

              {recipientKnoxIds.length ? (
                <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SelectionItem label="Line Name" value={formatLineDisplayName(activeLine)} complete={Boolean(activeLine)} />
                    <SelectionItem label="SDWT" value={activeSdwtLabel} complete={Boolean(activeSdwt)} />
                    <SelectionItem label="PRC Group" value={activePrcGroup} complete={Boolean(activePrcGroup)} />
                    <SelectionItem label="EQP" value={selectedEqpLabel} complete={activeEqps.length > 0} />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold text-foreground">
                      knox_id · {recipientKnoxIds.length.toLocaleString()}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {recipientKnoxIds.map((knoxId) => (
                        <Badge key={knoxId} variant="secondary" className="gap-1.5 py-1 pl-2.5 pr-1.5">
                          {knoxId}
                          <button
                            type="button"
                            className="grid size-5 place-items-center rounded-full hover:bg-background/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Remove ${knoxId}`}
                            onClick={() => removeRecipientKnoxId(knoxId)}
                          >
                            <X className="size-3" aria-hidden="true" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  Add at least one knox_id as a viewer and mail recipient.
                </div>
              )}
            </CardContent>
          </Card>

          <section className="flex flex-col items-stretch justify-between gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
            <div>
              <h2 className="text-sm font-semibold">Save conditions for the designated users.</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Complete all conditions, the monitoring period, and knox_ids to save.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button
                type="button"
                size="lg"
                className="h-12 min-w-52 rounded-xl text-base shadow-lg shadow-primary/15"
                disabled={!isReadyToSave || registrationMutation.isPending}
                onClick={handleSave}
              >
                {registrationMutation.isPending ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="size-5" aria-hidden="true" />
                )}
                {registrationMutation.isPending ? "Saving…" : "Save MY EQP"}
              </Button>
            </div>
          </section>

          <RegisteredMyEqpSection
            activeLine={activeLine}
            registrationsQuery={registrationsQuery}
            onDelete={setDeleteTarget}
          />
        </div>
      </main>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete MY EQP conditions?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.sdwt} · {deleteTarget?.prcGroup} · {deleteTarget?.eqps.length}
              <span>All EQPs in this registration will be deleted.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!mappingReady || !deleteTarget || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
