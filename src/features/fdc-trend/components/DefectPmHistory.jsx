import { memo, useId, useState } from "react"
import { ChevronDown } from "lucide-react"
import { useLanguage } from "@/i18n"
import { sanitizeErrorMessage } from "../api/errorMessage.js"

const PAGE_SIZE = 100

export const CHANGE_HISTORY_TEXT = {
  ko: {
    title: "변경점 이력보기", table: "변경점 이력", error: "로드 오류", total: (count) => `${count.toLocaleString()}건`,
    invalid: (count) => `날짜가 유효하지 않은 ${count}건은 변경점 점선에서 제외했습니다.`,
    empty: "해당 설비의 변경점 이력이 없습니다.", previous: "이전", next: "다음", legend: "변경점 이력",
  },
  en: {
    title: "View change history", table: "Change history", error: "Load error", total: (count) => `${count.toLocaleString()} rows`,
    invalid: (count) => `${count} rows with invalid dates were excluded from the change lines.`,
    empty: "No change history for this equipment.", previous: "Previous", next: "Next", legend: "Change history",
  },
  "zh-CN": {
    title: "查看变更点履历", table: "变更点履历", error: "加载错误", total: (count) => `${count.toLocaleString()}条`,
    invalid: (count) => `已从变更点虚线中排除 ${count} 条日期无效的记录。`,
    empty: "该设备没有变更点履历。", previous: "上一页", next: "下一页", legend: "变更点履历",
  },
}

export const DefectPmHistory = memo(function DefectPmHistory({ rows, columns, error }) {
  const { language } = useLanguage()
  const t = CHANGE_HISTORY_TEXT[language] ?? CHANGE_HISTORY_TEXT.ko
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const contentId = useId()
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const activePage = Math.min(page, pageCount - 1)
  const invalidDates = rows.filter((row) => !Number.isFinite(row.timestamp)).length
  return (
    <section className="min-w-0 border-t" data-i18n-skip>
      <button type="button" aria-expanded={open} aria-controls={contentId}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-xs font-medium hover:bg-muted/50"
        onClick={() => setOpen((current) => !current)}>
        <span>{t.title}</span>
        <span className={`flex items-center gap-2 ${error ? "text-destructive" : "text-muted-foreground"}`}>
          {error ? t.error : t.total(rows.length)}
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </span>
      </button>
      <div id={contentId} hidden={!open}>
        {open ? error ? <p className="px-4 pb-3 text-xs text-destructive" role="alert">{sanitizeErrorMessage(error)}</p> : rows.length ? (
          <>
            {invalidDates > 0 ? <p className="px-4 pb-2 text-xs text-muted-foreground">{t.invalid(invalidDates)}</p> : null}
            <div className="max-h-80 overflow-auto border-t">
              <table className="w-full whitespace-nowrap text-left text-xs" aria-label={t.table}>
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
                <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>{t.previous}</button>
                <span>{activePage + 1} / {pageCount}</span>
                <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={activePage === pageCount - 1} onClick={() => setPage(activePage + 1)}>{t.next}</button>
              </div>
            ) : null}
          </>
        ) : <p className="px-4 pb-3 text-xs text-muted-foreground">{t.empty}</p> : null}
      </div>
    </section>
  )
})
