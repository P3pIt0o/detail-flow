import { describe, expect, it } from "vitest"
import {
  buildLocalBusinessJsonLd,
  buildServiceJsonLd,
  LOCAL_BUSINESS_ID_FRAGMENT,
} from "@/lib/seo/structured-data"

const HOME = "https://example.test/p/cleanyzer"

describe("LocalBusiness @id (opt-in)", () => {
  it("n'émet aucun @id par défaut (autres tenants inchangés)", () => {
    const ld = buildLocalBusinessJsonLd({ name: "X", url: HOME })
    expect(ld).not.toHaveProperty("@id")
    const svc = buildServiceJsonLd({ name: "S", url: `${HOME}/s`, provider: { name: "X", url: HOME } })
    expect(svc.provider).not.toHaveProperty("@id")
  })

  it("relie Service.provider au même @id que l'établissement", () => {
    const id = `${HOME}${LOCAL_BUSINESS_ID_FRAGMENT}`
    const ld = buildLocalBusinessJsonLd({ id, name: "Cleanyzer", url: HOME })
    const svc = buildServiceJsonLd({
      name: "S",
      url: `${HOME}/s`,
      provider: { name: "Cleanyzer", url: HOME, id },
    })
    expect(ld["@id"]).toBe(id)
    expect((svc.provider as Record<string, unknown>)["@id"]).toBe(id)
    expect(ld).not.toHaveProperty("aggregateRating")
  })
})
