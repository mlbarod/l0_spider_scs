import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, History, RefreshCw, Search } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { deleteHitHistory, fetchHitHistory, hitHistoryImageUrl } from "../api/hitHistoryApi"
import { fetchCurrentUser } from "../api/currentUserApi"

const EMPTY_FILTERS = { lineId: "", sdwt: "", knoxId: "", dateFrom: "", dateTo: "" }
const FILTER_FIELDS = [
  ["lineId", "Line Name", "text"],
  ["sdwt", "SDWT", "text"],
  ["knoxId", "Saved by", "text"],
  ["dateFrom", "Saved from", "date"],
  ["dateTo", "Saved until", "date"],
]

function HistoryImage({ imageId }) {
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  if (!imageId) return <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">No image was stored with this history record.</p>
  return <div className="rounded-lg border bg-white p-3">
    {failed ? <div role="alert" className="grid justify-items-center gap-3 p-4 text-sm">
      <p>Unable to load the saved chart image.</p>
      <Button variant="outline" onClick={() => { setFailed(false); setLoading(true); setAttempt(attempt + 1) }}>Retry image</Button>
    </div> : <>
      {loading ? <p role="status" className="p-4 text-center text-sm text-muted-foreground">Loading saved chart image…</p> : null}
      <img src={`${hitHistoryImageUrl(imageId)}&attempt=${attempt}`} alt="Saved chart image" className="mx-auto h-auto max-w-full"
        onLoad={() => setLoading(false)} onError={() => { setFailed(true); setLoading(false) }} />
    </>}
  </div>
}

export function HitHistoryPage() {
  const [draft, setDraft] = useState(EMPTY_FILTERS)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const queryClient = useQueryClient()
  const userQuery = useQuery({ queryKey: ["current-user"], queryFn: fetchCurrentUser, retry: false, staleTime: 60_000 })
  const canDelete = userQuery.data?.canDeleteHistory === true
  const historyQuery = useQuery({
    queryKey: ["hit-history", filters, page],
    queryFn: ({ signal }) => fetchHitHistory({ ...filters, page, pageSize: 20, signal }),
    staleTime: 0,
  })
  const data = historyQuery.data
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 20))
  const invalidDates = draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo
  const deletion = useMutation({
    mutationFn: deleteHitHistory,
    onSuccess: async () => {
      setDeleteTarget(null)
      if (selected?.record_id === deleteTarget?.record_id) setSelected(null)
      if (page > 1 && data?.records?.length === 1) setPage(page - 1)
      await queryClient.invalidateQueries({ queryKey: ["hit-history"] })
    },
  })

  function applyFilters(event) {
    event.preventDefault()
    if (invalidDates) return
    setFilters(Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])))
    setPage(1)
  }

  return (
    <main className="flex-1 overflow-y-auto bg-[#f5f5f7] p-4 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link to="/" aria-label="Back to home"><ArrowLeft className="size-4" /></Link>
          </Button>
          <div className="flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold"><History className="size-6" />Saved History Board</h1>
            <p className="mt-1 text-sm text-muted-foreground">Review records added with each chart&apos;s Save History button.</p>
          </div>
          <Button variant="outline" onClick={() => historyQuery.refetch()} disabled={historyQuery.isFetching}>
            <RefreshCw className="size-4" />Refresh
          </Button>
        </header>

        <form onSubmit={applyFilters} className="rounded-xl border bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FILTER_FIELDS.map(([key, label, type]) => (
              <label key={key} className="grid gap-2 text-sm font-medium">
                <span>{label}</span>
                <Input type={type} value={draft[key]} maxLength={type === "date" ? undefined : 256}
                  onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
              </label>
            ))}
          </div>
          {invalidDates ? <p role="alert" className="mt-3 text-sm text-destructive">The start date must not be after the end date.</p> : null}
          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={Boolean(invalidDates)}><Search className="size-4" />Search</Button>
            <Button type="button" variant="outline" onClick={() => {
              setDraft(EMPTY_FILTERS)
              setFilters(EMPTY_FILTERS)
              setPage(1)
            }}>Reset</Button>
          </div>
        </form>

        <section aria-label="Saved History Board" className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b px-5 py-3 text-sm text-muted-foreground" aria-live="polite">
            <span>Saved records</span>: {data?.total?.toLocaleString() ?? "—"}
          </div>
          {historyQuery.isPending ? (
            <p role="status" className="p-10 text-center text-muted-foreground">Loading saved history…</p>
          ) : historyQuery.isError ? (
            <p role="alert" className="p-8 text-center text-destructive">{historyQuery.error.message}</p>
          ) : !data?.records?.length ? (
            <p className="p-10 text-center text-muted-foreground">No saved history matches these filters. Use Save History on a chart to add a record.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Saved at</TableHead><TableHead>Line Name</TableHead><TableHead>SDWT</TableHead>
                <TableHead>Chart date</TableHead><TableHead>Saved by</TableHead><TableHead>Chart</TableHead>
                {canDelete ? <TableHead>Delete history</TableHead> : null}
              </TableRow></TableHeader>
              <TableBody>{data.records.map((record, index) => (
                <TableRow key={`${page}-${index}`}>
                  <TableCell className="whitespace-nowrap">{record.exec_date || "—"}</TableCell>
                  <TableCell>{record.line_id || "—"}</TableCell><TableCell>{record.sdwt || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{record.update_date || "—"}</TableCell>
                  <TableCell>{record.knox_id || "—"}</TableCell>
                  <TableCell>
                    <button className="text-left text-primary underline underline-offset-4"
                      onClick={() => setSelected(record)}>
                      History details
                    </button>
                  </TableCell>
                  {canDelete ? <TableCell>
                    <Button variant="destructive" size="sm" disabled={!record.record_id || deletion.isPending}
                      onClick={() => { deletion.reset(); setDeleteTarget(record) }}>Delete history</Button>
                  </TableCell> : null}
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
          <div className="flex items-center justify-end gap-3 border-t p-4">
            <Button variant="outline" disabled={page === 1 || historyQuery.isFetching} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-sm tabular-nums">{page} / {totalPages}</span>
            <Button variant="outline" disabled={!data || page >= totalPages || historyQuery.isFetching || historyQuery.isError} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </section>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>History details</DialogTitle>
            <DialogDescription>Chart and user information recorded when saved.</DialogDescription>
          </DialogHeader>
          {selected ? <HistoryImage key={selected.image_id ?? "legacy"} imageId={selected.image_id} /> : null}
          {selected ? <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
            {[
              ["Saved at", selected.exec_date], ["Saved by", selected.knox_id],
              ["Line Name", selected.line_id], ["SDWT", selected.sdwt],
              ["Chart date", selected.update_date],
            ].map(([label, value]) => (
              <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value || "—"}</dd></div>
            ))}
          </dl> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deletion.isPending) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete saved history?</DialogTitle>
            <DialogDescription>This record and its saved chart image will be permanently deleted.</DialogDescription>
          </DialogHeader>
          {deleteTarget ? <p className="break-all text-sm">{deleteTarget.exec_date} · {deleteTarget.line_id} · {deleteTarget.sdwt} · {deleteTarget.knox_id}</p> : null}
          {deletion.isError ? <p role="alert" className="text-sm text-destructive">{deletion.error.message}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={deletion.isPending} onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deletion.isPending} onClick={() => deletion.mutate(deleteTarget.record_id)}>
              {deletion.isPending ? "Deleting…" : "Delete history"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
