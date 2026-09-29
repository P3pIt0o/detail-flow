import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  bookingLinkPath,
  DEFAULT_PUBLICATION_FLAGS,
  isBookingLinkAccessible,
  PRE_MIGRATION_PUBLICATION_FLAGS,
  toPublicationFlags,
} from "@/lib/company/publication-shared"

const ON = { customSitePublished: true, bookingLinkEnabled: true }
const OFF = { customSitePublished: true, bookingLinkEnabled: false }

describe("publication flags", () => {
  it("booking link is OFF by default (absent migration / unreadable row)", () => {
    expect(DEFAULT_PUBLICATION_FLAGS.bookingLinkEnabled).toBe(false)
    expect(toPublicationFlags(undefined).bookingLinkEnabled).toBe(false)
    expect(toPublicationFlags(null).bookingLinkEnabled).toBe(false)
    expect(toPublicationFlags({ bookingLinkEnabled: "true" }).bookingLinkEnabled).toBe(false)
  })

  it("custom site is opt-in once migrated; historical behaviour only before migration", () => {
    expect(DEFAULT_PUBLICATION_FLAGS.customSitePublished).toBe(false)
    expect(toPublicationFlags(undefined).customSitePublished).toBe(false)
    expect(toPublicationFlags({ customSitePublished: "true" }).customSitePublished).toBe(false)
    expect(PRE_MIGRATION_PUBLICATION_FLAGS).toEqual({ customSitePublished: true, bookingLinkEnabled: false })
  })

  it("migration defaults both columns to false and only touches the two publication columns", () => {
    const sql = readFileSync(join(process.cwd(), "scripts/booking-link-publication-migration.sql"), "utf8")
    const statements = sql.split("\n").filter((l) => /^\s*ALTER TABLE/.test(l))
    expect(statements.some((l) => /"bookingLinkEnabled" boolean NOT NULL DEFAULT false/.test(l))).toBe(true)
    expect(statements.some((l) => /"customSitePublished" boolean NOT NULL DEFAULT false/.test(l))).toBe(true)
    expect(statements.every((l) => /"companies"/.test(l))).toBe(true)
    expect(statements.every((l) => /customSitePublished|bookingLinkEnabled/.test(l))).toBe(true)
    const executable = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
    expect(executable).not.toMatch(/\b(DROP|DELETE|TRUNCATE|INSERT)\b/)
    expect(executable).not.toMatch(/DEFAULT true/)
  })

  it("active tenant + booking ON => accessible", () => {
    expect(isBookingLinkAccessible("ACTIVE", ON)).toBe(true)
    expect(isBookingLinkAccessible("BETA", ON)).toBe(true)
  })

  it("booking OFF => inaccessible", () => {
    expect(isBookingLinkAccessible("ACTIVE", OFF)).toBe(false)
  })

  it("suspended / archived / unknown status => inaccessible even with booking ON", () => {
    expect(isBookingLinkAccessible("SUSPENDED", ON)).toBe(false)
    expect(isBookingLinkAccessible("ARCHIVED", ON)).toBe(false)
    expect(isBookingLinkAccessible(null, ON)).toBe(false)
    expect(isBookingLinkAccessible("WHATEVER", ON)).toBe(false)
  })

  it("custom site OFF does not close the booking link", () => {
    expect(isBookingLinkAccessible("ACTIVE", { customSitePublished: false, bookingLinkEnabled: true })).toBe(true)
  })

  it("builds the standalone booking link path", () => {
    expect(bookingLinkPath("cleanyzer")).toBe("/book/cleanyzer")
  })
})
