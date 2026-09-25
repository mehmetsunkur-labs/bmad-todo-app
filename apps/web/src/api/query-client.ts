import { QueryClient } from "@tanstack/react-query"

/** The one cache key for the rendered Todo List (AD-6). */
export const TODOS_QUERY_KEY = ["todos"] as const

/**
 * The pinned AD-6 defaults, for queries and mutations alike. Hooks must not
 * override them: the list is fetched only on page load and by "Try again"
 * (`resetQueries`), never in the background, and never retried silently.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity,
        retry: false,
        networkMode: "always",
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
      },
      mutations: {
        gcTime: Infinity,
        retry: false,
        networkMode: "always",
      },
    },
  })
}
