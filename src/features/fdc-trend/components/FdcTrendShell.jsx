import { Outlet, useLocation } from "react-router-dom"

export function FdcTrendShell() {
  const { pathname } = useLocation()
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      {/* Fade each screen in on entry. Opacity only: a transform would shift fixed elements while animating. */}
      <div key={pathname} className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 duration-300 motion-reduce:animate-none">
        <Outlet />
      </div>
    </div>
  )
}
