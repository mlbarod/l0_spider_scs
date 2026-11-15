import { useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { fetchCurrentUser } from "../api/currentUserApi"
import { createHistoryPost } from "../api/historyBoardApi"
import { createHistoryRequestId } from "../utils/historyRequestId.mjs"

// Stored in English and translated on screen, like other UI text.
export const CHART_HISTORY_COMMENTS = Object.freeze([
  "Please review the anomaly detection details.",
  "Please check the equipment status and change history.",
  "Please share the results after root-cause analysis and action.",
])
const MAX_COMMENT_LENGTH = 2000
// Matches the dialog open animation (duration-200) so image work never stalls the popup.
const OPEN_ANIMATION_MS = 200

// Saves the chart with a title and comment to the Saved History Board (l0_spider mail flow without sending).
export function ChartHistoryDialog({ title, details, app, fields, prepareImage, disabled = false }) {
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState("")
  const [image, setImage] = useState(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState("")
  const [commentChoice, setCommentChoice] = useState(CHART_HISTORY_COMMENTS[0])
  const [customComment, setCustomComment] = useState("")
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState("")
  const [saveError, setSaveError] = useState("")
  const lock = useRef(false)
  const generation = useRef(0)
  const requestId = useRef(null)
  const prepareRef = useRef(null)
  const currentUser = useQuery({ queryKey: ["current-user"], queryFn: fetchCurrentUser, enabled: open, retry: false, staleTime: 60_000 })
  const knoxId = currentUser.data?.knoxId
  const comment = commentChoice === "custom" ? customComment : commentChoice
  const locked = saving || Boolean(savedId)
  const canSave = !locked && !imageBusy && Boolean(image) && Boolean(knoxId) && Boolean(draftTitle.trim()) && Boolean(comment.trim())

  async function prepare() {
    const token = ++generation.current
    setImageBusy(true)
    setImageError("")
    try {
      const nextImage = await prepareRef.current()
      if (token === generation.current) setImage(nextImage)
    } catch (error) {
      if (token === generation.current) setImageError(error.message || "Unable to prepare the chart image.")
    } finally {
      if (token === generation.current) setImageBusy(false)
    }
  }

  function openDraft() {
    prepareRef.current = prepareImage
    setDraftTitle(title)
    setImage(null)
    setCommentChoice(CHART_HISTORY_COMMENTS[0])
    setCustomComment("")
    setSavedId("")
    setSaveError("")
    // One request ID per opened draft so a retry after a lost response cannot duplicate the entry.
    requestId.current = createHistoryRequestId()
    setImageError("")
    setImageBusy(true)
    setOpen(true)
    // Building the image renders a second chart and blocks the main thread, so it starts only
    // after the popup has painted and finished opening. Closing first cancels it.
    const scheduled = generation.current
    requestAnimationFrame(() => setTimeout(() => {
      if (scheduled === generation.current) void prepare()
    }, OPEN_ANIMATION_MS))
  }

  async function save() {
    if (lock.current || !canSave) return
    lock.current = true
    setSaving(true)
    setSaveError("")
    try {
      const result = await createHistoryPost({
        ...fields, entryType: "HISTORY", title: draftTitle, details, comment, app, image, requestId: requestId.current,
      })
      setSavedId(result.id)
      void client.invalidateQueries({ queryKey: ["history-posts"] })
    } catch (error) {
      setSaveError(error.message)
    } finally {
      lock.current = false
      setSaving(false)
    }
  }

  return <>
    <Button type="button" variant="outline" size="sm" className="h-9 px-[0.9rem] text-sm" disabled={disabled} onClick={openDraft}>
      <Save className="size-4" aria-hidden="true" />Save History
    </Button>
    <Dialog open={open} onOpenChange={(value) => { if (!saving) { setOpen(value); if (!value) generation.current += 1 } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Save chart history</DialogTitle>
          <DialogDescription>Review the chart, title and comment, then select Save. The entry is added to the Saved History Board.</DialogDescription>
        </DialogHeader>
        <p className="text-sm"><span>Registered by</span>: {knoxId || <span>Checking the signed-in user…</span>}</p>
        {currentUser.isError ? <p role="alert" className="text-sm text-destructive">{currentUser.error.message}</p> : null}
        <fieldset disabled={locked} className="grid gap-3">
          <label className="grid gap-1 text-sm"><span>Title</span>
            <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={300} />
          </label>
          <label className="grid gap-1 text-sm"><span>Comment</span>
            <select className="h-10 rounded-md border bg-background px-3" value={commentChoice} onChange={(event) => setCommentChoice(event.target.value)}>
              {CHART_HISTORY_COMMENTS.map((text) => <option key={text} value={text}>{text}</option>)}
              <option value="custom">Enter manually</option>
            </select>
          </label>
          {commentChoice === "custom" ? <label className="grid gap-1 text-sm"><span>Custom comment</span>
            <textarea className="min-h-28 rounded-md border bg-background px-3 py-2" value={customComment} rows={4}
              onChange={(event) => setCustomComment(event.target.value)} maxLength={MAX_COMMENT_LENGTH}
              placeholder="Enter a comment." />
            <span className="text-xs text-muted-foreground">{customComment.length} / {MAX_COMMENT_LENGTH}</span>
          </label> : null}
        </fieldset>
        <section aria-label="Preview" className="grid gap-3 rounded-lg border bg-white p-5 text-slate-900">
          <h3 className="break-words font-semibold" data-i18n-skip>{draftTitle}</h3>
          <p className="whitespace-pre-wrap break-words text-sm" data-i18n-skip>{details}</p>
          <p className="whitespace-pre-wrap break-words py-[60px] text-sm leading-5">{comment}</p>
          {imageBusy ? <div role="status" className="grid h-60 w-full max-w-[600px] animate-pulse place-items-center rounded-md bg-muted">
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" /><span>Preparing the chart image…</span></p>
            </div>
            : imageError ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
              <span>{imageError}</span><Button variant="outline" size="sm" onClick={prepare}>Prepare again</Button>
            </div>
            : image ? <img src={image} alt="Chart to save" className="h-auto max-w-full animate-in fade-in-0 duration-300" /> : null}
        </section>
        {saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}
        {savedId ? <div role="status" className="flex flex-wrap items-center gap-3 text-sm text-green-700">
          <span>Registered on the Saved History Board.</span>
          <Button asChild variant="outline" size="sm"><Link to={`/history?post=${savedId}`}>View on the board</Link></Button>
        </div> : null}
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => { generation.current += 1; setOpen(false) }}>Close</Button>
          <Button disabled={!canSave} onClick={save}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {saving ? "Saving…" : savedId ? "Saved" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
