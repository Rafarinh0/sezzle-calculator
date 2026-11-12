import { afterEach, describe, expect, it, vi } from "vitest"
import { calculate } from "./api"

function stubFetch(impl: () => Promise<Response>) {
  const fetch = vi.fn(impl)
  vi.stubGlobal("fetch", fetch)
  return fetch
}

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("calculate", () => {
  it("POSTs the operands and returns the result", async () => {
    const fetch = stubFetch(() => json(200, { result: 5 }))
    await expect(calculate("add", [2, 3])).resolves.toBe(5)
    expect(fetch).toHaveBeenCalledWith("/api/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"operands":[2,3]}',
      signal: expect.any(AbortSignal),
    })
  })

  it("gives up on a request that doesn't answer in time", async () => {
    stubFetch(() => Promise.reject(new DOMException("signal timed out", "TimeoutError")))
    await expect(calculate("add", [1, 1])).rejects.toThrow("The calculator service didn't answer in time")
  })

  it("throws the service's error message", async () => {
    stubFetch(() => json(422, { error: "cannot divide by zero" }))
    await expect(calculate("divide", [1, 0])).rejects.toThrow("cannot divide by zero")
  })

  it("throws a readable error when the service is unreachable", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")))
    await expect(calculate("add", [1, 1])).rejects.toThrow("Can't reach the calculator service")
  })

  it("throws on a response that isn't JSON", async () => {
    stubFetch(() => Promise.resolve(new Response("Bad Gateway", { status: 502 })))
    await expect(calculate("add", [1, 1])).rejects.toThrow("Calculator service error (HTTP 502)")
  })

  it("throws on a 200 without a numeric result", async () => {
    stubFetch(() => json(200, { result: "5" }))
    await expect(calculate("add", [2, 3])).rejects.toThrow("HTTP 200")
  })
})
