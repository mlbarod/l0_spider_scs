import { useQuery } from "@tanstack/react-query"
import { Database, Gauge, Layers3, Loader2, RotateCcw, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { fetchDashboardStats } from "../api/dashboardApi"

const DASHBOARD_METRICS = [
  {
    key: "monitoringSensorTotal",
    label: "모니터링 센서 총합",
    description: "TL Grade · total 합계",
    unit: "개",
    icon: Database,
    accent: "border-l-sky-500",
    iconStyle: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  {
    key: "detectedPpidCount",
    label: "감지 PPID갯수",
    description: "이상 감지 고유 recipe_id",
    unit: "개",
    icon: Layers3,
    accent: "border-l-emerald-500",
    iconStyle: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "totalAnomalyCount",
    label: "전체 이상건수",
    description: "A/B · D · N · M 합계",
    unit: "건",
    icon: TriangleAlert,
    accent: "border-l-rose-500",
    iconStyle: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  {
    key: "abGradeCount",
    label: "A/B Grade",
    description: "A · B Grade ng 합계",
    unit: "건",
    icon: Gauge,
    accent: "border-l-blue-500",
    iconStyle: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    key: "dGradeCount",
    label: "D Grade",
    description: "D Grade ng 합계",
    unit: "건",
    icon: Gauge,
    accent: "border-l-amber-500",
    iconStyle: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    key: "nGradeCount",
    label: "N Grade",
    description: "N Grade ng 합계",
    unit: "건",
    icon: Gauge,
    accent: "border-l-violet-500",
    iconStyle: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    key: "mGradeCount",
    label: "M Grade",
    description: "M Grade ng 합계",
    unit: "건",
    icon: Gauge,
    accent: "border-l-fuchsia-500",
    iconStyle: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
  },
]

function formatMetricValue(value, isLoading) {
  if (isLoading) return "…"
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString("ko-KR") : "—"
}

function DashboardMetricCard({ metric, value, isLoading }) {
  const Icon = metric.icon
  return (
    <article className={cn(
      "grid min-h-[150px] grid-rows-[auto_1fr_auto] rounded-2xl border border-l-4 bg-card p-4 shadow-sm",
      metric.accent,
    )}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold leading-5 text-foreground">{metric.label}</p>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", metric.iconStyle)}>
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
      </div>
      <div className="flex items-end gap-1.5 py-3" aria-live="polite">
        <strong className="text-3xl font-semibold tracking-tight tabular-nums xl:text-4xl">
          {formatMetricValue(value, isLoading)}
        </strong>
        <span className="pb-1 text-sm font-medium text-muted-foreground">{metric.unit}</span>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">{metric.description}</p>
    </article>
  )
}

export function SpiderStatsDashboard() {
  const dashboardQuery = useQuery({
    queryKey: ["spider-dashboard-stats"],
    queryFn: ({ signal }) => fetchDashboardStats({ signal }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const metrics = dashboardQuery.data?.metrics

  return (
    <section className="mt-6 grid gap-4 border-t-2 border-border/80 pt-9" aria-busy={dashboardQuery.isFetching}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">자설비 이상감지 Dashboard</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            최신 SPIDER 통계 파일 기준 모니터링 범위와 이상감지 현황입니다.
          </p>
        </div>
        <Badge variant="outline" className="h-7 px-3">
          기준일시 {dashboardQuery.isError ? "조회 실패" : (dashboardQuery.data?.latestDate || "조회 중")}
        </Badge>
      </div>

      {dashboardQuery.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{dashboardQuery.error.message}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => dashboardQuery.refetch()}>
            <RotateCcw className="size-4" /> 다시 조회
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {DASHBOARD_METRICS.map((metric) => (
          <DashboardMetricCard
            key={metric.key}
            metric={metric}
            value={metrics?.[metric.key]}
            isLoading={dashboardQuery.isPending}
          />
        ))}
      </div>

      {dashboardQuery.isFetching && !dashboardQuery.isPending ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 최신 통계를 다시 불러오는 중입니다.
        </div>
      ) : null}
    </section>
  )
}
