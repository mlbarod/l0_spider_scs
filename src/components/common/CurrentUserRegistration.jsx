import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LanguageSwitcher } from "@/i18n"
import { fetchCurrentUser, registerCurrentUser } from "@/features/fdc-trend/api/currentUserApi"

export function CurrentUserRegistration({ children }) {
  const queryClient = useQueryClient()
  const [knoxId, setKnoxId] = useState("")
  const userQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
  const registration = useMutation({
    mutationFn: registerCurrentUser,
    onSuccess: user => queryClient.setQueryData(["current-user"], user),
  })

  // Preserve file-only operation when DB features are explicitly unavailable.
  if (userQuery.error?.code === "DATA_CONNECTIONS_DISABLED") return children
  // Keep the current screen during a transient background lookup failure.
  // History writes still resolve the identity on the server for every request.
  if (userQuery.data?.knoxId && !userQuery.data.registrationRequired) return children

  const needsRegistration = !userQuery.isError && userQuery.data?.registrationRequired
  const validKnoxId = /^[A-Za-z0-9._-]{1,128}$/.test(knoxId.trim())
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6 shadow-sm" aria-labelledby="current-user-title">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">SCS ETCH SPIDER</span>
          <div className="rounded-full bg-slate-900"><LanguageSwitcher /></div>
        </div>
        <h1 id="current-user-title" className="text-xl font-semibold">User registration</h1>
        {needsRegistration ? (
          <form className="space-y-4" onSubmit={event => {
            event.preventDefault()
            if (validKnoxId && !registration.isPending) registration.mutate(knoxId.trim())
          }}>
            <p className="text-sm text-muted-foreground">Enter your knox_id only once on your first visit. You will be recognized automatically on future visits.</p>
            <div className="space-y-2">
              <label htmlFor="current-user-knox-id" className="text-sm font-medium">knox_id</label>
              <Input id="current-user-knox-id" value={knoxId} onChange={event => {
                setKnoxId(event.target.value)
                registration.reset()
              }} maxLength={128} autoComplete="username" autoCapitalize="none" spellCheck={false}
                disabled={registration.isPending} required aria-describedby="current-user-help" />
              <p id="current-user-help" className="text-xs text-muted-foreground">Use 1–128 letters, numbers, dots, underscores or hyphens. Do not enter an email address.</p>
            </div>
            {registration.isError && <p role="alert" className="text-sm text-destructive">{registration.error.message}</p>}
            <Button type="submit" className="w-full" disabled={!validKnoxId || registration.isPending}>
              {registration.isPending ? "Registering…" : "Register and continue"}
            </Button>
            {registration.error?.code === "IP_ALREADY_REGISTERED" && (
              <Button type="button" variant="outline" onClick={() => userQuery.refetch()}>Check registration again</Button>
            )}
          </form>
        ) : userQuery.isError ? (
          <div className="space-y-4">
            <p role="alert" className="text-sm text-destructive">{userQuery.error.message}</p>
            <Button disabled={userQuery.isFetching} onClick={() => userQuery.refetch()}>Check registration again</Button>
          </div>
        ) : <p role="status" className="text-sm text-muted-foreground">Checking user registration…</p>}
      </section>
    </main>
  )
}
