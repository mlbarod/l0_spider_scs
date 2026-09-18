import { ArrowLeft, Construction } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { getUnderConstructionApp } from "../utils/underConstructionApps.mjs"

const FALLBACK_APP = Object.freeze({
  title: "SPIDER App",
  category: "Development",
})

export function SpiderComingSoonPage({ appId: configuredAppId = "" }) {
  const { appId: routeAppId } = useParams()
  const app = getUnderConstructionApp(configuredAppId || routeAppId) ?? FALLBACK_APP

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <header className="shrink-0 border-b bg-card px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{app.title}</h1>
              <Badge variant="outline">{app.category}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              The service schedule will be announced later.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              SPIDER Home
            </Link>
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 place-items-center overflow-y-auto px-6 py-8">
        <div className="grid max-w-md justify-items-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-sm">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
            <Construction className="size-6 text-primary" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h2 className="text-base font-semibold">Under Construction</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              This app is awaiting development. The service will be available here when development is complete.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
