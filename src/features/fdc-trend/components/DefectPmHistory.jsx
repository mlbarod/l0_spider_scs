import { memo, useId, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { useLanguage } from "@/i18n"
import { sanitizeErrorMessage } from "../api/errorMessage.js"

const PAGE_SIZE = 100
const LINK_COLUMN = "__index_level_0__"
const WORK_ORDER_LINE_IDS = { X1: "XFB1", X2: "XFB2" }

export function changeDetailUrl(wono, line) {
  const lineId = WORK_ORDER_LINE_IDS[line]
  const workOrder = String(wono ?? "").trim()
  if (!lineId || !workOrder) return null
  return `https://ctttm.eqmsscs.samsungds.net:7443/tttm/autoReport/qckLnk/mainInfo.do?wono=${encodeURIComponent(workOrder)}&lineId=${lineId}&_menuParam=WORKORDER_REPORT_DETAIL`
}

export const CHANGE_HISTORY_TEXT = {
  ko: {
    title: "변경점 이력보기", table: "변경점 이력", error: "로드 오류", total: (count) => `${count.toLocaleString()}건`,
    invalid: (count) => `날짜가 유효하지 않은 ${count}건은 변경점 점선에서 제외했습니다.`,
    empty: "해당 설비의 변경점 이력이 없습니다.", previous: "이전", next: "다음", legend: "변경점 이력",
    link: "변경점 상세 페이지 새 창으로 열기", linkUnavailable: "wono 또는 Line 정보가 없어 상세 페이지를 열 수 없습니다.",
  },
  en: {
    title: "View change history", table: "Change history", error: "Load error", total: (count) => `${count.toLocaleString()} rows`,
    invalid: (count) => `${count} rows with invalid dates were excluded from the change lines.`,
    empty: "No change history for this equipment.", previous: "Previous", next: "Next", legend: "Change history",
    link: "Open change detail page in a new window", linkUnavailable: "Cannot open the detail page because wono or Line information is missing.",
  },
  "zh-CN": {
    title: "查看变更点履历", table: "变更点履历", error: "加载错误", total: (count) => `${count.toLocaleString()}条`,
    invalid: (count) => `已从变更点虚线中排除 ${count} 条日期无效的记录。`,
    empty: "该设备没有变更点履历。", previous: "上一页", next: "下一页", legend: "变更点履历",
    link: "在新窗口中打开变更点详情页面", linkUnavailable: "缺少 wono 或 Line 信息，无法打开详情页面。",
  },
}

export const DefectPmHistory = memo(function DefectPmHistory({ rows, columns, error, line }) {
  const { language } = useLanguage()
  const t = CHANGE_HISTORY_TEXT[language] ?? CHANGE_HISTORY_TEXT.ko
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const contentId = useId()
  // Newest inprg_dt first; rows with invalid dates go last.
  const sortedRows = useMemo(() => [...rows].sort((a, b) =>
    (Number.isFinite(b.timestamp) ? b.timestamp : -Infinity) - (Number.isFinite(a.timestamp) ? a.timestamp : -Infinity) || 0), [rows])
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
                  <tr>{columns.map((column) => <th key={column} scope="col" className="px-3 py-2 font-medium">{column === LINK_COLUMN ? "LINK" : column}</th>)}</tr>
                </thead>
                <tbody>
                  {sortedRows.slice(activePage * PAGE_SIZE, (activePage + 1) * PAGE_SIZE).map((row, index) => (
                    <tr key={activePage * PAGE_SIZE + index} className="border-t hover:bg-muted/30">
                      {columns.map((column) => <td key={column} className="select-text px-3 py-2">{column === LINK_COLUMN ? (
                        <ChangeDetailLink url={changeDetailUrl(row.raw.wono, line)} t={t} />
                      ) : row.raw[column] == null ? "—" : String(row.raw[column])}</td>)}
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

function ChangeDetailLink({ url, t }) {
  if (!url) return <button type="button" className="rounded border px-2 py-0.5 disabled:opacity-40" disabled title={t.linkUnavailable} aria-label={t.linkUnavailable}>LINK</button>
  return <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block rounded border px-2 py-0.5 hover:bg-muted" title={t.link} aria-label={t.link}>LINK</a>
}
