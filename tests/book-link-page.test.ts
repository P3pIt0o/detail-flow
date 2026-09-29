import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * /book/[slug] — protection SERVEUR : 404 sauf entreprise active + lien activé.
 * DB et drapeaux mockés : aucun accès réseau.
 */

const companyRow = vi.fn()
const getPublicationFlags = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => companyRow() }) }) }),
  },
}))
vi.mock("@/lib/company/publication", () => ({
  getPublicationFlags: (id: number) => getPublicationFlags(id),
}))

import BookingLinkPage from "@/app/book/[slug]/page"

const base = { id: 42, name: "Cleanyzer", slug: "cleanyzer", city: null, logoUrl: null, brandPrimary: null }
const render = () => BookingLinkPage({ params: Promise.resolve({ slug: "cleanyzer" }) })

beforeEach(() => {
  companyRow.mockReset()
  getPublicationFlags.mockReset()
})

describe("/book/[slug]", () => {
  it("tenant actif + booking ON => accessible", async () => {
    companyRow.mockReturnValue([{ ...base, status: "ACTIVE" }])
    getPublicationFlags.mockResolvedValue({ customSitePublished: true, bookingLinkEnabled: true })
    await expect(render()).resolves.toBeTruthy()
    expect(getPublicationFlags).toHaveBeenCalledWith(42)
  })

  it("custom site OFF + booking ON => /book accessible", async () => {
    companyRow.mockReturnValue([{ ...base, status: "ACTIVE" }])
    getPublicationFlags.mockResolvedValue({ customSitePublished: false, bookingLinkEnabled: true })
    await expect(render()).resolves.toBeTruthy()
  })

  it("booking OFF => 404", async () => {
    companyRow.mockReturnValue([{ ...base, status: "ACTIVE" }])
    getPublicationFlags.mockResolvedValue({ customSitePublished: true, bookingLinkEnabled: false })
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it.each(["SUSPENDED", "ARCHIVED"])("tenant %s + booking ON => 404", async (status) => {
    companyRow.mockReturnValue([{ ...base, status }])
    getPublicationFlags.mockResolvedValue({ customSitePublished: true, bookingLinkEnabled: true })
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("slug inconnu => 404", async () => {
    companyRow.mockReturnValue([])
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(getPublicationFlags).not.toHaveBeenCalled()
  })
})
