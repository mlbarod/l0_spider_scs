import { forwardRef, useImperativeHandle, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  Link2,
  Loader2,
  MailPlus,
  Search,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

import {
  createMailingRegistration,
  deleteMailingRegistrationLine,
  fetchMailingRegistrations,
} from "../api/mailingRegistrationApi"
import { fetchLineMapping } from "../api/mappingConfigApi"
import { isLineMappingQueryReady } from "../api/mappingContract.mjs"
import { ResizableFilterArea } from "../components/ResizableFilterArea"
import { formatLineDisplayName } from "../utils/lineDisplay.mjs"
import { expandMailingRegistrationRows } from "../utils/mailingRegistration.mjs"

const EMPTY_LIST = Object.freeze([])
const EMPTY_MAPPING = Object.freeze({})
const ALL_SDWT = "__ALL_SDWT__"
const MAILING_PRIORITIES = Object.freeze(["A", "B", "D", "M", "N"])
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
  query,
  onQueryChange,
  disabled = false,
  isLoading = false,
  emptyMessage,
}) {
  const hasSelection = multiple ? selectedValues.length > 0 : Boolean(selectedValue)

  return (
    <Card className={cn(
      "h-full min-h-[280px] gap-0 overflow-hidden py-0 transition-shadow",
      hasSelection && "border-primary/35 shadow-md shadow-primary/5",
    )}>
      <CardHeader className={cn(
        "gap-1 border-b px-4 py-4",
        hasSelection ? "bg-primary/5" : "bg-muted/30",
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
      <div className="border-b px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={`Search ${title}`}
            className="h-8 pl-8 text-xs"
            disabled={disabled}
            aria-label={`Search ${title}`}
          />
        </div>
      </div>
      <CardContent className="min-h-0 flex-1 overflow-y-auto bg-background/60 p-2.5">
        {disabled || options.length === 0 ? (
          <div className="grid min-h-32 place-items-center px-5 text-center text-xs leading-5 text-muted-foreground">
            {isLoading ? "Loading reference data." : emptyMessage}
          </div>
        ) : (
          <div className="grid gap-1.5">
            {options.map((option) => {
              const selected = multiple
                ? selectedValues.includes(option.value)
                : selectedValue === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSelect(option.value)}
                  className={cn(
                    "flex min-h-9 w-full items-center gap-2 rounded-md border border-transparent px-3 py-2 text-left text-xs transition",
                    "hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "border-primary/30 bg-primary/10 text-primary",
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

export const MailingRegistrationPage = forwardRef(function MailingRegistrationPage(
  { embedded = false },
  saveRef,
) {
  const queryClient = useQueryClient()
  const [selectedLine, setSelectedLine] = useState("")
  const [selectedSdwts, setSelectedSdwts] = useState([])
  const [recipientKnoxInput, setRecipientKnoxInput] = useState("")
  const [recipientKnoxIds, setRecipientKnoxIds] = useState([])
  const [lookupKnoxId, setLookupKnoxId] = useState("")
  const [lineQuery, setLineQuery] = useState("")
  const [sdwtQuery, setSdwtQuery] = useState("")
  const [urlTarget, setUrlTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const mappingQuery = useQuery({
    queryKey: ["l0-spider-line-mapping"],
    queryFn: fetchLineMapping,
    staleTime: 5 * 60 * 1000,
  })
  const mappingReady = isLineMappingQueryReady(mappingQuery)

  const lineMapping = mappingReady ? mappingQuery.data.line_mapping : EMPTY_MAPPING
  const sdwtMapping = mappingReady ? mappingQuery.data.sdwt_mapping : EMPTY_MAPPING
  const lines = useMemo(() => Array.from(new Set(Object.values(lineMapping)))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "ko", { numeric: true })), [lineMapping])
  const lineOptions = lines
    .map((line) => ({ value: line, label: formatLineDisplayName(line) }))
    .filter((option) => matchesQuery(option.label, lineQuery))
  const sdwtOptions = useMemo(() => {
    const labels = Object.entries(lineMapping)
      .filter(([, line]) => line === selectedLine)
      .map(([key]) => String(sdwtMapping[key] ?? key).trim())
      .filter(Boolean)
    return Array.from(new Set(labels))
      .sort((left, right) => left.localeCompare(right, "ko", { numeric: true }))
      .map((value) => ({ value, label: value }))
  }, [lineMapping, sdwtMapping, selectedLine])
  const visibleSdwtOptions = (sdwtOptions.length ? [
    { value: ALL_SDWT, label: "ALL", meta: `${sdwtOptions.length.toLocaleString()} items` },
    ...sdwtOptions,
  ] : []).filter((option) => matchesQuery(option.label, sdwtQuery))
  const validSdwtValues = useMemo(() => new Set(sdwtOptions.map((option) => option.value)), [sdwtOptions])
  const activeSdwts = selectedSdwts.includes(ALL_SDWT) && sdwtOptions.length
    ? [ALL_SDWT]
    : selectedSdwts.filter((sdwt) => validSdwtValues.has(sdwt))
  const resolvedSdwts = activeSdwts.includes(ALL_SDWT)
    ? sdwtOptions.map((option) => option.value)
    : activeSdwts
  const selectedSdwtLabel = activeSdwts.includes(ALL_SDWT)
    ? `ALL (${sdwtOptions.length.toLocaleString()} items)`
    : activeSdwts.join(", ")
  const validLookupKnoxId = lookupKnoxId.length <= 128 && KNOX_ID_PATTERN.test(lookupKnoxId)
    ? lookupKnoxId
    : ""

  const registrationsQuery = useQuery({
    queryKey: ["mailing-registrations", validLookupKnoxId],
    queryFn: () => fetchMailingRegistrations({ knoxId: validLookupKnoxId }),
    enabled: Boolean(mappingReady && validLookupKnoxId),
    staleTime: 15 * 1000,
    retry: false,
  })
  const registrationRows = useMemo(() => expandMailingRegistrationRows(
    registrationsQuery.data,
    lineMapping,
    sdwtMapping,
  ), [lineMapping, registrationsQuery.data, sdwtMapping])
  const lineDeleteGroups = useMemo(() => {
    const groups = new Map()
    registrationRows.forEach((row) => {
      if (!row.line) return
      const group = groups.get(row.line) ?? {
        line: row.line,
        knoxId: row.knoxId,
        sdwts: new Set(),
        grades: new Set(),
        firstRowId: row.id,
      }
      group.sdwts.add(row.sdwt)
      group.grades.add(row.grade)
      groups.set(row.line, group)
    })
    return groups
  }, [registrationRows])

  const registrationMutation = useMutation({
    mutationFn: createMailingRegistration,
    onSuccess: (result) => {
      const savedKnoxIds = result.registration?.knoxIds ?? recipientKnoxIds
      const savedKnoxId = savedKnoxIds.at(-1) ?? ""
      setLookupKnoxId(savedKnoxId)
      savedKnoxIds.forEach((knoxId) => {
        queryClient.invalidateQueries({ queryKey: ["mailing-registrations", knoxId] })
      })
      toast.success("Mailing feature registered.", {
        description: `${savedKnoxIds.length} recipients · ${result.registration?.sdwts?.length ?? resolvedSdwts.length} SDWTs · 5 Grades`,
      })
    },
    onError: (error) => toast.error(error.message),
  })
  const deleteMutation = useMutation({
    mutationFn: deleteMailingRegistrationLine,
    onSuccess: (result) => {
      const deletedLine = deleteTarget?.line ?? result.line
      const deletedKnoxId = deleteTarget?.knoxId ?? validLookupKnoxId
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ["mailing-registrations", deletedKnoxId] })
      toast.success(`Deleted Mailing filters for ${formatLineDisplayName(deletedLine)} Line.`, {
        description: `${result.affectedRows?.toLocaleString() ?? 0} DB rows affected`,
      })
    },
    onError: (error) => toast.error(error.message),
  })

  const isReadyToSave = Boolean(
    mappingReady && selectedLine && resolvedSdwts.length && recipientKnoxIds.length,
  )

  const handleLineChange = (line) => {
    setSelectedLine(line)
    setSelectedSdwts([])
    setSdwtQuery("")
  }

  const toggleSdwt = (sdwt) => {
    if (sdwt === ALL_SDWT) {
      setSelectedSdwts((current) => current.includes(ALL_SDWT) ? [] : [ALL_SDWT])
      return
    }
    setSelectedSdwts((current) => (
      current.includes(sdwt)
        ? current.filter((item) => item !== sdwt)
        : [...current.filter((item) => item !== ALL_SDWT), sdwt]
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
    setLookupKnoxId(knoxId)
    setRecipientKnoxInput("")
  }

  const removeRecipientKnoxId = (knoxId) => {
    const next = recipientKnoxIds.filter((value) => value !== knoxId)
    setRecipientKnoxIds(next)
    if (lookupKnoxId === knoxId) setLookupKnoxId(next.at(-1) ?? "")
  }

  const handleSave = () => {
    if (!isReadyToSave || registrationMutation.isPending) return
    registrationMutation.mutate({ knoxIds: recipientKnoxIds, sdwts: resolvedSdwts })
  }

  useImperativeHandle(saveRef, () => ({
    isReady: isReadyToSave,
    save: () => {
      if (!isReadyToSave || registrationMutation.isPending) return null
      return registrationMutation.mutateAsync({
        knoxIds: recipientKnoxIds,
        sdwts: resolvedSdwts,
      })
    },
  }), [
    isReadyToSave,
    recipientKnoxIds,
    registrationMutation,
    resolvedSdwts,
  ])

  const showUrl = (row) => {
    const absoluteUrl = typeof window === "undefined"
      ? row.url
      : new URL(row.url, window.location.origin).toString()
    setUrlTarget({ ...row, absoluteUrl })
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
              <MailPlus className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">Anomaly Mailing Report Recipients</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Register anomaly Mailing recipients by Line and SDWT filters.
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              SPIDER Home
            </Link>
          </Button>
        </div>
        </header>
      ) : null}

      <main className={cn("w-full flex-1", embedded ? "py-1" : "px-4 py-5 sm:px-6 lg:px-8")}>
        <div className="mx-auto grid w-full max-w-[1680px] gap-5">
          <section aria-labelledby="mailing-filter-title">
            <div className="mb-3">
              <h2 id="mailing-filter-title" className="text-base font-semibold">Select Mailing Filters</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Select a Line, then select multiple SDWTs or use ALL.
              </p>
            </div>

            <ResizableFilterArea defaultHeight={310} minHeight={220} maxHeight={700}>
              <div className="grid h-full gap-4 overflow-y-auto pb-1 md:grid-cols-2">
                <FilterPanel
                  step="1"
                  title="Line Name"
                  description="Select the Line for Mailing registration."
                  options={lineOptions}
                  selectedValue={selectedLine}
                  onSelect={handleLineChange}
                  query={lineQuery}
                  onQueryChange={setLineQuery}
                  disabled={mappingQuery.isLoading || lines.length === 0}
                  isLoading={mappingQuery.isFetching}
                  emptyMessage="No lines are available."
                />
                <FilterPanel
                  step="2"
                  title="SDWT"
                  description="Multiple selections are allowed. ALL includes the entire Line."
                  options={visibleSdwtOptions}
                  selectedValues={activeSdwts}
                  multiple
                  onSelect={toggleSdwt}
                  query={sdwtQuery}
                  onQueryChange={setSdwtQuery}
                  disabled={!selectedLine}
                  emptyMessage="Select Line Name first."
                />
              </div>
            </ResizableFilterArea>

            {mappingQuery.isError ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
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

          <Card className="gap-0 overflow-hidden py-0">
            <CardContent className="grid p-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <section className="p-5 sm:p-6" aria-labelledby="mailing-knox-id-title">
                <div className="flex items-center gap-2">
                  <UserRound className="size-4 text-primary" aria-hidden="true" />
                  <h2 id="mailing-knox-id-title" className="text-base font-semibold">Recipient knox_id</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter a knox_id and press Enter. Mailing filters are saved for each recipient.
                </p>
                <label htmlFor="mailing-knox-id" className="mb-2 mt-5 block text-xs font-medium">
                  Enter knox_id
                </label>
                <Input
                  id="mailing-knox-id"
                  value={recipientKnoxInput}
                  onChange={(event) => setRecipientKnoxInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.nativeEvent.isComposing) return
                    event.preventDefault()
                    addRecipientKnoxId()
                  }}
                  placeholder="Enter knox_id and press Enter"
                  className="h-12 max-w-xl text-base font-semibold"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  You can register multiple recipients; one row per recipient is stored in the email table.
                </p>
                {recipientKnoxIds.length ? (
                  <div className="mt-4 rounded-xl border bg-muted/20 p-4">
                    <p className="mb-2 text-xs font-semibold text-foreground">
                      {recipientKnoxIds.length.toLocaleString()} specified recipients
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {recipientKnoxIds.map((knoxId) => (
                        <Badge
                          key={knoxId}
                          variant={lookupKnoxId === knoxId ? "default" : "secondary"}
                          className="gap-1.5 py-1 pl-2.5 pr-1.5"
                        >
                          <button
                            type="button"
                            className="focus-visible:outline-none focus-visible:underline"
                            title={`View registration filters for ${knoxId}`}
                            onClick={() => setLookupKnoxId(knoxId)}
                          >
                            {knoxId}
                          </button>
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
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
                    Register at least one knox_id to receive Mailing reports.
                  </div>
                )}
              </section>
              <section className="border-t p-5 sm:p-6 lg:border-l lg:border-t-0" aria-labelledby="mailing-selection-title">
                <h2 id="mailing-selection-title" className="text-base font-semibold">Filters to Register</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  priority is fixed to A, B, D, M, and N by policy.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <SelectionItem
                    label="Line Name"
                    value={formatLineDisplayName(selectedLine)}
                    complete={Boolean(selectedLine)}
                  />
                  <SelectionItem label="SDWT" value={selectedSdwtLabel} complete={resolvedSdwts.length > 0} />
                  <SelectionItem
                    label="knox_id"
                    value={recipientKnoxIds.join(", ")}
                    complete={recipientKnoxIds.length > 0}
                  />
                  <SelectionItem label="Grade (priority)" value={MAILING_PRIORITIES.join(", ")} complete />
                </div>
              </section>
            </CardContent>
          </Card>

          {!embedded ? (
            <section className="flex flex-col items-stretch justify-between gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
            <div>
              <h2 className="text-sm font-semibold">Review the Mailing filters to register.</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                SDWT and Grade are stored as JSON lists in VARCHAR columns of the email table.
              </p>
            </div>
            <Button
              type="button"
              size="lg"
              className="h-14 min-w-64 rounded-xl text-base shadow-lg shadow-primary/15"
              disabled={!isReadyToSave || registrationMutation.isPending}
              onClick={handleSave}
            >
              {registrationMutation.isPending ? (
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-5" aria-hidden="true" />
              )}
              {registrationMutation.isPending ? "Registering…" : "Register Mailing Feature"}
            </Button>
            </section>
          ) : null}

          <section className="grid gap-3" aria-labelledby="registered-mailing-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="registered-mailing-title" className="text-base font-semibold">Registered Mailing Filters</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Line, SDWT, and Grade values registered for {validLookupKnoxId || "current knox_id"}.
                </p>
              </div>
              <Badge variant="secondary">{registrationRows.length.toLocaleString()} records</Badge>
            </div>

            {!validLookupKnoxId ? (
              <Card className="grid min-h-28 place-items-center px-5 py-6 text-center text-sm text-muted-foreground">
                Enter a knox_id to search.
              </Card>
            ) : registrationsQuery.isLoading ? (
              <Card className="grid min-h-28 place-items-center py-6 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-label="Loading registered filters" />
              </Card>
            ) : registrationsQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                Failed to load registered filters: {registrationsQuery.error.message}
              </div>
            ) : registrationRows.length ? (
              <Card className="gap-0 overflow-hidden py-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-16 text-right">#</TableHead>
                        <TableHead>Line Name</TableHead>
                        <TableHead>SDWT</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead className="w-64 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registrationRows.map((row, index) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            {row.line ? formatLineDisplayName(row.line) : "Mapping unavailable"}
                          </TableCell>
                          <TableCell>{row.sdwt}</TableCell>
                          <TableCell><Badge variant="outline">{row.grade}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!row.line}
                                onClick={() => showUrl(row)}
                              >
                                <Link2 className="size-3.5" aria-hidden="true" />
                                Check Link
                              </Button>
                              {lineDeleteGroups.get(row.line)?.firstRowId === row.id ? (
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    const group = lineDeleteGroups.get(row.line)
                                    setDeleteTarget({
                                      line: group.line,
                                      knoxId: group.knoxId,
                                      sdwts: Array.from(group.sdwts),
                                      grades: Array.from(group.grades),
                                    })
                                  }}
                                >
                                  <Trash2 className="size-3.5" aria-hidden="true" />
                                  Delete Line
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            ) : (
              <Card className="grid min-h-28 place-items-center px-5 py-6 text-center text-sm text-muted-foreground">
                No Mailing filters are registered for {validLookupKnoxId}.
              </Card>
            )}
          </section>
        </div>
      </main>

      <Dialog open={Boolean(urlTarget)} onOpenChange={(open) => !open && setUrlTarget(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request URL</DialogTitle>
            <DialogDescription>
              Only the selected Line, SDWT, and Grade are included in the query parameters.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-3">
              <div><span className="text-muted-foreground">Line</span><p className="mt-1 font-semibold">{urlTarget?.line}</p></div>
              <div><span className="text-muted-foreground">SDWT</span><p className="mt-1 font-semibold">{urlTarget?.sdwt}</p></div>
              <div><span className="text-muted-foreground">Grade</span><p className="mt-1 font-semibold">{urlTarget?.grade}</p></div>
            </div>
            <code className="max-h-40 overflow-auto break-all rounded-lg border bg-muted px-4 py-3 text-xs leading-6">
              {urlTarget?.absoluteUrl}
            </code>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setUrlTarget(null)}>Close</Button>
            <Button type="button" asChild>
              <a href={urlTarget?.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                Open URL
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {formatLineDisplayName(deleteTarget?.line)} Line?</DialogTitle>
            <DialogDescription>
              All SDWTs
              {deleteTarget?.sdwts?.length ? ` (${deleteTarget.sdwts.length})` : ""} and Grades
              {deleteTarget?.grades?.length ? ` (${deleteTarget.grades.length})` : ""} for this Line registered to {deleteTarget?.knoxId} will be deleted from the DB.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-destructive/5 px-4 py-3 text-sm">
            <p className="font-semibold">Line to delete: {formatLineDisplayName(deleteTarget?.line)}</p>
            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
              SDWT: {deleteTarget?.sdwts?.join(", ") || "-"}
            </p>
          </div>
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
              onClick={() => deleteMutation.mutate({
                knoxId: deleteTarget.knoxId,
                line: deleteTarget.line,
                sdwts: deleteTarget.sdwts,
              })}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              Delete Line from DB
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
})
