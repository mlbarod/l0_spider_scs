import { memo, useId, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { useLanguage } from "@/i18n"
import { DefectWaferTable, WAFER_TEXT } from "./DefectWaferTable"

export const DefectWaferList = memo(function DefectWaferList({ points }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const contentId = useId()
  const { language } = useLanguage()
  const t = WAFER_TEXT[language] ?? WAFER_TEXT.ko
  // Use the same per-card NG decision as the red Canvas points, including lot/wafer protection.
  const rows = useMemo(() => points.filter((point) => point.isNg), [points])
  return (
    <section className="min-w-0 border-t" data-i18n-skip>
      <button type="button" aria-expanded={open} aria-controls={contentId}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-xs font-medium hover:bg-muted/50"
        onClick={() => setOpen((current) => !current)}>
        <span>{t.title}</span>
        <span className="flex items-center gap-2 text-muted-foreground">
          {t.total(rows.length)}
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      </button>
      <div id={contentId} hidden={!open}>
        {open ? rows.length ? <DefectWaferTable rows={rows} page={page} setPage={setPage} />
          : <p className="px-4 pb-3 text-xs text-muted-foreground">{t.empty}</p> : null}
      </div>
    </section>
  )
})
