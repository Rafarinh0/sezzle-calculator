import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"
import type { Compute } from "./calculator"

afterEach(cleanup)

/** In-memory stand-in for the Go service, with the same error messages. */
export const local: Compute = async (op, [a, b]) => {
  switch (op) {
    case "add":
      return a + b
    case "subtract":
      return a - b
    case "multiply":
      return a * b
    case "divide":
      if (b === 0) throw new Error("cannot divide by zero")
      return a / b
    case "power":
      return a ** b
    case "sqrt":
      if (a < 0) throw new Error("cannot take the square root of a negative number")
      return Math.sqrt(a)
    case "percentage":
      return (a * b) / 100
  }
}
