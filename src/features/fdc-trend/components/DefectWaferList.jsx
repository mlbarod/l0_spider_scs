import { memo, useId, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { formatDefectTime } from "../utils/defectScatter.mjs"

const COLUMNS = ["wafer_id", "tkout_time", "step_seq", "eqp_ch", "lot_id", "process_id", "item_id", "fab_value"]
const PAGE_SIZE = 100

export const DefectWaferList = memo(function DefectWaferList({ points }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const contentId = useId()
  // Use the same per-card NG decision as the red Canvas points, including lot/wafer protection.
  const rows = useMemo(() => points.filter((point) => point.isNg), [points])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const activePage = Math.min(page, pageCount - 1)
  return (
    <section className="min-w-0 border-t">
      <button type="button" aria-expanded={open} aria-controls={contentId}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-xs font-medium hover:bg-muted/50"
        onClick={() => setOpen((current) => !current)}>
        <span>이상감지 Wafer List 보기</span>
        <span className="flex items-center gap-2 text-muted-foreground">
          {rows.length.toLocaleString()}건
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      </button>
      <div id={contentId} hidden={!open}>
        {open ? rows.length ? (
          <>
            <div className="max-h-80 overflow-auto border-t">
              <table className="w-full whitespace-nowrap text-left text-xs" aria-label="이상감지 Wafer List">
                <thead className="sticky top-0 bg-muted">
                  <tr>{COLUMNS.map((column) => <th key={column} scope="col" className="px-3 py-2 font-medium">{column.toUpperCase()}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(activePage * PAGE_SIZE, (activePage + 1) * PAGE_SIZE).map((point, index) => (
                    <tr key={activePage * PAGE_SIZE + index} className="border-t hover:bg-muted/30">
                      {COLUMNS.map((column) => <td key={column} className="select-text px-3 py-2">{column === "tkout_time" ? formatDefectTime(point[column], true) : point[column] ?? "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 ? (
              <div className="flex items-center justify-end gap-3 border-t px-4 py-2 text-xs">
                <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>이전</button>
                <span>{activePage + 1} / {pageCount}</span>
                <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={activePage === pageCount - 1} onClick={() => setPage(activePage + 1)}>다음</button>
              </div>
            ) : null}
          </>
        ) : <p className="px-4 pb-3 text-xs text-muted-foreground">이상감지 Wafer 데이터가 없습니다.</p> : null}
      </div>
    </section>
  )
})
