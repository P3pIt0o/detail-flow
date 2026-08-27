import { describe, expect, it } from "vitest"
import { withTenant } from "@/lib/tenant-link"

/**
 * Conservation du contexte tenant dans les navigations administrateur.
 *
 * Bug corrigé : depuis /admin/reservations?tenant=<slug>, l'ouverture d'une
 * réservation perdait le paramètre `?tenant=`, faisant potentiellement résoudre
 * une autre entreprise et déclenchant un notFound() (404) dans getBookingDetail().
 *
 * Ces tests vérifient la construction des URL (helper central withTenant) telle
 * qu'utilisée par les tables/liens admin. `tenant` est TOUJOURS un slug : jamais
 * un companyId. Le companyId reste résolu côté serveur (requireCompanyId) et
 * n'est jamais accepté depuis le navigateur.
 */

// Réplique exacte des constructeurs d'URL utilisés par les composants corrigés.
const bookingHref = (id: number, tenant: string | null) => withTenant(`/admin/reservations/${id}`, tenant)
const reservationsBackHref = (tenant: string | null) => withTenant("/admin/reservations", tenant)
const invoiceHref = (id: number, tenant: string | null) => withTenant(`/admin/factures/${id}`, tenant)
const clientHref = (id: number, tenant: string | null) => withTenant(`/admin/clients/${id}`, tenant)

describe("Conservation du tenant vers le détail réservation", () => {
  it("tenant=spirit → clic sur une réservation conserve ?tenant=spirit", () => {
    expect(bookingHref(42, "spirit")).toBe("/admin/reservations/42?tenant=spirit")
  })

  it("le clic sur le nom et le clic sur la ligne donnent la même URL", () => {
    // Les deux navigations (Link sur le nom + router.push sur la ligne)
    // utilisent le même constructeur : elles doivent être identiques.
    const nameClick = bookingHref(42, "spirit")
    const rowClick = bookingHref(42, "spirit")
    expect(nameClick).toBe(rowClick)
    expect(nameClick).toBe("/admin/reservations/42?tenant=spirit")
  })

  it("le lien « Retour aux réservations » conserve tenant=spirit", () => {
    expect(reservationsBackHref("spirit")).toBe("/admin/reservations?tenant=spirit")
  })
})

describe("Sans paramètre tenant, les URL restent normales", () => {
  it("réservation sans tenant : URL propre sans query", () => {
    expect(bookingHref(42, null)).toBe("/admin/reservations/42")
  })

  it("lien retour sans tenant : URL propre sans query", () => {
    expect(reservationsBackHref(null)).toBe("/admin/reservations")
  })

  it("chaîne vide traitée comme absence de tenant", () => {
    expect(bookingHref(42, "")).toBe("/admin/reservations/42")
  })
})

describe("Le tenant est un slug, jamais un companyId", () => {
  it("un slug est simplement propagé et encodé (aucune interprétation companyId)", () => {
    // Même si le navigateur envoie une valeur arbitraire, elle reste un simple
    // paramètre `tenant` (slug). Aucun paramètre `companyId` n'est produit.
    const url = bookingHref(7, "spirit")
    expect(url).not.toContain("companyId")
    expect(url).toContain("tenant=spirit")
  })

  it("aucune valeur numérique n'est jamais émise comme companyId", () => {
    // Un attaquant qui mettrait ?tenant=123 n'obtient qu'un slug "123" ;
    // le serveur le résout via l'appartenance, il n'est pas traité comme un id.
    const url = bookingHref(7, "123")
    expect(url).toBe("/admin/reservations/7?tenant=123")
    expect(url).not.toContain("companyId")
  })

  it("la valeur du tenant est URL-encodée", () => {
    expect(withTenant("/admin/reservations", "a b&c")).toBe("/admin/reservations?tenant=a%20b%26c")
  })
})

describe("Cohérence sur les autres sections admin (factures, clients)", () => {
  it("liste factures → détail conserve le tenant", () => {
    expect(invoiceHref(9, "spirit")).toBe("/admin/factures/9?tenant=spirit")
    expect(invoiceHref(9, null)).toBe("/admin/factures/9")
  })

  it("liste clients → fiche conserve le tenant", () => {
    expect(clientHref(5, "spirit")).toBe("/admin/clients/5?tenant=spirit")
    expect(clientHref(5, null)).toBe("/admin/clients/5")
  })
})
