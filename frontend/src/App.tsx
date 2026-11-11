import { useCallback, useEffect, useRef, useState } from "react"
import { calculate } from "./api"
import { type Compute, type Key, type TapeEntry, displayValue, formatNumber, initialState, press } from "./calculator"

type KeySpec = { key: Key; label: string; name?: string; shortcut: string; kind?: "fn" | "op" | "eq" | "wide" }

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
          const { state: next, record } = await press(stateRef.current, key, compute)
          stateRef.current = next
          setState(next)
          if (record) setTape((t) => [...t, record])
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
      if (e.target instanceof Element && e.target.closest("button:not(.key)")) return
      e.preventDefault() // also stops Enter from re-pressing a focused key
      handle(key)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handle])

  const value = state.error ?? displayValue(state)
  const valueClass = state.error ? "value error" : value.length > 14 ? "value long" : "value"

  return (
    <main className="sheet">
      <h1 className="visually-hidden">Calculator</h1>

      <section className="calculator" aria-label="Calculator">
        <div className="display">
          <div className="line" data-testid="line">
            {state.line}
          </div>
          <output className={valueClass} data-testid="value">
            {value}
          </output>
        </div>
        <div className="keypad">
          {KEYS.map((k) => (
            <button
              key={k.key}
              type="button"
              className={k.kind ? `key ${k.kind}` : "key"}
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

      <section className="tape" aria-labelledby="tape-title">
        <header>
          <h2 id="tape-title">Tape</h2>
          {tape.length > 0 && (
            <button type="button" className="tape-clear" onClick={() => setTape([])}>
              Clear tape
            </button>
          )}
        </header>
        {tape.length === 0 ? (
          <p className="empty">Every answer from the calculator service is printed here, errors included.</p>
        ) : (
          <div className="tape-scroll">
            <ol>
              {tape.map((t, i) => (
                <li key={i} className={"error" in t ? "err" : t.result < 0 ? "neg" : undefined}>
                  <span className="expr">{t.text}</span>
                  <span className="res">{"error" in t ? t.error : `= ${formatNumber(t.result)}`}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </main>
  )
}
