import { memo, useId, useState } from "react"
import { ChevronDown } from "lucide-react"

const PAGE_SIZE = 100

export const DefectPmHistory = memo(function DefectPmHistory({ rows, columns, error }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const contentId = useId()
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const activePage = Math.min(page, pageCount - 1)
  const invalidDates = rows.filter((row) => !Number.isFinite(row.timestamp)).length
  return (
    <section className="min-w-0 border-t">
      <button type="button" aria-expanded={open} aria-controls={contentId}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-xs font-medium hover:bg-muted/50"
        onClick={() => setOpen((current) => !current)}>
        <span>PM이력 보기</span>
        <span className={`flex items-center gap-2 ${error ? "text-destructive" : "text-muted-foreground"}`}>
          {error ? "로드 오류" : `${rows.length.toLocaleString()}건`}
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      </button>
      <div id={contentId} hidden={!open}>
        {open ? error ? <p className="px-4 pb-3 text-xs text-destructive" role="alert">{error}</p> : rows.length ? (
          <>
            {invalidDates > 0 ? <p className="px-4 pb-2 text-xs text-muted-foreground">날짜가 유효하지 않은 {invalidDates}건은 변경점 점선에서 제외했습니다.</p> : null}
            <div className="max-h-80 overflow-auto border-t">
              <table className="w-full whitespace-nowrap text-left text-xs" aria-label="PM이력">
                <thead className="sticky top-0 bg-muted">
                  <tr>{columns.map((column) => <th key={column} scope="col" className="px-3 py-2 font-medium">{column}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(activePage * PAGE_SIZE, (activePage + 1) * PAGE_SIZE).map((row, index) => (
                    <tr key={activePage * PAGE_SIZE + index} className="border-t hover:bg-muted/30">
                      {columns.map((column) => <td key={column} className="select-text px-3 py-2">{row.raw[column] == null ? "—" : String(row.raw[column])}</td>)}
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
        ) : <p className="px-4 pb-3 text-xs text-muted-foreground">해당 설비의 PM이력이 없습니다.</p> : null}
      </div>
    </section>
  )
})
