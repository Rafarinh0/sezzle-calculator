// Calculator state machine. Every key goes through press(); arithmetic is never
// done here: it's delegated to `compute`, which in the app calls the Go API.

export type BinaryOp = "add" | "subtract" | "multiply" | "divide" | "power"
export type Operation = BinaryOp | "sqrt" | "percentage"
export type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
export type Key = Digit | "." | BinaryOp | "sqrt" | "percent" | "negate" | "equals" | "backspace" | "clear"

export type Compute = (operation: Operation, operands: number[]) => Promise<number>

export type State = {
  /** Operand being typed, or a result. Empty right after an operator or √. */
  entry: string
  /** Left operand and operator waiting for the right operand. */
  pending: { a: number; op: BinaryOp } | null
  /** entry holds a result: the next digit starts a new number instead of appending. */
  overwrite: boolean
  /** √ was pressed: the number typed next is under a square root, evaluated when it's used. */
  root: boolean
  /** Expression shown above the main display, e.g. "12 ×" or "12 × 3 =". */
  line: string
  error: string | null
}

/** One API call, as printed on the tape. */
export type TapeEntry = { text: string; result: number } | { text: string; error: string }

/** A key's outcome: the new state, plus one tape entry per API call it made (√ then + makes two). */
export type Step = { state: State; records: TapeEntry[] }

export const MAX_DIGITS = 12

export const SYMBOL: Record<BinaryOp, string> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
  power: "^",
}

export const initialState: State = { entry: "0", pending: null, overwrite: false, root: false, line: "", error: null }

const done = (state: State): Step => ({ state, records: [] })

export async function press(prev: State, key: Key, compute: Compute): Promise<Step> {
  const s = { ...prev, error: null } // any key dismisses the last error
  switch (key) {
    case ".":
      return done(typeDot(s))
    case "backspace":
      return done(backspace(s))
    case "negate":
      return done(negate(s))
    case "clear":
      return done(initialState)
    case "sqrt":
      return startRoot(s, compute)
    // These use the number on the display, so a pending √ is evaluated first.
    case "equals":
      return withRoot(s, compute, (t) => equals(t, compute))
    case "percent":
      return withRoot(s, compute, (t) => percent(t, compute))
    case "add":
    case "subtract":
    case "multiply":
    case "divide":
    case "power":
      return withRoot(s, compute, (t) => chooseOperator(t, key, compute))
    default:
      return done(typeDigit(s, key))
  }
}

function typeDigit(s: State, d: Digit): State {
  if (s.overwrite) return startNumber(s, d)
  if (s.entry === "0" || s.entry === "-0") return { ...s, entry: s.entry.replace("0", d) }
  if (s.entry.replace(/\D/g, "").length >= MAX_DIGITS) return s
  return { ...s, entry: s.entry + d }
}

function typeDot(s: State): State {
  if (s.overwrite || s.entry === "") return startNumber(s, "0.")
  if (s.entry.includes(".")) return s
  return { ...s, entry: s.entry + "." }
}

// A new number after a finished calculation also starts a new expression line.
function startNumber(s: State, entry: string): State {
  return { ...s, entry, overwrite: false, line: s.pending ? s.line : "" }
}

function backspace(s: State): State {
  if (s.root && s.entry === "") return { ...s, root: false, entry: s.pending ? "" : "0" } // takes the √ back
  if (s.overwrite || s.entry === "") return s // results aren't editable
  const entry = s.entry.slice(0, -1)
  const empty = entry === "" || entry === "-"
  return { ...s, entry: empty ? (s.root ? "" : "0") : entry }
}

// Sign change is input editing, like typing a minus sign, so it stays client-side.
function negate(s: State): State {
  if (s.entry === "") return { ...s, entry: "-0" }
  return { ...s, entry: s.entry.startsWith("-") ? s.entry.slice(1) : "-" + s.entry }
}

/** The number on the display. */
function current(s: State): number {
  return s.entry === "" ? (s.pending?.a ?? 0) : Number(s.entry)
}

// √ waits for the number typed after it, like Google's calculator: √ 9 = 3.
async function startRoot(s: State, compute: Compute): Promise<Step> {
  if (s.root) return done(s) // one √ at a time
  const fresh = s.entry === "0" && !s.pending // the starting 0, not a typed number
  if (!s.overwrite && s.entry !== "" && !fresh) {
    // A number typed right before √ multiplies it: 9 √ 4 = 18.
    const step = await chooseOperator(s, "multiply", compute)
    return step.state.error ? step : { ...step, state: { ...step.state, root: true } }
  }
  return done({ ...s, entry: "", overwrite: false, root: true, line: s.pending ? s.line : "" })
}

// Evaluates a pending √ on the typed number, then runs `then` with the result in its place.
// With nothing typed after √ yet, the key is ignored: it's still waiting for a number.
async function withRoot(s: State, compute: Compute, then: (s: State) => Promise<Step>): Promise<Step> {
  if (!s.root) return then(s)
  if (s.entry === "") return done(s)
  const x = Number(s.entry)
  const text = `√${formatNumber(x)}`
  const root = await run(s, text, compute, "sqrt", [x], (r) => ({
    ...s,
    root: false,
    entry: String(r),
    overwrite: true,
    line: s.pending ? s.line : `${text} =`,
  }))
  if (root.state.error) return root
  const next = await then(root.state)
  return { state: next.state, records: [...root.records, ...next.records] }
}

async function chooseOperator(s: State, op: BinaryOp, compute: Compute): Promise<Step> {
  if (s.pending && s.entry !== "") {
    // "12 × 3 +" finishes 12 × 3 first, then waits for the next operand.
    const { a, op: prevOp } = s.pending
    const b = Number(s.entry)
    return run(s, expression(a, prevOp, b), compute, prevOp, [a, b], (r) => waitFor(s, r, op))
  }
  // No second operand yet: start a calculation, or swap the operator just chosen.
  return done(waitFor(s, current(s), op))
}

function waitFor(s: State, a: number, op: BinaryOp): State {
  return { ...s, pending: { a, op }, entry: "", overwrite: false, line: `${formatNumber(a)} ${SYMBOL[op]}` }
}

async function equals(s: State, compute: Compute): Promise<Step> {
  if (!s.pending) return done(s)
  const { a, op } = s.pending
  const b = current(s) // "12 × =" squares, like most calculators
  const text = expression(a, op, b)
  return run(s, text, compute, op, [a, b], (r) => showResult(s, r, null, `${text} =`))
}

// With + or − pending, x% means x percent of the left operand (50 + 10% = 55).
// Otherwise it means x / 100 (50 × 10% = 5).
async function percent(s: State, compute: Compute): Promise<Step> {
  const x = current(s)
  const ofLeft = s.pending && (s.pending.op === "add" || s.pending.op === "subtract")
  const base = ofLeft ? s.pending!.a : 1
  const text = ofLeft ? `${formatNumber(x)}% of ${formatNumber(base)}` : `${formatNumber(x)}%`
  return run(s, text, compute, "percentage", [x, base], (r) =>
    showResult(s, r, s.pending, s.pending ? s.line : `${text} =`),
  )
}

function showResult(s: State, r: number, pending: State["pending"], line: string): State {
  return { ...s, entry: String(r), pending, overwrite: true, line }
}

// Calls the API and records the call on the tape. On failure the state is kept
// as it was (so "10 ÷ 0" can be fixed by typing a new divisor) with the error shown.
async function run(
  s: State,
  text: string,
  compute: Compute,
  operation: Operation,
  operands: number[],
  next: (result: number) => State,
): Promise<Step> {
  try {
    const result = await compute(operation, operands)
    return { state: next(result), records: [{ text, result }] }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return { state: { ...s, overwrite: s.entry !== "", error }, records: [{ text, error }] }
  }
}

function expression(a: number, op: BinaryOp, b: number): string {
  return `${formatNumber(a)} ${SYMBOL[op]} ${formatNumber(b)}`
}

const plain = new Intl.NumberFormat("en-US", { maximumSignificantDigits: MAX_DIGITS })
const scientific = new Intl.NumberFormat("en-US", { notation: "scientific", maximumSignificantDigits: 8 })

/** Formats a result: grouped, at most 12 significant digits, scientific when huge or tiny. */
export function formatNumber(n: number): string {
  const abs = Math.abs(n)
  return abs !== 0 && (abs >= 10 ** MAX_DIGITS || abs < 1e-6) ? scientific.format(n) : plain.format(n)
}

/** What the main display shows: √ and the number after it, the typed entry, or a formatted result. */
export function displayValue(s: State): string {
  if (s.root) return "√" + formatTyped(s.entry)
  if (s.entry === "" || s.overwrite) return formatNumber(current(s))
  return formatTyped(s.entry)
}

/** A typed number as typed, with grouping: "1234.50" → "1,234.50". */
function formatTyped(entry: string): string {
  if (entry === "") return ""
  const [int, frac] = entry.split(".")
  const sign = int.startsWith("-") ? "-" : ""
  const grouped = plain.format(Number(int.replace("-", "")))
  return sign + grouped + (frac === undefined ? "" : "." + frac)
}
