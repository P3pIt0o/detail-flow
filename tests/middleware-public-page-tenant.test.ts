import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { middleware } from "@/middleware"

function run(url: string) {
  const req = new NextRequest(url, { headers: { host: new URL(url).host } })
  const res = middleware(req)
  const rewrite = res.headers.get("x-middleware-rewrite")
  return {
    res,
    rewrite: rewrite ? new URL(rewrite) : null,
    tenantHeader: res.headers.get("x-middleware-request-x-tenant-slug"),
    kindHeader: res.headers.get("x-middleware-request-x-tenant-kind"),
  }
}

describe("middleware — /p/<slug> conserve le tenant dans le rewrite interne", () => {
  const previous = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "detailflow.fr"
  })
  afterEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = previous
  })

  it("/p/syl-net-auto injecte tenant=syl-net-auto sans redirection", () => {
    const { res, rewrite, tenantHeader } = run("https://www.detailflow.fr/p/syl-net-auto")
    expect(res.headers.get("location")).toBeNull()
    expect(rewrite?.pathname).toBe("/")
    expect(rewrite?.searchParams.get("tenant")).toBe("syl-net-auto")
    expect(tenantHeader).toBe("syl-net-auto")
  })

  it("/p/syl-net-auto/reservation conserve tenant=syl-net-auto", () => {
    const { rewrite, tenantHeader } = run("https://www.detailflow.fr/p/syl-net-auto/reservation")
    expect(rewrite?.pathname).toBe("/reservation")
    expect(rewrite?.searchParams.get("tenant")).toBe("syl-net-auto")
    expect(tenantHeader).toBe("syl-net-auto")
  })

  it("fonctionne pour tout tenant (aucun slug codé en dur) et garde les autres paramètres", () => {
    const { rewrite } = run("https://www.detailflow.fr/p/autre-garage/formules?embed=1&view=both")
    expect(rewrite?.pathname).toBe("/formules")
    expect(rewrite?.searchParams.get("tenant")).toBe("autre-garage")
    expect(rewrite?.searchParams.get("embed")).toBe("1")
    expect(rewrite?.searchParams.get("view")).toBe("both")
  })

  it("un ?tenant= injecté par le navigateur ne peut pas basculer vers un autre tenant", () => {
    const { rewrite, tenantHeader } = run(
      "https://www.detailflow.fr/p/syl-net-auto/reservation?tenant=victime",
    )
    expect(rewrite?.searchParams.getAll("tenant")).toEqual(["syl-net-auto"])
    expect(tenantHeader).toBe("syl-net-auto")
  })

  it("sous-domaine tenant : comportement inchangé (pas de ?tenant= ajouté)", () => {
    const { rewrite, tenantHeader, kindHeader } = run("https://syl-net-auto.detailflow.fr/reservation")
    expect(rewrite).toBeNull()
    expect(kindHeader).toBe("tenant")
    expect(tenantHeader).toBe("syl-net-auto")
  })

  it("?tenant= historique continue de fonctionner hors /p/", () => {
    const { tenantHeader } = run("http://localhost:3000/reservation?tenant=syl-net-auto")
    expect(tenantHeader).toBe("syl-net-auto")
  })
})
