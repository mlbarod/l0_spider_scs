import { useState } from "react"
import { QueryClientProvider } from "@tanstack/react-query"

import { Toaster } from "@/components/ui/sonner"
import { createQueryClient } from "@/lib/queryClient"
import { ThemeProvider } from "@/lib/theme"
import { LanguageProvider } from "@/i18n"

export function AppProviders({ children }) {
  const [queryClient] = useState(() => createQueryClient())

  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="light" defaultColor="sky">
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </QueryClientProvider>
    </LanguageProvider>
  )
}
