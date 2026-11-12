import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import App from "./App"
import { local } from "./test-setup"

const value = () => screen.getByTestId("value")
const tape = () => within(screen.getByRole("region", { name: "Tape" }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("App", () => {
  it("calculates with the on-screen keys and prints the result on the tape", async () => {
    const user = userEvent.setup()
    render(<App compute={local} />)
    for (const name of ["1", "2", "Add", "3", "Equals"]) {
      await user.click(screen.getByRole("button", { name }))
    }
    expect(value()).toHaveTextContent("15")
    expect(screen.getByTestId("line")).toHaveTextContent("12 + 3 =")
    expect(tape().getByText("12 + 3")).toBeInTheDocument()
    expect(tape().getByText("= 15")).toBeInTheDocument()
  })

  it("accepts keyboard input", async () => {
    const user = userEvent.setup()
    render(<App compute={local} />)
    await user.keyboard("7*6{Enter}")
    expect(value()).toHaveTextContent("42")
    await user.keyboard("{Escape}")
    expect(value()).toHaveTextContent("0")
  })

  it("ignores shortcuts combined with modifier keys", async () => {
    const user = userEvent.setup()
    render(<App compute={local} />)
    await user.keyboard("{Control>}5{/Control}")
    expect(value()).toHaveTextContent("0")
  })

  it("shows errors from the service on the display and the tape", async () => {
    const user = userEvent.setup()
    render(<App compute={local} />)
    await user.keyboard("1/0{Enter}")
    expect(value()).toHaveTextContent("cannot divide by zero")
    expect(tape().getByText("1 ÷ 0")).toBeInTheDocument()
    expect(tape().getByText("cannot divide by zero")).toBeInTheDocument()
  })

  it("clears the tape without touching the display", async () => {
    const user = userEvent.setup()
    render(<App compute={local} />)
    await user.keyboard("2+2{Enter}")
    await user.click(screen.getByRole("button", { name: "Clear tape" }))
    expect(tape().queryByText("2 + 2")).not.toBeInTheDocument()
    expect(value()).toHaveTextContent("4")
  })

  it("lets Enter activate other buttons instead of pressing =", async () => {
    const user = userEvent.setup()
    render(<App compute={local} />)
    await user.keyboard("2+2{Enter}5+")
    screen.getByRole("button", { name: "Clear tape" }).focus()
    await user.keyboard("{Enter}")
    expect(tape().queryByText("2 + 2")).not.toBeInTheDocument()
    expect(screen.getByTestId("line")).toHaveTextContent("5 +")
  })

  it("applies keys pressed during a request after the answer arrives, in order", async () => {
    const user = userEvent.setup()
    const pending: ((n: number) => void)[] = []
    const slow = vi.fn(() => new Promise<number>((r) => pending.push(r)))
    render(<App compute={slow} />)
    await user.keyboard("2+3+4{Enter}") // "4" and "=" are typed while 2 + 3 is still in flight
    expect(value()).toHaveTextContent("3")
    pending[0](5)
    await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(2))
    expect(slow).toHaveBeenLastCalledWith("add", [5, 4])
    pending[1](9)
    await vi.waitFor(() => expect(value()).toHaveTextContent("9"))
  })

  it("calls the real API client by default", async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ result: 9 })))
    vi.stubGlobal("fetch", fetch)
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard("r81")
    expect(value()).toHaveTextContent("√81")
    await user.keyboard("{Enter}")
    expect(await screen.findByText("= 9")).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith("/api/sqrt", expect.objectContaining({ body: '{"operands":[81]}' }))
  })
})
