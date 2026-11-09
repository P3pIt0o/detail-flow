import { describe, it, expect, vi } from "vitest"
import { attachTiltMotion } from "@/components/digital-card/tilt-card"

/** L45 — C4 (revue métier) : l'effet réel de TiltCard, exécuté avec un window/document simulés. */

type Style = { transform?: string; opacity?: string }
const el = () => ({ style: {} as Style, addEventListener: vi.fn(), removeEventListener: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 60 }) })

function setup({ reduced, ios }: { reduced: boolean; ios?: { answer: Promise<string> } }) {
  const nodes = { wrap: el(), card: el(), shadow: el(), spec: el(), holo: el() }
  const win = {
    matchMedia: vi.fn(() => ({ matches: reduced })),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    DeviceOrientationEvent: ios ? { requestPermission: () => ios.answer } : function () {},
  }
  const doc = { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() }
  let enable: (() => void) | null = null
  const onPermission = vi.fn((e: (() => void) | null) => (enable = e))
  const cleanup = attachTiltMotion(
    { ...nodes, spec: () => nodes.spec as never, holo: () => nodes.holo as never } as never,
    win as never,
    doc as never,
    onPermission,
  )
  return { nodes, win, doc, onPermission, cleanup, enable: () => enable }
}

const orientationListeners = (win: { addEventListener: ReturnType<typeof vi.fn> }) =>
  win.addEventListener.mock.calls.filter(([t]) => t === "deviceorientation")

describe("TiltCard — prefers-reduced-motion", () => {
  it("aucune boucle rAF, aucun listener d'orientation ni souris, carte laissée à plat", () => {
    const { nodes, win, doc, onPermission } = setup({ reduced: true })
    expect(win.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)")
    expect(win.requestAnimationFrame).not.toHaveBeenCalled()
    expect(orientationListeners(win)).toHaveLength(0)
    expect(nodes.wrap.addEventListener).not.toHaveBeenCalled()
    expect(doc.addEventListener).not.toHaveBeenCalled()
    expect(onPermission).not.toHaveBeenCalled()
    expect(nodes.card.style.transform).toBeUndefined() // reste la transform initiale (à plat) du rendu serveur
  })

  it("témoin : sans mouvement réduit, la boucle et l'orientation démarrent", () => {
    const { win } = setup({ reduced: false })
    expect(win.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(orientationListeners(win)).toHaveLength(1)
  })
})

describe("TiltCard — iOS", () => {
  it("bouton proposé, aucun listener avant le toucher", () => {
    const { win, onPermission } = setup({ reduced: false, ios: { answer: Promise.resolve("granted") } })
    expect(onPermission).toHaveBeenCalledWith(expect.any(Function))
    expect(orientationListeners(win)).toHaveLength(0)
  })

  it("refus → freeze() : boucle arrêtée, carte à plat sans flottement, pas d'orientation", async () => {
    const { nodes, win, onPermission, enable } = setup({ reduced: false, ios: { answer: Promise.resolve("denied") } })
    enable()!()
    expect(onPermission).toHaveBeenLastCalledWith(null)
    await Promise.resolve()
    await Promise.resolve()
    expect(win.cancelAnimationFrame).toHaveBeenCalled()
    expect(nodes.card.style.transform).toBe("translate3d(0, 0px, 0) rotateX(0deg) rotateY(0deg)")
    expect(orientationListeners(win)).toHaveLength(0)
  })

  it("demande rejetée → freeze() également", async () => {
    const { nodes, win, enable } = setup({ reduced: false, ios: { answer: Promise.reject(new Error("x")) } })
    enable()!()
    await Promise.resolve()
    await Promise.resolve()
    expect(win.cancelAnimationFrame).toHaveBeenCalled()
    expect(nodes.card.style.transform).toBe("translate3d(0, 0px, 0) rotateX(0deg) rotateY(0deg)")
  })

  it("accord → écoute de l'orientation", async () => {
    const { win, enable } = setup({ reduced: false, ios: { answer: Promise.resolve("granted") } })
    enable()!()
    await Promise.resolve()
    await Promise.resolve()
    expect(orientationListeners(win)).toHaveLength(1)
  })
})
