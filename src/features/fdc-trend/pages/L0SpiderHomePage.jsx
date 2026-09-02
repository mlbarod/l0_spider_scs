import { useQuery } from "@tanstack/react-query"
import { Activity, ArrowRight, BookOpen, CalendarClock, ChartNoAxesCombined, Gauge, GitCompareArrows, Mail, Network, Radar, ScanSearch, Users } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { fetchDashboardStats } from "../api/dashboardApi"
import { LineAnomalyDashboard } from "../components/LineAnomalyDashboard"
import { getUnderConstructionPath } from "../utils/underConstructionApps.mjs"

const spiderApps = [
  {
    icon: Activity,
    title: "Equipment Anomaly Detection",
    subtitle: "Review anomaly trends by equipment using STEP and FDC sensors.",
    category: "FDC Trend",
    href: "/self-equipment",
    active: true,
    status: "Live",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Similarity Anomaly Detection",
    subtitle: "Compare signal distributions under identical conditions to find anomalous patterns.",
    category: "Matching",
    href: "/matching-anomaly",
    active: true,
    status: "Live",
  },
  {
    icon: Network,
    title: "Common Area Anomaly Detection",
    subtitle: "Review anomalies across shared equipment and process sections in one view.",
    category: "Common",
    href: getUnderConstructionPath("common-anomaly"),
    active: true,
    status: "Planned",
  },
  {
    icon: GitCompareArrows,
    title: "Common Area Similarity Detection",
    subtitle: "Compare signal distributions by common-area EQP Model to find anomalous patterns.",
    category: "Common Matching",
    href: getUnderConstructionPath("common-commonality"),
    active: true,
    status: "Planned",
  },
  {
    icon: Gauge,
    title: "FDC Hard Limit Recommendations",
    subtitle: "Recommend Hard Limit candidates based on FDC distributions.",
    category: "Limit",
    href: getUnderConstructionPath("fdc-hard-limit"),
    active: true,
    status: "Planned",
    gridClassName: "2xl:col-start-1 2xl:row-start-2",
  },
  {
    key: "yield-hard-limit-placeholder",
    empty: true,
  },
  {
    icon: Mail,
    title: "MY EQP Registration",
    subtitle: "Register MY EQP equipment for each user.",
    category: "Registration",
    href: getUnderConstructionPath("my-eqp-registration"),
    active: true,
    status: "Planned",
  },
  {
    icon: BookOpen,
    title: "User Manual",
    subtitle: "Learn how to use SPIDER menus and features.",
    category: "Manual",
    href: "/manual",
    active: true,
    status: "Live",
  },
]

const spiderSuites = [
  {
    icon: ScanSearch,
    title: "Defect SPIDER",
    subtitle: "Explore anomalous patterns based on defect signals.",
    category: "Defect",
    href: getUnderConstructionPath("defect-spider"),
    active: true,
    status: "Planned",
  },
  {
    icon: Radar,
    title: "L1 SPIDER",
    subtitle: "Track L1 equipment and process signals.",
    category: "Level 1",
    href: getUnderConstructionPath("l1-spider"),
    active: true,
    status: "Planned",
  },
  {
    icon: Network,
    title: "L3 SPIDER",
    subtitle: "Review L3-linked metrics and anomaly flows.",
    category: "Level 3",
    href: getUnderConstructionPath("l3-spider"),
    active: true,
    status: "Planned",
  },
]

function SpiderAppCard({ app, animationIndex = 0 }) {
  const isOperating = app.status === "Live"
  const animationStyle = {
    "--spider-app-enter-delay": `${animationIndex * 55}ms`,
  }
  const content = (
    <div
      className={cn(
        "relative flex h-full min-h-[220px] flex-col rounded-[18px] border p-6 transition-all duration-300 active:scale-[0.98]",
        "cursor-pointer hover:-translate-y-1",
        isOperating
          ? "border-[#e0e0e0] bg-white hover:border-[#0066cc]"
          : "border-[#e0e0e0] bg-[#fafafc] hover:border-[#b8b8bd]",
      )}
    >
      <Badge className={cn(
        "absolute right-5 top-5 z-10 border px-2.5 py-1 text-[11px] font-semibold",
        isOperating
          ? "border-[#0066cc]/20 bg-[#0066cc]/8 text-[#0066cc]"
          : "border-[#d2d2d7] bg-[#f5f5f7] text-[#7a7a7a]",
      )}>
        {app.status ?? "In Development"}
      </Badge>

      <div className={cn(
        "mb-8 flex size-11 items-center justify-center rounded-full transition-colors duration-300",
        isOperating
          ? "bg-[#d2d2d7]/55 text-[#1d1d1f] group-hover:bg-[#0066cc] group-hover:text-white"
          : "bg-[#e8e8ed] text-[#7a7a7a]",
      )}>
        <app.icon className="size-5" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col text-left">
        <div>
          <h3 className={cn(
            "mb-2 whitespace-pre-line text-[21px] font-semibold leading-tight tracking-[-0.23px] transition-colors",
            isOperating ? "text-[#1d1d1f] group-hover:text-[#0066cc]" : "text-[#333333]",
          )}>
            {app.title}
          </h3>
          <p className={cn(
            "text-sm leading-[1.5] tracking-[-0.22px]",
            isOperating ? "text-[#55555a]" : "text-[#7a7a7a]",
          )}>{app.subtitle}</p>
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-7">
          <span className={cn("text-xs", isOperating ? "text-[#0066cc]" : "text-[#7a7a7a]")}>{app.category}</span>
          <span className={cn(
            "grid size-8 place-items-center rounded-full transition-colors",
            isOperating ? "bg-[#f5f5f7] text-[#0066cc] group-hover:bg-[#0066cc] group-hover:text-white" : "bg-[#e8e8ed] text-[#7a7a7a]",
          )}>
            <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  )

  return (
    <Link
      to={app.href}
      className="spider-app-enter group relative block h-full"
      style={animationStyle}
    >
      {content}
    </Link>
  )
}

function LatestDataCard() {
  const dashboardQuery = useQuery({
    queryKey: ["spider-line-dashboard", ""],
    queryFn: ({ signal }) => fetchDashboardStats({ signal }),
    staleTime: 60 * 1000,
    retry: false,
  })
  const latestDate = dashboardQuery.data?.latestDate ?? ""
  const displayDateTime = latestDate
    ? `${latestDate.slice(0, 10).replaceAll("-", ".")} ${latestDate.slice(11)}`
    : dashboardQuery.isPending ? "Loading" : "Unavailable"

  return (
    <aside
      className="flex min-h-11 items-center gap-3 rounded-full bg-[#fafafc] px-4 py-2"
      aria-label="Last algorithm run time"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#d2d2d7]/55 text-[#0066cc]">
        <CalendarClock className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-normal tracking-[-0.08px] text-[#7a7a7a]">Last algorithm run time</p>
        <p className="whitespace-nowrap text-xs font-semibold tabular-nums text-[#1d1d1f]">
          {displayDateTime}
        </p>
      </div>
    </aside>
  )
}

export function L0SpiderHomePage() {
  return (
    <div className="spider-home h-full min-h-0 min-w-0 overflow-y-auto bg-[#f5f5f7] text-[#1d1d1f]">
      <nav className="sticky top-0 z-40 h-11 bg-black text-white" aria-label="Global navigation">
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-5 sm:px-8">
          <Link to="/" className="text-xs font-semibold tracking-[0.08em]">SPIDER</Link>
          <div className="flex items-center gap-6 text-xs text-white/75">
            <a href="#spider-apps" className="hidden transition-colors hover:text-white sm:inline">Applications</a>
            <a href="#line-dashboard" className="hidden transition-colors hover:text-white sm:inline">Dashboard</a>
            <Link to="/manual" className="transition-colors hover:text-white">User Manual</Link>
          </div>
        </div>
      </nav>

      <div className="sticky top-11 z-30 h-[52px] border-b border-black/8 bg-[#f5f5f7]/85 backdrop-blur-[20px] backdrop-saturate-[180%]">
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-5 sm:px-8">
          <strong className="text-[17px] font-semibold tracking-[-0.37px]">SCS ETCH SPIDER</strong>
          <a href="#spider-apps" className="rounded-full bg-[#0066cc] px-4 py-2 text-xs text-white transition-transform active:scale-95">
            Get Started
          </a>
        </div>
      </div>

      <header className="flex min-h-[500px] items-center bg-white px-5 py-20 sm:px-8">
        <div className="mx-auto flex w-full max-w-[980px] flex-col items-center text-center">
          <p className="mb-5 text-sm font-semibold tracking-[-0.22px] text-[#0066cc]">L0 PROCESS INTELLIGENCE</p>
          <h1 className="max-w-4xl text-[28px] font-semibold leading-[1.07] tracking-[-0.28px] text-[#1d1d1f] min-[420px]:text-[34px] min-[641px]:text-[40px] min-[1069px]:text-[56px]">
            SCS ETCH SPIDER
          </h1>
          <p className="mt-5 max-w-2xl text-[21px] font-normal leading-[1.4] tracking-[-0.23px] text-[#333333] sm:text-[24px]">
            Start L0 process anomaly detection and Hard Limit recommendations from one screen.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#spider-apps" className="rounded-full bg-[#0066cc] px-[22px] py-[11px] text-[17px] text-white transition-colors active:scale-95 hover:bg-[#0071e3]">
              Explore Apps
            </a>
            <a href="#line-dashboard" className="rounded-full border border-[#0066cc] bg-white px-[22px] py-[10px] text-[17px] text-[#0066cc] transition-colors active:scale-95 hover:bg-[#f5f5f7]">
              View Dashboard
            </a>
          </div>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
            <LatestDataCard />
            <aside
              className="flex min-h-11 items-center gap-3 rounded-full bg-[#fafafc] px-4 py-2"
              aria-label="Development and operations contacts"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#d2d2d7]/55 text-[#0066cc]">
                <Users className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 text-left">
                <p className="text-[10px] font-normal tracking-[-0.08px] text-[#7a7a7a]">Development · Operations</p>
                <p className="whitespace-nowrap text-xs font-semibold text-[#1d1d1f]">Contacts: Sanghyeon Choi, Taehwan Kang</p>
              </div>
            </aside>
          </div>
        </div>
      </header>

      <main>
        <section id="spider-apps" className="scroll-mt-24 bg-[#f5f5f7] px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-[1440px]">
            <div className="mb-10 max-w-3xl">
              <p className="mb-3 text-sm font-semibold text-[#0066cc]">L0 SPIDER</p>
              <h2 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.37px] sm:text-[40px]">Every tool you need to detect anomalies.</h2>
              <p className="mt-4 text-[17px] leading-[1.47] tracking-[-0.37px] text-[#55555a]">
                Anomaly detection and Hard Limit recommendations powered by L0 Spider.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {spiderApps.map((app, index) => (
                app.empty
                  ? null
                  : <SpiderAppCard key={app.title} app={app} animationIndex={index} />
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#272729] px-5 py-16 text-white sm:px-8 sm:py-20">
          <div className="mx-auto max-w-[1440px]">
            <div className="mb-10 max-w-3xl">
              <p className="mb-3 text-sm font-semibold text-[#2997ff]">EXPAND THE VIEW</p>
              <h2 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.37px] sm:text-[40px]">Connected to broader processes.</h2>
              <p className="mt-4 text-[17px] leading-[1.47] tracking-[-0.37px] text-[#cccccc]">Anomaly detection apps powered by L1 and L3 data.</p>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {spiderSuites.map((app, index) => (
                <Link
                  key={app.title}
                  to={app.href}
                  className="spider-app-enter group flex min-h-[220px] flex-col rounded-[18px] border border-white/12 bg-[#2a2a2c] p-6 transition-transform hover:-translate-y-1 active:scale-[0.98]"
                  style={{ "--spider-app-enter-delay": `${(spiderApps.length + index) * 55}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-11 place-items-center rounded-full bg-[#d2d2d7]/20 text-white"><app.icon className="size-5" /></span>
                    <Badge className="border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-[#cccccc]">{app.status}</Badge>
                  </div>
                  <h3 className="mt-8 text-[21px] font-semibold leading-tight tracking-[-0.23px]">{app.title}</h3>
                  <p className="mt-2 text-sm leading-[1.5] text-[#cccccc]">{app.subtitle}</p>
                  <div className="mt-auto flex items-end justify-between pt-7 text-xs text-[#2997ff]">
                    <span>{app.category}</span>
                    <span className="grid size-8 place-items-center rounded-full bg-white/8"><ArrowRight className="size-4" /></span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="line-dashboard" className="scroll-mt-24 bg-white px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-[1440px]">
            <LineAnomalyDashboard />
          </div>
        </section>
      </main>

      <footer className="bg-[#f5f5f7] px-5 py-12 text-xs text-[#7a7a7a] sm:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-3 border-t border-[#d2d2d7] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <span>SCS ETCH SPIDER</span>
          <span>Integrated Process Anomaly Detection Service</span>
        </div>
      </footer>
    </div>
  )
}
