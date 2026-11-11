import type { Compute } from "./calculator"

/** Calls POST /api/{operation} on the Go service. Throws an Error with a displayable message. */
export const calculate: Compute = async (operation, operands) => {
  let res: Response
  try {
    res = await fetch(`/api/${operation}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operands }),
    })
  } catch {
    throw new Error("Can't reach the calculator service")
  }
  const body: unknown = await res.json().catch(() => null)
  if (res.ok && isObject(body) && typeof body.result === "number") return body.result
  if (isObject(body) && typeof body.error === "string") throw new Error(body.error)
  throw new Error(`Calculator service error (HTTP ${res.status})`)
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null
}
