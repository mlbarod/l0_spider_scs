import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ClipboardList, Loader2, RefreshCw, Search, Trash2 } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { deleteHistoryPost, fetchHistoryPost, fetchHistoryPosts, historyPostImageUrl, updateHistoryPostStatus } from "../api/historyBoardApi"
import { formatLineDisplayName } from "../utils/lineDisplay.mjs"

const APP_NAMES = {
  "self-equipment": "Equipment-Level In-SPEC Anomaly Detection",
  "matching-anomaly": "Similarity Anomaly Detection",
  "common-anomaly": "Common Area Anomaly Detection",
  "common-commonality-anomaly": "Common Area Similarity Detection",
  "defect-spider": "Defect SPIDER",
}
const WORK_NAMES = { IN_PROGRESS: "In progress", COMPLETED: "Completed" }
const TYPE_NAMES = { HISTORY: "Save History" }
const PAGE_SIZE = 20

function WorkBadge({ status }) {
  return <Badge variant={status === "COMPLETED" ? "secondary" : "default"}>{WORK_NAMES[status] ?? status}</Badge>
}

function PostTitle({ post }) {
  return post.title ? <span data-i18n-skip>{post.title}</span> : <span>Saved history</span>
}

function PostImage({ id }) {
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  if (failed) {
    return <div role="alert" className="grid justify-items-start gap-3 text-sm">
      <p>Unable to load the saved chart image.</p>
      <Button variant="outline" onClick={() => { setFailed(false); setAttempt((value) => value + 1) }}>Retry image</Button>
    </div>
  }
  return <img key={attempt} src={`${historyPostImageUrl(id)}?attempt=${attempt}`} alt="Saved chart image"
    className="h-auto max-w-full" onError={() => setFailed(true)} />
}

function PostDetail({ id, onClose }) {
  const client = useQueryClient()
  const [comment, setComment] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const query = useQuery({ queryKey: ["history-post", id], queryFn: ({ signal }) => fetchHistoryPost(id, signal), retry: false, staleTime: 0 })
  const post = query.data?.post
  const update = useMutation({
    mutationFn: (input) => updateHistoryPostStatus(id, input),
    onSuccess: async () => {
      setComment("")
      await Promise.all([
        client.invalidateQueries({ queryKey: ["history-post", id] }),
        client.invalidateQueries({ queryKey: ["history-posts"] }),
      ])
      toast.success("Work status changed.")
    },
    onError: (error) => {
      toast.error(error.message)
      if (error.code === "BOARD_CONFLICT") void query.refetch()
    },
  })
  const remove = useMutation({
    mutationFn: () => deleteHistoryPost(id),
    onSuccess: async () => {
      setConfirmDelete(false)
      onClose()
      client.removeQueries({ queryKey: ["history-post", id], exact: true })
      await client.invalidateQueries({ queryKey: ["history-posts"] })
      toast.success("Entry deleted.")
    },
    onError: (error) => toast.error(error.message),
  })
  const busy = update.isPending || remove.isPending

  return <>
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="break-words pr-6">{post ? <PostTitle post={post} /> : "History details"}</DialogTitle>
          <DialogDescription>Review the registered content and chart image, and manage the work status.</DialogDescription>
        </DialogHeader>
        {query.isPending ? <p role="status" className="flex items-center gap-2 py-8"><Loader2 className="size-4 animate-spin" aria-hidden="true" /><span>Loading the entry…</span></p>
          : query.isError ? <div role="alert" className="grid justify-items-start gap-3"><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div>
          : post ? <div className="grid gap-5">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <WorkBadge status={post.workStatus} />
              <Badge variant="outline">{TYPE_NAMES[post.type] ?? post.type}</Badge>
              {APP_NAMES[post.app] ? <span>{APP_NAMES[post.app]}</span> : null}
              <span className="text-muted-foreground">{post.createdAt}</span>
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
              {[
                ["Line Name", formatLineDisplayName(post.line) || post.line],
                ["SDWT", post.sdwt],
                ["Registered by", post.author],
                ["Chart date", post.updateDate],
              ].map(([label, value]) => <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt><dd className="break-all" data-i18n-skip>{value || "—"}</dd>
              </div>)}
            </dl>
            {post.details ? <p className="whitespace-pre-wrap break-words text-sm" data-i18n-skip>{post.details}</p> : null}
            {post.comment ? <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/30 p-4 text-sm leading-6">{post.comment}</p> : null}
            <section aria-label="Saved chart image" className="overflow-x-auto rounded-lg border bg-white p-3">
              {post.hasImage ? <PostImage id={post.id} /> : <p className="text-sm text-muted-foreground">No image was stored with this history record.</p>}
            </section>
            <section className="grid gap-3 rounded-lg border p-4" aria-label="Change work status">
              <h2 className="font-semibold">Change work status</h2>
              <label className="grid gap-2 text-sm"><span>Processing comment (optional)</span>
                <Textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} disabled={busy}
                  placeholder="Leave the actions taken or progress." />
              </label>
              <Button className="justify-self-end" disabled={busy || query.isFetching}
                onClick={() => update.mutate({ status: post.workStatus === "COMPLETED" ? "IN_PROGRESS" : "COMPLETED", version: post.version, comment })}>
                {update.isPending ? "Saving…" : post.workStatus === "COMPLETED" ? "Change to in progress" : "Mark as completed"}
              </Button>
            </section>
            <section aria-label="Status change history" className="grid gap-3">
              <h2 className="font-semibold">Status change history</h2>
              {post.history.length ? post.history.map((item, index) => <article key={`${item.changedAt}-${index}`} className="rounded-lg border p-3 text-sm">
                <p><span>{WORK_NAMES[item.from] ?? item.from}</span> → <span>{WORK_NAMES[item.to] ?? item.to}</span> · <span data-i18n-skip>{item.changedBy}</span></p>
                <p className="mt-1 text-xs text-muted-foreground">{item.changedAt}</p>
                {item.comment ? <p className="mt-2 whitespace-pre-wrap break-words" data-i18n-skip>{item.comment}</p> : null}
              </article>) : <p className="text-sm text-muted-foreground">No status changes yet.</p>}
            </section>
            {post.canDelete ? <Button variant="destructive" className="justify-self-end" disabled={busy || query.isFetching} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" aria-hidden="true" />Delete entry
            </Button> : null}
          </div> : null}
      </DialogContent>
    </Dialog>
    <Dialog open={confirmDelete} onOpenChange={(open) => { if (!open && !remove.isPending) setConfirmDelete(false) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this entry?</DialogTitle>
          <DialogDescription>The entry, its chart image and status change history will be permanently deleted.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={remove.isPending} onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "Deleting…" : "Delete entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}

export function HitHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const id = searchParams.get("post")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [line, setLine] = useState("")
  const [sdwt, setSdwt] = useState("")
  const [page, setPage] = useState(1)
  const filters = { page, status, search, line, sdwt }
  const query = useQuery({
    queryKey: ["history-posts", filters],
    queryFn: ({ signal }) => fetchHistoryPosts({ ...filters, signal }),
    retry: false,
    staleTime: 0,
  })
  const lines = [...new Set([line, ...(query.data?.filters?.lines ?? [])].filter(Boolean))]
  const sdwts = [...new Set([sdwt, ...(query.data?.filters?.sdwts ?? [])].filter(Boolean))]
  const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE))
  useEffect(() => {
    if (query.isSuccess && page > pages) setPage(pages)
  }, [query.isSuccess, page, pages])

  return (
    <main className="flex-1 overflow-y-auto bg-[#f5f5f7] p-4 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link to="/" aria-label="Back to home"><ArrowLeft className="size-4" /></Link>
          </Button>
          <div className="flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-semibold"><ClipboardList className="size-6" aria-hidden="true" />Saved History Board</h1>
            <p className="mt-1 text-sm text-muted-foreground">Review entries registered with each chart&apos;s Save History button, and manage their work status.</p>
          </div>
        </header>

        <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-5"
          onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(1) }}>
          <label className="grid gap-2 text-sm"><span>Line Name</span>
            <select aria-label="Line Name" value={line} disabled={query.isPending} className="h-10 min-w-32 rounded-md border bg-background px-3"
              onChange={(event) => { setLine(event.target.value); setSdwt(""); setPage(1) }}>
              <option value="">All</option>
              {lines.map((value) => <option key={value} value={value} data-i18n-skip>{formatLineDisplayName(value) || value}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm"><span>SDWT</span>
            <select aria-label="SDWT" value={sdwt} disabled={query.isPending} className="h-10 min-w-32 rounded-md border bg-background px-3"
              onChange={(event) => { setSdwt(event.target.value); setPage(1) }}>
              <option value="">All</option>
              {sdwts.map((value) => <option key={value} value={value} data-i18n-skip>{value}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm"><span>Work status</span>
            <select aria-label="Work status" value={status} className="h-10 rounded-md border bg-background px-3"
              onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
              <option value="">All</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </label>
          <label className="grid min-w-48 flex-1 gap-2 text-sm"><span>Search</span>
            <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={200}
              placeholder="Title, registered by, chart details" className="h-10" />
          </label>
          <Button type="submit" className="h-10"><Search className="size-4" aria-hidden="true" />Search</Button>
          <Button type="button" variant="outline" className="h-10" disabled={query.isFetching} onClick={() => query.refetch()}>
            <RefreshCw className="size-4" aria-hidden="true" />Refresh
          </Button>
        </form>

        {query.isPending ? <p role="status" className="py-10 text-center text-muted-foreground">Loading saved history…</p>
          : query.isError ? <p role="alert" className="rounded-xl border bg-white p-6 text-destructive">{query.error.message}</p>
          : <>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              <span>{`${query.data.total.toLocaleString()} total`}</span> · <span>Anyone can view entries. Registered users can change their status.</span>
            </p>
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b bg-muted/40"><tr>
                  <th className="p-4">Work status</th><th className="p-4">Line / SDWT</th><th className="p-4">Title / App</th>
                  <th className="p-4">Type</th><th className="p-4">Registered by</th><th className="p-4">Registered at</th>
                </tr></thead>
                <tbody>{query.data.posts.length ? query.data.posts.map((post) => <tr key={post.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="p-4"><WorkBadge status={post.workStatus} /></td>
                  <td className="p-4" data-i18n-skip><p>{formatLineDisplayName(post.line) || post.line || "—"}</p><p className="mt-1 text-xs text-muted-foreground">{post.sdwt || "—"}</p></td>
                  <td className="max-w-lg p-4">
                    <Link to={`?post=${post.id}`} className="break-words font-medium text-primary underline-offset-4 hover:underline"><PostTitle post={post} /></Link>
                    {APP_NAMES[post.app] ? <p className="mt-1 text-xs text-muted-foreground">{APP_NAMES[post.app]}</p> : null}
                  </td>
                  <td className="p-4">{TYPE_NAMES[post.type] ?? post.type}</td>
                  <td className="p-4" data-i18n-skip>{post.author}</td>
                  <td className="whitespace-nowrap p-4 text-xs">{post.createdAt}</td>
                </tr>) : <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">No entries match these filters. Use Save History on a chart to add an entry.</td></tr>}</tbody>
              </table>
            </div>
            <nav aria-label="Board pages" className="flex items-center justify-center gap-4">
              <Button variant="outline" disabled={page <= 1 || query.isFetching} onClick={() => setPage((value) => value - 1)}>Previous</Button>
              <span className="text-sm tabular-nums">{`Page ${page} of ${pages}`}</span>
              <Button variant="outline" disabled={page >= pages || query.isFetching} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </nav>
          </>}
      </div>
      {id ? <PostDetail key={id} id={id} onClose={() => setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.delete("post")
        return next
      })} /> : null}
    </main>
  )
}
