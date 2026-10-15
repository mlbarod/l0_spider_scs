import { useState } from "react"
import { QueryClientProvider } from "@tanstack/react-query"

import { Toaster } from "@/components/ui/sonner"
import { createQueryClient } from "@/lib/queryClient"
import { ThemeProvider } from "@/lib/theme"
import { LanguageProvider } from "@/i18n"
import { CurrentUserRegistration } from "./CurrentUserRegistration"

export function AppProviders({ children }) {
  const [queryClient] = useState(() => createQueryClient())

  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="light" defaultColor="sky">
          <CurrentUserRegistration>{children}</CurrentUserRegistration>
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </QueryClientProvider>
    </LanguageProvider>
  )
}
