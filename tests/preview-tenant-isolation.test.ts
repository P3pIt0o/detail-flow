import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { middleware } from "@/middleware"

// Isole la page de son formulaire client (chaîne d'imports next/font hors runtime Next).
vi.mock("@/components/super-admin/create-company-form", () => ({ CreateCompanyForm: () => null }))

/**
 * Non-régression PURE (aucun accès DB) : résolution du tenant par le middleware
 * sur Preview / production, et neutralisation de NEXT_PUBLIC_ROOT_DOMAIN dans
 * le Super Admin sur Preview.
 */

const ROOT = "detailflow.fr"
const PREVIEW_HOST = "detail-flow-git-feat-x.vercel.app"

function run(url: string, host: string) {
  const req = new NextRequest(url, { headers: { host } })
  const res = middleware(req)
  return {
    slug: res.headers.get("x-middleware-request-x-tenant-slug"),
    kind: res.headers.get("x-middleware-request-x-tenant-kind"),
    rewrite: res.headers.get("x-middleware-rewrite"),
    location: res.headers.get("location"),
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("middleware — Preview *.vercel.app", () => {
  it("CAS 1 : /admin sans ?tenant= → aucun tenant par défaut injecté", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
    const r = run(`https://${PREVIEW_HOST}/admin`, PREVIEW_HOST)
    expect(r.kind).toBe("preview")
    expect(r.slug).toBe("")
  })

  it("CAS 2 : /admin?tenant=detailflow → tenant explicite conservé", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
    expect(run(`https://${PREVIEW_HOST}/admin?tenant=detailflow`, PREVIEW_HOST).slug).toBe("detailflow")
  })

  it("CAS 3 : /?tenant=detailflow → site public DetailFlow", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
    const r = run(`https://${PREVIEW_HOST}/?tenant=detailflow`, PREVIEW_HOST)
    expect(r.slug).toBe("detailflow")
    expect(r.rewrite).toBeNull()
  })

  it("CAS 4 : /?tenant=cleanyzer → tenant explicite Cleanyzer", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
    expect(run(`https://${PREVIEW_HOST}/?tenant=cleanyzer`, PREVIEW_HOST).slug).toBe("cleanyzer")
  })

  it.each([
    "/api/factures/42/pdf",
    "/api/admin/logo",
    "/api/admin/service-image",
    "/api/admin/sms-test",
    "/api/gallery-upload",
    "/api/photo-gallery-upload",
    "/api/quote-photos/view",
  ])("CAS 5 : API membre %s sans tenant explicite → pas de défaut detailflow", (p) => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
    expect(run(`https://${PREVIEW_HOST}${p}`, PREVIEW_HOST).slug).toBe("")
  })

  it("CAS 5b : API membre avec ?tenant= explicite → tenant explicite conservé", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
    expect(run(`https://${PREVIEW_HOST}/api/factures/42/pdf?tenant=cleanyzer`, PREVIEW_HOST).slug).toBe(
      "cleanyzer",
    )
  })

  it.each([
    "/api/track",
    "/api/company-logo",
    "/api/gallery-image",
    "/api/service-image",
    "/api/photo-gallery-image",
    "/api/quote-photos/upload",
    "/api/factures-like-but-not",
  ])("CAS 12 : API publique %s → comportement inchangé (défaut conservé)", (p) => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
    expect(run(`https://${PREVIEW_HOST}${p}`, PREVIEW_HOST).slug).toBe("detailflow")
  })

  it("CAS 13 : / sans ?tenant= → vitrine marketing", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
    const r = run(`https://${PREVIEW_HOST}/`, PREVIEW_HOST)
    expect(r.rewrite).toContain("/marketing")
    expect(r.slug).toBe("detailflow")
  })
})

describe("middleware — Production (inchangé)", () => {
  it("CAS 7 : www.detailflow.fr → racine, aucun tenant, y compris /api/factures", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
    expect(run(`https://www.${ROOT}/`, `www.${ROOT}`).kind).toBe("root")
    expect(run(`https://www.${ROOT}/api/factures/1/pdf`, `www.${ROOT}`).slug).toBe("")
    expect(run(`https://www.${ROOT}/admin`, `www.${ROOT}`).slug).toBe("")
  })

  it("CAS 8 : sous-domaine tenant → slug du sous-domaine, y compris API membre", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
    const host = `cleanyzer.${ROOT}`
    expect(run(`https://${host}/`, host).slug).toBe("cleanyzer")
    expect(run(`https://${host}/admin`, host).slug).toBe("cleanyzer")
    expect(run(`https://${host}/api/factures/1/pdf`, host).slug).toBe("cleanyzer")
  })

  it("CAS 9 : domaine personnalisé → tenant résolu, y compris API membre", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
    const r = run("https://spiritacs.com/api/factures/1/pdf", "spiritacs.com")
    expect(r.kind).toBe("tenant")
    expect(r.slug).toBeTruthy()
    expect(r.slug).not.toBe("")
  })
})

describe("Super Admin — NEXT_PUBLIC_ROOT_DOMAIN", () => {
  async function renderNewCompanyRootDomain() {
    vi.resetModules()
    const { default: NewCompanyPage } = await import("@/app/super-admin/companies/new/page")
    const tree = NewCompanyPage() as { props: { children: unknown[] } }
    const find = (node: unknown): string | null | undefined => {
      if (!node || typeof node !== "object") return undefined
      const n = node as { props?: { rootDomain?: string | null; children?: unknown } }
      if (n.props && "rootDomain" in n.props) return n.props.rootDomain
      const children = n.props?.children
      for (const c of Array.isArray(children) ? children : [children]) {
        const found = find(c)
        if (found !== undefined) return found
      }
      return undefined
    }
    return find(tree)
  }

  it("CAS 10 : Preview → rootDomain null (aucun lien production)", async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
    expect(await renderNewCompanyRootDomain()).toBeNull()
  })

  it("CAS 11 : Production → NEXT_PUBLIC_ROOT_DOMAIN utilisé normalement", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
    expect(await renderNewCompanyRootDomain()).toBe(ROOT)
  })

  it("CAS 10/11 : app/super-admin/page.tsx neutralise ROOT_DOMAIN uniquement sur Preview", () => {
    const src = readFileSync(path.join(process.cwd(), "app/super-admin/page.tsx"), "utf8")
    expect(src).toMatch(
      /const ROOT_DOMAIN =\s*process\.env\.VERCEL_ENV === "preview" \? null : \(process\.env\.NEXT_PUBLIC_ROOT_DOMAIN \?\? null\)/,
    )
  })
})
