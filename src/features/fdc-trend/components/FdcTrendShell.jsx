import { Link, Outlet, useLocation } from "react-router-dom"

import { LanguageSwitcher } from "@/i18n"

export function FdcTrendShell() {
  const { pathname } = useLocation()
  const isHome = ["", "/fdc_trend"].includes(pathname.replace(/\/+$/, ""))

  return (
    <div className={`${isHome ? "" : "spider-app "}flex h-full min-h-0 w-full flex-col bg-background`}>
      {!isHome && (
        <nav className="z-40 h-11 shrink-0 bg-black text-white" aria-label="Global navigation">
          <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-5 sm:px-8">
            <Link to="/" className="text-xs font-semibold tracking-[0.08em]">SPIDER</Link>
            <div className="flex items-center gap-3 text-xs text-white/75 sm:gap-6">
              <a href="/#spider-apps" className="hidden transition-colors hover:text-white sm:inline">Applications</a>
              <a href="/#line-dashboard" className="hidden transition-colors hover:text-white sm:inline">Dashboard</a>
              <Link to="/manual" className="hidden transition-colors hover:text-white md:inline">User Manual</Link>
              <LanguageSwitcher />
            </div>
          </div>
        </nav>
      )}
      <Outlet />
    </div>
  )
}
