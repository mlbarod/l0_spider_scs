import { ArrowLeft, CalendarClock, Construction } from "lucide-react"
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
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto bg-background">
      <main className="grid min-h-full flex-1 place-items-center px-4 py-10 sm:px-6">
        <section className="w-full max-w-2xl rounded-3xl border border-border/70 bg-card p-8 text-center shadow-sm sm:p-12">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Construction className="size-8" aria-hidden="true" />
          </div>

          <Badge variant="outline" className="mt-6">{app.category}</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Under Construction
          </h1>
          <p className="mt-4 text-lg font-medium text-foreground">{app.title}</p>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            This app is awaiting development. The service will be available here when development is complete.
          </p>

          <div className="mx-auto mt-7 flex max-w-md items-center justify-center gap-3 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
            <span>The service schedule will be announced later.</span>
          </div>

          <Button type="button" variant="outline" className="mt-8" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              SPIDER Home
            </Link>
          </Button>
        </section>
      </main>
    </div>
  )
}
