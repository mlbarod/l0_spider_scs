import { useEffect, useId, useRef, useState } from "react"
import { useLanguage } from "@/i18n"
import { formatDefectTime } from "../utils/defectScatter.mjs"

const COLUMNS = ["wafer_id", "tkout_time", "step_seq", "eqp_ch", "lot_id", "process_id", "item_id", "fab_value"]
const PAGE_SIZE = 100
export const WAFER_TEXT = {
  ko: {
    title: "이상감지 Wafer List 보기", table: "이상감지 Wafer List", empty: "이상감지 Wafer 데이터가 없습니다.",
    total: (count) => `${count.toLocaleString()}건`, previous: "이전", next: "다음", pages: "표 페이지",
    all: "전체 선택", column: (name) => `${name} 열 전체 선택`, row: (number) => `${number}행 선택`,
    hint: "셀을 드래그하거나 열 제목을 클릭해 선택한 뒤 Ctrl+C / ⌘C로 복사하세요. 열 제목은 모든 페이지의 해당 열을 선택합니다.",
    selected: (rows, columns) => `${rows}행 × ${columns}열 선택됨`, copy: "복사",
    copied: "복사했습니다. 엑셀에 붙여넣으세요.", failed: "복사하지 못했습니다. Ctrl+C / ⌘C로 다시 시도해 주세요.",
  },
  en: {
    title: "View anomaly Wafer List", table: "Anomaly Wafer List", empty: "No anomalous wafer data.",
    total: (count) => `${count.toLocaleString()} rows`, previous: "Previous", next: "Next", pages: "Table pages",
    all: "Select all", column: (name) => `Select entire ${name} column`, row: (number) => `Select row ${number}`,
    hint: "Drag cells or click a column heading, then copy with Ctrl+C / ⌘C. Column headings select that column across all pages.",
    selected: (rows, columns) => `${rows} rows × ${columns} columns selected`, copy: "Copy",
    copied: "Copied. Paste into Excel.", failed: "Copy failed. Try again with Ctrl+C / ⌘C.",
  },
  "zh-CN": {
    title: "查看异常 Wafer List", table: "异常 Wafer List", empty: "暂无异常晶圆数据。",
    total: (count) => `${count.toLocaleString()} 行`, previous: "上一页", next: "下一页", pages: "表格分页",
    all: "全选", column: (name) => `选择 ${name} 整列`, row: (number) => `选择第 ${number} 行`,
    hint: "拖动单元格或点击列标题选择，然后按 Ctrl+C / ⌘C 复制。点击列标题将选择所有页面中的该列。",
    selected: (rows, columns) => `已选择 ${rows} 行 × ${columns} 列`, copy: "复制",
    copied: "已复制，请粘贴到 Excel。", failed: "复制失败，请按 Ctrl+C / ⌘C 重试。",
  },
}

function cellText(point, column) {
  return String(column === "tkout_time" ? formatDefectTime(point[column], true) : point[column] ?? "—")
}

export function DefectWaferTable({ rows, page, setPage }) {
  const { language } = useLanguage()
  const t = WAFER_TEXT[language] ?? WAFER_TEXT.ko
  const [selection, setSelection] = useState(null)
  const [message, setMessage] = useState("")
  const grid = useRef(null)
  const selecting = useRef(false)
  const hintId = useId()
  // A selection belongs to its original data, never to a subsequently loaded result.
  const current = selection?.rows === rows ? selection : null
  const bounds = current ? {
    r1: Math.min(current.anchor.row, current.focus.row), r2: Math.max(current.anchor.row, current.focus.row),
    c1: Math.min(current.anchor.col, current.focus.col), c2: Math.max(current.anchor.col, current.focus.col),
  } : null
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const activePage = Math.min(page, pageCount - 1)
  const offset = activePage * PAGE_SIZE

  useEffect(() => {
    const stop = () => { selecting.current = false }
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
    window.addEventListener("blur", stop)
    return () => {
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
      window.removeEventListener("blur", stop)
    }
  }, [])

  function choose(anchor, focus = anchor) {
    setSelection({ rows, anchor, focus })
    setMessage("")
    grid.current?.focus({ preventScroll: true })
  }
  function selectAll() {
    choose({ row: 0, col: 0 }, { row: rows.length - 1, col: COLUMNS.length - 1 })
  }
  function selectedText() {
    return rows.slice(bounds.r1, bounds.r2 + 1).map((point) => COLUMNS.slice(bounds.c1, bounds.c2 + 1)
      .map((column) => cellText(point, column).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n")
  }
  async function copy() {
    if (!bounds) return
    const text = selectedText()
    try {
      await navigator.clipboard.writeText(text)
      setMessage("copied")
      return
    } catch { /* Support HTTP intranet pages through the browser copy command. */ }
    const previousFocus = document.activeElement
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.cssText = "position:fixed;left:-9999px;top:0"
    document.body.appendChild(textarea)
    try {
      textarea.select()
      setMessage(document.execCommand("copy") ? "copied" : "failed")
    } catch { setMessage("failed") }
    finally { textarea.remove(); previousFocus?.focus({ preventScroll: true }) }
  }
  function keyboard(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault(); selectAll(); return
    }
    // Native copy events support both keyboard shortcuts and the browser Copy command.
    if (event.key === "Escape") { setSelection(null); setMessage(""); return }
    const movement = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key]
    if (!movement) return
    event.preventDefault()
    const position = current?.focus ?? { row: offset, col: 0 }
    const focus = {
      row: Math.max(0, Math.min(rows.length - 1, position.row + movement[0])),
      col: Math.max(0, Math.min(COLUMNS.length - 1, position.col + movement[1])),
    }
    choose(event.shiftKey && current ? current.anchor : focus, focus)
    setPage(Math.floor(focus.row / PAGE_SIZE))
    requestAnimationFrame(() => grid.current?.querySelector(`[data-cell="${focus.row}-${focus.col}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }))
  }

  return <div data-i18n-skip>
    <div className="max-h-80 overflow-auto border-t focus-visible:outline-2 focus-visible:outline-primary" ref={grid}
      tabIndex={0} onKeyDown={keyboard} onBlur={() => { selecting.current = false }}
      onCopy={(event) => {
        if (!bounds) return
        event.preventDefault()
        try { event.clipboardData.setData("text/plain", selectedText()); setMessage("copied") }
        catch { setMessage("failed") }
      }}>
      <table role="grid" aria-label={t.table} aria-describedby={hintId} aria-multiselectable="true"
        aria-rowcount={rows.length + 1} aria-colcount={COLUMNS.length + 1}
        className="w-full select-none border-separate border-spacing-0 whitespace-nowrap text-left text-xs">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr aria-rowindex={1}>
            <th scope="col" className="border-b border-r text-center"><button type="button" className="w-full px-3 py-2" aria-label={t.all} onClick={selectAll}>#</button></th>
            {COLUMNS.map((column, col) => <th key={column} scope="col" className="border-b border-r font-medium"
              aria-selected={Boolean(bounds && bounds.r1 === 0 && bounds.r2 === rows.length - 1 && col >= bounds.c1 && col <= bounds.c2)}>
              <button type="button" className="w-full px-3 py-2 text-left hover:bg-primary/10" aria-label={t.column(column.toUpperCase())}
                onClick={() => choose({ row: 0, col }, { row: rows.length - 1, col })}>{column.toUpperCase()}</button>
            </th>)}
          </tr>
        </thead>
        <tbody>{rows.slice(offset, offset + PAGE_SIZE).map((point, index) => {
          const row = offset + index
          return <tr key={row} aria-rowindex={row + 2}>
            <th scope="row" className="border-b border-r bg-muted text-center font-normal text-muted-foreground">
              <button type="button" className="w-full px-3 py-2" aria-label={t.row(row + 1)}
                onClick={() => choose({ row, col: 0 }, { row, col: COLUMNS.length - 1 })}>{row + 1}</button>
            </th>
            {COLUMNS.map((column, col) => {
              const selected = Boolean(bounds && row >= bounds.r1 && row <= bounds.r2 && col >= bounds.c1 && col <= bounds.c2)
              return <td key={column} role="gridcell" data-cell={`${row}-${col}`} aria-selected={selected}
                className={`cursor-cell border-b border-r px-3 py-2 ${selected ? "bg-primary/15 ring-1 ring-inset ring-primary/50" : "hover:bg-muted/30"}`}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  selecting.current = true
                  const cell = { row, col }
                  choose(event.shiftKey && current ? current.anchor : cell, cell)
                }}
                onPointerOver={(event) => {
                  if (selecting.current && event.buttons === 1 && current) choose(current.anchor, { row, col })
                }}>{cellText(point, column)}</td>
            })}
          </tr>
        })}</tbody>
      </table>
    </div>
    <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
      <div><p id={hintId}>{t.hint}</p><p role="status" aria-live="polite">{bounds ? (message ? t[message] : t.selected(bounds.r2 - bounds.r1 + 1, bounds.c2 - bounds.c1 + 1)) : ""}</p></div>
      {bounds && <button type="button" className="shrink-0 rounded border px-3 py-1 text-foreground hover:bg-muted" onClick={copy}>{t.copy}</button>}
    </div>
    {pageCount > 1 && <nav aria-label={t.pages} className="flex items-center justify-end gap-3 border-t px-4 py-2 text-xs">
      <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>{t.previous}</button>
      <span>{activePage + 1} / {pageCount}</span>
      <button type="button" className="rounded border px-2 py-1 disabled:opacity-40" disabled={activePage === pageCount - 1} onClick={() => setPage(activePage + 1)}>{t.next}</button>
    </nav>}
  </div>
}
