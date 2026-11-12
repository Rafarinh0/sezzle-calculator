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
    tape.push(...step.records)
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

describe("square root", () => {
  it("shows √ and waits for the number after it", async () => {
    const compute = vi.fn(local)
    const { display, state } = await calc("r9", compute)
    expect(display).toBe("√9")
    expect(state.root).toBe("√")
    expect(compute).not.toHaveBeenCalled() // evaluated only when the number is used
  })

  it("evaluates on =", async () => {
    const compute = vi.fn(local)
    const { display, line, tape } = await calc("r9=", compute)
    expect(compute).toHaveBeenCalledExactlyOnceWith("sqrt", [9])
    expect(display).toBe("3")
    expect(line).toBe("√9 =")
    expect(tape).toEqual([{ text: "√9", result: 3 }])
  })

  it("works as the right operand, with one tape line per API call", async () => {
    const { display, line, tape } = await calc("16+r9=")
    expect(display).toBe("19")
    expect(line).toBe("16 + 3 =")
    expect(tape).toEqual([
      { text: "√9", result: 3 },
      { text: "16 + 3", result: 19 },
    ])
  })

  it("evaluates before the next operator", async () => {
    const { display, line } = await calc("r16+")
    expect(line).toBe("4 +")
    expect(display).toBe("4")
    expect((await calc("r16+1=")).display).toBe("5")
  })

  it("keeps the expression line while waiting", async () => {
    const { display, line } = await calc("16+r")
    expect(line).toBe("16 +")
    expect(display).toBe("√")
  })

  it("multiplies when a typed number comes right before it, like 9√4", async () => {
    const { display, tape } = await calc("9r4=")
    expect(display).toBe("18")
    expect(tape.map((t) => t.text)).toEqual(["√4", "9 × 2"])
  })

  it("starts a new calculation after a result", async () => {
    const { display, line } = await calc("2+2=r9=")
    expect(display).toBe("3")
    expect(line).toBe("√9 =")
  })

  it("starts fresh on the initial 0 instead of multiplying by it", async () => {
    expect((await calc("0r9=")).display).toBe("3")
  })

  it("ignores =, operators and % until a number follows √", async () => {
    const compute = vi.fn(local)
    const { display, state } = await calc("r=+%", compute)
    expect(display).toBe("√")
    expect(state.root).toBe("√")
    expect(compute).not.toHaveBeenCalled()
  })

  it("ignores a second √", async () => {
    expect((await calc("rr9=")).display).toBe("3")
  })

  it("accepts decimals", async () => {
    expect((await calc("r.")).display).toBe("√0.")
    expect((await calc("r.25=")).display).toBe("0.5")
  })

  it("backspace edits the number, then takes the √ back", async () => {
    expect((await calc("r94<")).display).toBe("√9")
    expect((await calc("r9<")).display).toBe("√")
    const undone = await calc("5+r<")
    expect(undone.state.root).toBe("")
    expect(undone.display).toBe("5")
    expect(undone.line).toBe("5 +")
    expect((await calc("r<")).display).toBe("0")
  })

  it("feeds a percent", async () => {
    const { display, tape } = await calc("50+r100%=")
    expect(display).toBe("55")
    expect(tape.map((t) => t.text)).toEqual(["√100", "10% of 50", "50 + 5"])
  })

  it("is negated by ± typed before it", async () => {
    const { display, line } = await calc("nr9=")
    expect(display).toBe("-3")
    expect(line).toBe("-√9 =")
    const after = await calc("10+nr9=")
    expect(after.display).toBe("7")
    expect(after.tape.map((t) => t.text)).toEqual(["√9", "10 + -3"])
  })

  it("is negated by ± pressed under it, instead of asking for the root of a negative", async () => {
    expect((await calc("r9n")).display).toBe("-√9")
    expect((await calc("r9nn")).display).toBe("√9")
    expect((await calc("r9n=")).display).toBe("-3")
  })

  it("backspace on a bare −√ goes back to the minus sign", async () => {
    expect((await calc("nr<")).display).toBe("-0")
    expect((await calc("nr<5=")).display).toBe("-5")
  })

  it("multiplies a % result before it, like a typed number", async () => {
    const { display, tape } = await calc("50+10%r4=")
    expect(display).toBe("110") // (50 + 5) × √4, left to right
    expect(tape.map((t) => t.text)).toEqual(["10% of 50", "50 + 5", "√4", "55 × 2"])
  })

  it("replaces an operand that just failed instead of multiplying it", async () => {
    const { display, tape } = await calc("10/0=r4=")
    expect(display).toBe("5")
    expect(tape.map((t) => t.text)).toEqual(["10 ÷ 0", "√4", "10 ÷ 2"])
  })

  it("starts fresh after backspacing the operand away", async () => {
    const cleared = await calc("12*5<")
    expect(cleared.state.entry).toBe("")
    expect(cleared.display).toBe("12")
    expect(cleared.line).toBe("12 ×")
    expect((await calc("12*5<r4=")).display).toBe("24")
  })
})

describe("percent", () => {
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

  it("keeps the √ after a failed call so the number under it can be retyped", async () => {
    const sqrtOffline: Compute = (op, x) => (op === "sqrt" && x[0] === 4 ? Promise.reject(new Error("offline")) : local(op, x))
    const failed = await calc("10+r4=", sqrtOffline)
    expect(failed.state.error).toBe("offline")
    expect(failed.display).toBe("√4")
    expect(failed.line).toBe("10 +")
    expect(failed.tape).toEqual([{ text: "√4", error: "offline" }])

    expect((await calc("10+r4=9=", sqrtOffline)).display).toBe("13")
  })

  it("does not start the √ when the multiplication before it fails", async () => {
    const { state } = await calc("1/0r")
    expect(state.error).toBe("cannot divide by zero")
    expect(state.root).toBe("")
  })

  it("clears the error on the next key", async () => {
    expect((await calc("1/0=<")).state.error).toBeNull()
  })

  it("lets backspace edit an operand that just failed", async () => {
    const offline: Compute = () => Promise.reject(new Error("offline"))
    const edited = await calc("10/25=<", offline)
    expect(edited.display).toBe("2")
    expect(edited.state.overwrite).toBe(false)
    // a digit still replaces it outright
    expect((await calc("10/25=7", offline)).display).toBe("7")
  })

  it("does not edit a failed computed operand such as 1e-12", async () => {
    const offline: Compute = (op, x) => (op === "multiply" ? Promise.reject(new Error("offline")) : local(op, x))
    // 0.0000000001% = 1e-12 becomes the right operand, then × fails
    const failed = await calc("5*0.0000000001%=", offline)
    expect(failed.state.entry).toMatch(/e-12$/)
    const { state } = await calc("5*0.0000000001%=<", offline)
    expect(state.entry).toBe(failed.state.entry) // slicing "1e-12" would leave "1e-1"
  })

  it("handles compute rejecting with a non-Error", async () => {
    const { state } = await calc("1+1=", () => Promise.reject("offline"))
    expect(state.error).toBe("offline")
    expect(state.pending).toEqual({ a: 1, op: "add" })
  })

  it("keeps an empty entry empty when % fails right after an operator", async () => {
    const failing: Compute = (op, x) => (op === "percentage" ? Promise.reject(new Error("offline")) : local(op, x))
    const { state } = await calc("4+%", failing)
    expect(state.error).toBe("offline")
    expect(state.entry).toBe("")
    expect((await calc("4+%2=", failing)).display).toBe("6")
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
