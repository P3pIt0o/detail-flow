import { describe, expect, it } from "vitest"
import { bookingLinkPath, DEFAULT_PUBLICATION_FLAGS, toPublicationFlags } from "@/lib/company/publication-shared"

describe("publication flags", () => {
  it("falls back to safe defaults when the migration is absent", () => {
    expect(toPublicationFlags(undefined)).toEqual(DEFAULT_PUBLICATION_FLAGS)
    expect(toPublicationFlags(null)).toEqual(DEFAULT_PUBLICATION_FLAGS)
  })

  it("builds the standalone booking link path", () => {
    expect(bookingLinkPath("cleanyzer")).toBe("/book/cleanyzer")
  })
})
