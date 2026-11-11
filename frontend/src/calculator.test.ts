import { describe, expect, it, vi } from "vitest"
import { type Compute, type Key, type TapeEntry, displayValue, formatNumber, initialState, press } from "./calculator"
import { local } from "./test-setup"

const TOKENS: Record<string, Key> = {
  "+": "add",
  "-": "subtract",
  "*": "multiply",
  "/": "divide",
  "^": "power",
  "=": "equals",
  "%": "percent",
  r: "sqrt",
  n: "negate",
  "<": "backspace",
  c: "clear",
}

/** Presses one key per character: digits, ".", and the TOKENS above. */
async function calc(input: string, compute: Compute = local) {
  let state = initialState
  const tape: TapeEntry[] = []
  for (const ch of input) {
    const step = await press(state, TOKENS[ch] ?? (ch as Key), compute)
    state = step.state
    if (step.record) tape.push(step.record)
  }
  return { state, tape, display: displayValue(state), line: state.line }
}

describe("typing numbers", () => {
  it.each([
    ["", "0"],
    ["7", "7"],
    ["0012", "12"],
    ["1.2.3", "1.23"],
    [".5", "0.5"],
    ["0.0", "0.0"],
    ["1234.50", "1,234.50"],
    ["1234567890123", "123,456,789,012"], // capped at 12 digits
    ["123<", "12"],
    ["1<", "0"],
    ["n5", "-5"],
    ["5n", "-5"],
    ["5nn", "5"],
    ["n<", "0"],
    ["n.5", "-0.5"],
  ])("%j shows %s", async (input, want) => {
    expect((await calc(input)).display).toBe(want)
  })
})

describe("calculations", () => {
  it("evaluates a binary operation through compute", async () => {
    const compute = vi.fn(local)
    const { display, line, tape } = await calc("12+3=", compute)
    expect(compute).toHaveBeenCalledExactlyOnceWith("add", [12, 3])
    expect(display).toBe("15")
    expect(line).toBe("12 + 3 =")
    expect(tape).toEqual([{ text: "12 + 3", result: 15 }])
  })

  it("chains operations left to right, one API call per step", async () => {
    const { display, tape } = await calc("2+3*4=")
    expect(display).toBe("20")
    expect(tape.map((t) => t.text)).toEqual(["2 + 3", "5 × 4"])
  })

  it("shows the pending operation while waiting for the next operand", async () => {
    const { display, line } = await calc("12*")
    expect(line).toBe("12 ×")
    expect(display).toBe("12")
  })

  it("replaces the operator when two are pressed in a row", async () => {
    const compute = vi.fn(local)
    const { display } = await calc("5+*2=", compute)
    expect(display).toBe("10")
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it("uses the left operand when = follows an operator", async () => {
    expect((await calc("12*=")).display).toBe("144")
  })

  it("starts a new calculation when typing after a result", async () => {
    const { display, line } = await calc("2+3=7")
    expect(display).toBe("7")
    expect(line).toBe("")
  })

  it("continues from a result when an operator follows it", async () => {
    expect((await calc("2+3=*2=")).display).toBe("10")
  })

  it("does nothing on = without a pending operation", async () => {
    const compute = vi.fn(local)
    expect((await calc("5=", compute)).display).toBe("5")
    expect(compute).not.toHaveBeenCalled()
  })

  it("does not edit results with backspace", async () => {
    expect((await calc("2+3=<")).display).toBe("5")
  })

  it("negates a result", async () => {
    expect((await calc("2-3=n")).display).toBe("1")
  })

  it("computes a power", async () => {
    expect((await calc("2^10=")).display).toBe("1,024")
  })

  it("clears everything", async () => {
    const { state } = await calc("12+3c")
    expect(state).toEqual(initialState)
  })
})

describe("square root and percent", () => {
  it("takes the square root of the display", async () => {
    const { display, line, tape } = await calc("9r")
    expect(display).toBe("3")
    expect(line).toBe("√9 =")
    expect(tape).toEqual([{ text: "√9", result: 3 }])
  })

  it("uses a square root as the right operand", async () => {
    const { display, tape } = await calc("16+9r=")
    expect(display).toBe("19")
    expect(tape.map((t) => t.text)).toEqual(["√9", "16 + 3"])
  })

  it("applies the square root to the left operand right after an operator", async () => {
    expect((await calc("16+r=")).display).toBe("20")
  })

  it("adds a percentage of the left operand for + and −", async () => {
    const compute = vi.fn(local)
    const { display, tape } = await calc("50+10%=", compute)
    expect(compute).toHaveBeenNthCalledWith(1, "percentage", [10, 50])
    expect(tape[0]).toEqual({ text: "10% of 50", result: 5 })
    expect(display).toBe("55")
    expect((await calc("80-25%=")).display).toBe("60")
  })

  it("divides by 100 otherwise", async () => {
    expect((await calc("50*10%=")).display).toBe("5")
    const { display, line } = await calc("25%")
    expect(display).toBe("0.25")
    expect(line).toBe("25% =")
  })
})

describe("errors", () => {
  it("shows the service error and keeps the expression so it can be fixed", async () => {
    const after = await calc("10/0=")
    expect(after.state.error).toBe("cannot divide by zero")
    expect(after.line).toBe("10 ÷")
    expect(after.tape).toEqual([{ text: "10 ÷ 0", error: "cannot divide by zero" }])

    // typing replaces the bad divisor instead of appending to it
    const fixed = await calc("10/0=5=")
    expect(fixed.state.error).toBeNull()
    expect(fixed.display).toBe("2")
  })

  it("reports an error from a chained operator", async () => {
    const { state } = await calc("1/0+")
    expect(state.error).toBe("cannot divide by zero")
    expect(state.pending).toEqual({ a: 1, op: "divide" })
  })

  it("reports a negative square root", async () => {
    const { state, display } = await calc("4nr")
    expect(state.error).toMatch(/negative/)
    expect(display).toBe("-4")
  })

  it("clears the error on the next key", async () => {
    expect((await calc("4nr<")).state.error).toBeNull()
  })

  it("handles compute rejecting with a non-Error", async () => {
    const { state } = await calc("1+1=", () => Promise.reject("offline"))
    expect(state.error).toBe("offline")
    expect(state.pending).toEqual({ a: 1, op: "add" })
  })

  it("keeps an empty entry empty when a unary op fails right after an operator", async () => {
    const { state } = await calc("4n+r")
    expect(state.error).toMatch(/negative/)
    expect(state.entry).toBe("")
    expect((await calc("4n+r9=")).display).toBe("5")
  })
})

describe("formatNumber", () => {
  it.each([
    [0, "0"],
    [1234567.891, "1,234,567.891"],
    [-42, "-42"],
    [0.333333333333333, "0.333333333333"],
    [1e15, "1E15"],
    [123456789012345, "1.2345679E14"],
    [0.0000001, "1E-7"],
  ])("%d → %s", (n, want) => {
    expect(formatNumber(n)).toBe(want)
  })
})
