import { useState, type ReactNode } from "react"
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query"

import { createQueryClient } from "@/api/query-client"
import { TooltipProvider } from "@/components/ui/tooltip"

/**
 * The app's provider tree: the pinned-defaults QueryClient (AD-6) and the
 * shadcn TooltipProvider. Used by `main.tsx` and by the test render helper,
 * so tests run the production defaults. A `queryClient` may be passed in
 * (tests inspect it); otherwise one is created once per mount. The client is
 * fixed for the lifetime of the mount.
 */
export function AppProviders({
  children,
  queryClient,
}: {
  children: ReactNode
  queryClient?: QueryClient
}) {
  const [client] = useState(() => queryClient ?? createQueryClient())
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  )
}
