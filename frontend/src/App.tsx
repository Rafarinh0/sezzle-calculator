import { useCallback, useEffect, useRef, useState } from "react"
import { calculate } from "./api"
import { type Compute, type Key, type TapeEntry, displayValue, formatNumber, initialState, press } from "./calculator"

type Kind = "digit" | "fn" | "op" | "eq" | "wide"
type KeySpec = { key: Key; label: string; name?: string; shortcut: string; kind?: Kind }

// Layout order of the 4-column keypad; "=" spans two rows and "0" two columns.
const KEYS: KeySpec[] = [
  { key: "clear", label: "AC", name: "All clear", shortcut: "Escape", kind: "fn" },
  { key: "backspace", label: "⌫", name: "Backspace", shortcut: "Backspace", kind: "fn" },
  { key: "percent", label: "%", name: "Percent", shortcut: "%", kind: "fn" },
  { key: "divide", label: "÷", name: "Divide", shortcut: "/", kind: "op" },
  { key: "sqrt", label: "√", name: "Square root", shortcut: "R", kind: "fn" },
  { key: "power", label: "xʸ", name: "Power", shortcut: "^", kind: "fn" },
  { key: "negate", label: "±", name: "Change sign", shortcut: "F9", kind: "fn" },
  { key: "multiply", label: "×", name: "Multiply", shortcut: "*", kind: "op" },
  { key: "7", label: "7", shortcut: "7" },
  { key: "8", label: "8", shortcut: "8" },
  { key: "9", label: "9", shortcut: "9" },
  { key: "subtract", label: "−", name: "Subtract", shortcut: "-", kind: "op" },
  { key: "4", label: "4", shortcut: "4" },
  { key: "5", label: "5", shortcut: "5" },
  { key: "6", label: "6", shortcut: "6" },
  { key: "add", label: "+", name: "Add", shortcut: "+", kind: "op" },
  { key: "1", label: "1", shortcut: "1" },
  { key: "2", label: "2", shortcut: "2" },
  { key: "3", label: "3", shortcut: "3" },
  { key: "equals", label: "=", name: "Equals", shortcut: "Enter", kind: "eq" },
  { key: "0", label: "0", shortcut: "0", kind: "wide" },
  { key: ".", label: ".", name: "Decimal point", shortcut: "." },
]

const KEYBOARD: Record<string, Key> = {
  ...Object.fromEntries(KEYS.map((k) => [k.shortcut, k.key])),
  r: "sqrt",
  x: "multiply",
  ",": ".",
  "=": "equals",
  Delete: "clear",
}

// One complete style per kind: Tailwind resolves conflicting classes by CSS
// order, not class order, so kinds don't override a shared base.
const KEY_BASE =
  "cursor-pointer font-mono leading-none transition-colors duration-100 ease-out focus-visible:outline-2 focus-visible:-outline-offset-4"
const ON_PAPER = "bg-paper text-ink hover:bg-shade-hover active:bg-shade-down focus-visible:outline-ink"
const KEY_STYLE: Record<Kind, string> = {
  digit: `${ON_PAPER} text-digit`,
  wide: `${ON_PAPER} text-digit col-span-2`,
  op: `${ON_PAPER} text-glyph`,
  fn: "bg-shade text-ink text-label hover:bg-shade-hover active:bg-shade-down focus-visible:outline-ink",
  eq: "row-span-2 bg-ink text-paper text-glyph hover:bg-ink-hover active:bg-ink-hover focus-visible:outline-paper",
}

export default function App({ compute = calculate }: { compute?: Compute }) {
  const [state, setState] = useState(initialState)
  const [tape, setTape] = useState<TapeEntry[]>([])
  const stateRef = useRef(state)
  const queue = useRef(Promise.resolve())

  // Keys are applied one at a time, in order: a key pressed while the API is
  // answering waits for that answer instead of racing it or being dropped.
  const handle = useCallback(
    (key: Key) => {
      queue.current = queue.current
        .then(async () => {
          const { state: next, records } = await press(stateRef.current, key, compute)
          stateRef.current = next
          setState(next)
          if (records.length > 0) setTape((t) => [...t, ...records])
        })
        .catch(console.error) // press() reports API failures itself; this only guards the queue
    },
    [compute],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = KEYBOARD[e.key]
      if (!key || e.ctrlKey || e.metaKey || e.altKey) return
      // Leave other buttons (like "Clear tape") to their native Enter behaviour.
      if (e.target instanceof Element && e.target.closest("button:not([data-key])")) return
      e.preventDefault() // also stops Enter from re-pressing a focused key
      handle(key)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handle])

  const value = state.error ?? displayValue(state)
  const valueStyle = state.error
    ? "block pt-3 font-sans text-lg/[1.3] text-red first-letter:uppercase"
    : `flex items-end justify-end tracking-tight wrap-anywhere ${value.length > 14 ? "text-display-long" : "text-display"}`

  return (
    <main className="grid grid-cols-1 overflow-hidden rounded-sm border border-rule bg-paper sm:grid-cols-[22rem_17rem]">
      <h1 className="sr-only">Calculator</h1>

      <section className="border-b border-rule sm:border-r sm:border-b-0" aria-label="Calculator">
        <div className="px-5 pt-6 pb-4 text-right font-mono tabular-nums">
          <div className="min-h-5 truncate text-sm/5 text-ink-soft" data-testid="line">
            {state.line}
          </div>
          <output className={`min-h-14 ${valueStyle}`} data-testid="value">
            {value}
          </output>
        </div>
        <div className="grid auto-rows-[3.5rem] grid-cols-4 gap-px border-t border-rule bg-rule sm:auto-rows-[3.75rem]">
          {KEYS.map((k) => (
            <button
              key={k.key}
              type="button"
              data-key
              className={`${KEY_BASE} ${KEY_STYLE[k.kind ?? "digit"]}`}
              aria-label={k.name}
              aria-keyshortcuts={k.shortcut}
              title={k.name && `${k.name} (${k.shortcut})`}
              onClick={() => handle(k.key)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </section>

      {/* On desktop the calculator sets the sheet's height (contain: size) and the tape scrolls within it. */}
      <section className="flex flex-col sm:[contain:size]" aria-labelledby="tape-title">
        <header className="flex items-baseline justify-between px-5 pt-5 pb-3">
          <h2 id="tape-title" className="text-sm font-semibold">
            Tape
          </h2>
          {tape.length > 0 && (
            <button
              type="button"
              className="-mx-1 -my-0.5 cursor-pointer px-1 py-0.5 text-[0.8125rem] text-ink-soft underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
              onClick={() => setTape([])}
            >
              Clear tape
            </button>
          )}
        </header>
        {tape.length === 0 ? (
          <p className="max-w-[30ch] px-5 pb-5 text-sm leading-normal text-ink-soft sm:pb-0">
            Every answer from the calculator service is printed here, errors included.
          </p>
        ) : (
          // column-reverse keeps the scroll pinned to the newest line, like paper leaving the printer
          <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto px-5 pb-4 max-sm:max-h-56">
            <ol className="font-mono text-sm tabular-nums">
              {tape.map((t, i) => (
                // flex-wrap: a long error moves under its expression instead of squeezing it
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                  <span className="text-ink-soft wrap-anywhere">{t.text}</span>
                  <span
                    className={`ml-auto text-right wrap-anywhere ${"error" in t ? "font-sans text-red" : t.result < 0 ? "text-red" : ""}`}
                  >
                    {"error" in t ? t.error : `= ${formatNumber(t.result)}`}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </main>
  )
}
