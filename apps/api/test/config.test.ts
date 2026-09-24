import { describe, expect, it } from "vitest"

import { ConfigError, loadConfig } from "../src/config"

const DATABASE_URL = "postgres://todos:todos@localhost:5432/todos"

describe("loadConfig", () => {
  it("applies defaults for PORT and LOG_LEVEL", () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      DATABASE_URL,
      PORT: 3000,
      LOG_LEVEL: "info",
    })
  })

  it("parses explicit values", () => {
    expect(
      loadConfig({ DATABASE_URL, PORT: "8081", LOG_LEVEL: "debug" })
    ).toEqual({ DATABASE_URL, PORT: 8081, LOG_LEVEL: "debug" })
  })

  it.each([
    [{ DATABASE_URL, PORT: "abc" }, "PORT"],
    [{ DATABASE_URL, PORT: "70000" }, "PORT"],
    [{ PORT: "3000" }, "DATABASE_URL"],
    [{ DATABASE_URL: "not a url" }, "DATABASE_URL"],
    [{ DATABASE_URL: "https://example.com/db" }, "DATABASE_URL"],
    [{ DATABASE_URL, LOG_LEVEL: "loud" }, "LOG_LEVEL"],
  ])("rejects %o naming %s", (env, variable) => {
    expect(() => loadConfig(env)).toThrow(ConfigError)
    try {
      loadConfig(env)
    } catch (err) {
      expect((err as ConfigError).issues.map((i) => i.variable)).toContain(
        variable
      )
      expect((err as Error).message).toContain(variable)
    }
  })
})
