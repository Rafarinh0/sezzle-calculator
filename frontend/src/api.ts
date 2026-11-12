import type { Compute } from "./calculator"

// Keys are applied one at a time, so a request that never answers would freeze the
// keypad (AC included). The server's own write timeout is 10 s as well.
const TIMEOUT_MS = 10_000

/** Calls POST /api/{operation} on the Go service. Throws an Error with a displayable message. */
export const calculate: Compute = async (operation, operands) => {
  let res: Response
  try {
    res = await fetch(`/api/${operation}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operands }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError"
    throw new Error(timedOut ? "The calculator service didn't answer in time" : "Can't reach the calculator service")
  }
  const body: unknown = await res.json().catch(() => null)
  if (res.ok && isObject(body) && typeof body.result === "number") return body.result
  if (isObject(body) && typeof body.error === "string") throw new Error(body.error)
  throw new Error(`Calculator service error (HTTP ${res.status})`)
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null
}
