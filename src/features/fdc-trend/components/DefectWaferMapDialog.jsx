import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { LoaderCircle } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/i18n"

import { fetchDefectMaps } from "../api/defectSpiderApi"
import { CLUSTER_PC_TEXT, WaferCard } from "../pages/DefectClusterPcPage"

const MAP_TEXT = {
  ko: {
    open: "이상 wafer map보기", title: (eqpCh) => `${eqpCh} 이상 wafer map`,
    description: (main, met) => `main_step ${main || "-"} · met_step ${met || "-"} · 차트의 빨간 점 wafer`,
    loading: "wafer map을 불러오는 중입니다.", empty: "표시할 wafer map이 없습니다.",
    summary: (d) => `NG wafer ${d.checked}매 · 좌표 파일 없음 ${d.notFound}매 · lot_wf 불일치 ${d.lotWfMismatch}매 · 좌표 없음 ${d.noCoords}매`,
    range: (from, to) => `날짜 폴더 ${from} ~ ${to}`,
    mismatchTitle: (shown, total) => `lot_wf 불일치 wafer${total > shown ? ` (${total}매 중 ${shown}매)` : ""}`,
  },
  en: {
    open: "View anomaly wafer maps", title: (eqpCh) => `${eqpCh} anomaly wafer maps`,
    description: (main, met) => `main_step ${main || "-"} · met_step ${met || "-"} · Wafers shown as red points in the chart`,
    loading: "Loading wafer maps.", empty: "No wafer maps to display.",
    summary: (d) => `NG wafers ${d.checked} · No coordinate file ${d.notFound} · lot_wf mismatch ${d.lotWfMismatch} · No coordinates ${d.noCoords}`,
    range: (from, to) => `Date folders ${from} ~ ${to}`,
    mismatchTitle: (shown, total) => `lot_wf mismatch wafers${total > shown ? ` (${shown} of ${total})` : ""}`,
  },
  "zh-CN": {
    open: "查看异常晶圆 map", title: (eqpCh) => `${eqpCh} 异常晶圆 map`,
    description: (main, met) => `main_step ${main || "-"} · met_step ${met || "-"} · 图表中红点晶圆`,
    loading: "正在加载晶圆 map。", empty: "没有可显示的晶圆 map。",
    summary: (d) => `NG 晶圆 ${d.checked} 片 · 无坐标文件 ${d.notFound} 片 · lot_wf 不匹配 ${d.lotWfMismatch} 片 · 无坐标 ${d.noCoords} 片`,
    range: (from, to) => `日期文件夹 ${from} ~ ${to}`,
    mismatchTitle: (shown, total) => `lot_wf 不匹配晶圆${total > shown ? `（共 ${total} 片，显示 ${shown} 片）` : ""}`,
  },
}

// 차트 빨간 점(NG) wafer map을 몰림PC 이상감지와 같은 방식으로 한 번에 그린다. 좌표가 없는 wafer는 서버가 빼고 보낸다.
export function DefectWaferMapButton({ request, eqpCh }) {
  const { language } = useLanguage()
  const text = MAP_TEXT[language] ?? MAP_TEXT.ko
  const t = CLUSTER_PC_TEXT[language] ?? CLUSTER_PC_TEXT.ko
  const [open, setOpen] = useState(false)
  const query = useQuery({
    queryKey: ["defect-map", request, eqpCh],
    queryFn: ({ signal }) => fetchDefectMaps({ ...request, eqpCh, signal }),
    enabled: open,
    retry: false,
  })
  const wafers = query.data?.wafers ?? []
  const diagnostics = query.data?.diagnostics
  const mismatches = diagnostics?.lotWfMismatches ?? []
  return (
    <div className="flex justify-end px-4 pb-3" data-i18n-skip>
      <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-muted" onClick={() => setOpen(true)}>{text.open}</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="cluster-pc-history-dialog sm:max-w-6xl" data-i18n-skip>
          <DialogHeader>
            <DialogTitle>{text.title(eqpCh)}</DialogTitle>
            <DialogDescription>{text.description(request.mainSeq, request.metSeq)}</DialogDescription>
          </DialogHeader>
          <div>
            {query.isPending && <p role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{text.loading}</p>}
            {query.isError && <p role="alert" className="py-12 text-center text-sm text-destructive">{query.error.message}</p>}
            {query.data && query.data.total > query.data.limit && <p role="status" className="mb-3 text-sm text-amber-900">{t.limit(query.data.total, query.data.limit)}</p>}
            {query.isSuccess && !wafers.length && <p className="py-12 text-center text-sm text-muted-foreground">{text.empty}</p>}
            {wafers.length > 0 && <div className="cluster-pc-history-grid">
              {wafers.map((wafer, index) => <WaferCard key={`${index}|${wafer.lotWf}`} wafer={wafer} showReason={false} showFeedback={false} t={t} language={language} />)}
            </div>}
            {/* 빠진 wafer가 있으면 이유별 매수와 lot_wf 불일치 wafer 목록을 보여준다. */}
            {diagnostics && diagnostics.notFound + diagnostics.lotWfMismatch + diagnostics.noCoords > 0 && <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <p role="status">{text.summary(diagnostics)}</p>
              {mismatches.length > 0 && <div>
                <p>{text.mismatchTitle(mismatches.length, diagnostics.lotWfMismatch)}</p>
                <ul className="mt-1 space-y-0.5">
                  {mismatches.map((item) => <li key={item.lotWf}><span className="font-mono">{item.lotWf}</span> ({text.range(item.from, item.to)})</li>)}
                </ul>
              </div>}
            </div>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
