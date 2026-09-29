import { describe, expect, it } from "vitest"
import { withTenant } from "@/lib/tenant-link"

/**
 * Conservation du contexte tenant dans tout le module CRM Prospects.
 *
 * Bug corrigé : depuis /admin/leads?tenant=<slug>, l'ouverture d'une fiche
 * prospect perdait le paramètre `?tenant=`. requireCompanyMember() retombait
 * alors sur un autre tenant via l'appartenance, puis getLeadDetail(companyId,
 * leadId) ne trouvait pas le prospect et renvoyait notFound() (404).
 *
 * Tous les liens internes du CRM passent désormais par le helper central
 * withTenant(). `tenant` est TOUJOURS un slug (jamais un companyId, résolu
 * côté serveur). Ces tests répliquent les constructeurs d'URL réels.
 */

// Répliques exactes des constructeurs utilisés par les composants/pages corrigés.
const leadHref = (id: number, tenant: string | null) => withTenant(`/admin/leads/${id}`, tenant)
const leadsBackHref = (tenant: string | null) => withTenant("/admin/leads", tenant)
const kpiHref = (query: string, tenant: string | null) => withTenant(`/admin/leads?${query}`, tenant)
const pageHref = (page: number, tenant: string | null) => withTenant(`/admin/leads?page=${page}`, tenant)
const customRequestHref = (extId: string, tenant: string | null) =>
  withTenant(`/admin/demandes/${extId}`, tenant)
const bookingHref = (bookingId: number, tenant: string | null) =>
  withTenant(`/admin/reservations/${bookingId}`, tenant)

describe("Fiche prospect : conservation du tenant", () => {
  it("clic sur un prospect Spirit conserve ?tenant=spirit-acs", () => {
    expect(leadHref(12, "spirit-acs")).toBe("/admin/leads/12?tenant=spirit-acs")
  })

  it("lien « Retour aux prospects » conserve le tenant", () => {
    expect(leadsBackHref("spirit-acs")).toBe("/admin/leads?tenant=spirit-acs")
  })

  it("création d'un prospect : redirection vers la fiche conserve le tenant", () => {
    // router.push(withTenant(`/admin/leads/${res.leadId}`, tenant))
    expect(leadHref(99, "spirit-acs")).toBe("/admin/leads/99?tenant=spirit-acs")
  })

  it("« Voir le prospect » (doublon) conserve le tenant", () => {
    expect(leadHref(7, "spirit-acs")).toBe("/admin/leads/7?tenant=spirit-acs")
  })

  it("suppression d'un prospect : retour à la liste conserve le tenant", () => {
    // router.push(withTenant("/admin/leads", tenant))
    expect(leadsBackHref("spirit-acs")).toBe("/admin/leads?tenant=spirit-acs")
  })
})

describe("KPI prospects : query existante + tenant en &", () => {
  it("status=NEW → &tenant, jamais un second ?", () => {
    const url = kpiHref("status=NEW", "spirit-acs")
    expect(url).toBe("/admin/leads?status=NEW&tenant=spirit-acs")
    expect(url).not.toContain("?tenant")
    expect(url.match(/\?/g)?.length).toBe(1)
  })

  it("due=1 conserve le tenant", () => {
    expect(kpiHref("due=1", "spirit-acs")).toBe("/admin/leads?due=1&tenant=spirit-acs")
  })

  it("status=APPOINTMENT_BOOKED conserve le tenant", () => {
    expect(kpiHref("status=APPOINTMENT_BOOKED", "spirit-acs")).toBe(
      "/admin/leads?status=APPOINTMENT_BOOKED&tenant=spirit-acs",
    )
  })

  it("status=CLIENT conserve le tenant", () => {
    expect(kpiHref("status=CLIENT", "spirit-acs")).toBe("/admin/leads?status=CLIENT&tenant=spirit-acs")
  })
})

describe("Pagination : conservation du tenant", () => {
  it("page 2 conserve le tenant en &", () => {
    expect(pageHref(2, "spirit-acs")).toBe("/admin/leads?page=2&tenant=spirit-acs")
  })

  it("pagination sans tenant reste propre", () => {
    expect(pageHref(2, null)).toBe("/admin/leads?page=2")
  })
})

describe("Liens croisés : demande & réservation", () => {
  it("lien vers la demande source conserve le tenant", () => {
    expect(customRequestHref("req-abc", "spirit-acs")).toBe("/admin/demandes/req-abc?tenant=spirit-acs")
  })

  it("lien vers le rendez-vous lié conserve le tenant", () => {
    expect(bookingHref(55, "spirit-acs")).toBe("/admin/reservations/55?tenant=spirit-acs")
  })

  it("liens croisés sans tenant restent propres", () => {
    expect(customRequestHref("req-abc", null)).toBe("/admin/demandes/req-abc")
    expect(bookingHref(55, null)).toBe("/admin/reservations/55")
  })
})

describe("Tenant null : comportement historique inchangé", () => {
  it("fiche prospect sans tenant : URL propre", () => {
    expect(leadHref(12, null)).toBe("/admin/leads/12")
  })

  it("retour liste sans tenant : URL propre", () => {
    expect(leadsBackHref(null)).toBe("/admin/leads")
  })

  it("KPI sans tenant : URL propre avec un seul ?", () => {
    expect(kpiHref("status=NEW", null)).toBe("/admin/leads?status=NEW")
  })

  it("chaîne vide traitée comme absence de tenant", () => {
    expect(leadHref(12, "")).toBe("/admin/leads/12")
  })
})
