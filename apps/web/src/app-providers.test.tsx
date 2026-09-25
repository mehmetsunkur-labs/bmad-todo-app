import { useQueryClient } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AppProviders } from "./app-providers"

describe("AppProviders", () => {
  it("provides a QueryClient with the pinned AD-6 defaults when none is passed", () => {
    let client: ReturnType<typeof useQueryClient> | undefined
    function Probe() {
      client = useQueryClient()
      return null
    }
    render(
      <AppProviders>
        <Probe />
      </AppProviders>
    )

    const { queries, mutations } = client!.getDefaultOptions()
    expect(queries).toEqual({
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
      networkMode: "always",
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    })
    expect(mutations).toEqual({
      gcTime: Infinity,
      retry: false,
      networkMode: "always",
    })
  })
})
