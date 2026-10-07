import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildPostCreationRedirect, parseDesiredPlan, withDesiredPlan } from "@/lib/pricing/desired-plan"
import { SELF_SERVICE_LICENSE_PLAN } from "@/lib/pricing/plans"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

describe("parseDesiredPlan — intention commerciale uniquement", () => {
  it("/demarrer?plan=PRO => PRO", () => expect(parseDesiredPlan("PRO")).toBe("PRO"))
  it("/demarrer?plan=BUSINESS => BUSINESS", () => expect(parseDesiredPlan("BUSINESS")).toBe("BUSINESS"))
  it("/demarrer?plan=ENTERPRISE => null", () => expect(parseDesiredPlan("ENTERPRISE")).toBeNull())
  it("/demarrer?plan=FREE => null", () => expect(parseDesiredPlan("FREE")).toBeNull())
  it("/demarrer?plan=HACK => null", () => expect(parseDesiredPlan("HACK")).toBeNull())
  it("valeurs non-string / casse / tableau", () => {
    expect(parseDesiredPlan(undefined)).toBeNull()
    expect(parseDesiredPlan(null)).toBeNull()
    expect(parseDesiredPlan("pro")).toBeNull()
    expect(parseDesiredPlan({ plan: "PRO" })).toBeNull()
    expect(parseDesiredPlan(["BUSINESS", "PRO"])).toBe("BUSINESS")
  })
  it("withDesiredPlan n'ajoute rien sans intention", () => {
    expect(withDesiredPlan("/admin/creer-mon-espace", null)).toBe("/admin/creer-mon-espace")
    expect(withDesiredPlan("/admin/creer-mon-espace", "PRO")).toBe("/admin/creer-mon-espace?plan=PRO")
  })
})

describe("redirection après création — tenant conservé", () => {
  it("PRO => /admin/abonnement?tenant=<slug>&plan=PRO", () => {
    expect(buildPostCreationRedirect("autocare", "booking", "PRO")).toBe("/admin/abonnement?tenant=autocare&plan=PRO")
  })
  it("BUSINESS => /admin/abonnement?tenant=<slug>&plan=BUSINESS", () => {
    expect(buildPostCreationRedirect("autocare", "", "BUSINESS")).toBe(
      "/admin/abonnement?tenant=autocare&plan=BUSINESS",
    )
  })
  it("sans plan => redirection historique inchangée", () => {
    expect(buildPostCreationRedirect("autocare", "booking", null)).toBe("/admin?tenant=autocare&start=booking")
    expect(buildPostCreationRedirect("autocare", "", null)).toBe("/admin?tenant=autocare")
  })
  it("le slug est encodé (jamais d'injection de paramètre)", () => {
    expect(buildPostCreationRedirect("a&plan=X", "", "PRO")).not.toContain("&plan=X&")
  })
})

describe("création du tenant — toujours FREE", () => {
  const actions = code("app/admin/creer-mon-espace/actions.ts")
  const provision = code("lib/company/provision.ts")

  it("le plan self-service reste FREE", () => expect(SELF_SERVICE_LICENSE_PLAN).toBe("FREE"))

  it("desiredPlan PRO/BUSINESS n'est jamais transmis au provisioning", () => {
    const call = actions.slice(actions.indexOf("provisionCompanyForUser({"))
    const args = call.slice(0, call.indexOf("})"))
    expect(args).not.toMatch(/desiredPlan|licensePlan|plan\s*:/)
  })

  it("aucun licensePlan lu depuis FormData", () => {
    expect(actions).not.toMatch(/formData\.get\(["']licensePlan["']\)/)
    expect(actions).not.toMatch(/licensePlan\s*[:=]\s*desiredPlan/)
  })

  it("desiredPlan est revalidé côté serveur", () => {
    expect(actions).toMatch(/parseDesiredPlan\(formData\.get\(["']desiredPlan["']\)\)/)
    expect(actions).toMatch(/buildPostCreationRedirect\(createdSlug, intent, desiredPlan\)/)
  })

  it("le provisioning utilise la constante self-service", () => {
    expect(provision).toMatch(/SELF_SERVICE_LICENSE_PLAN/)
  })
})

describe("onboarding — intention conservée, rien d'autre", () => {
  const shared = code("lib/onboarding/shared.ts")
  const onboarding = code("app/demarrer/onboarding.tsx")
  const demarrer = code("app/demarrer/page.tsx")
  const createPage = code("app/admin/creer-mon-espace/page.tsx")

  it("l'état onboarding stocke uniquement desiredPlan (aucun ID sensible)", () => {
    expect(shared).toMatch(/desiredPlan\?: DesiredPlan \| null/)
    expect(shared).not.toMatch(/companyId|priceId|customerId|licensePlan/i)
  })
  it("/demarrer lit ?plan via parseDesiredPlan et le propage", () => {
    expect(demarrer).toMatch(/parseDesiredPlan\(/)
    expect(onboarding).toMatch(/withDesiredPlan\("\/admin\/creer-mon-espace", desiredPlan\)/)
  })
  it("utilisateur déjà rattaché : aucun second espace, redirection tenant vers abonnement", () => {
    expect(createPage).toMatch(/if \(membership\)/)
    expect(createPage).toMatch(/withTenant\("\/admin\/abonnement", membership\.slug\)/)
  })
})

describe("Mon abonnement — mise en avant visuelle uniquement", () => {
  const page = code("app/admin/(dashboard)/abonnement/page.tsx")

  it("plan lu via parseDesiredPlan (PRO/BUSINESS seulement)", () => {
    expect(page).toMatch(/parseDesiredPlan\(planParam\)/)
    expect(page).toMatch(/desiredPlan === plan/)
    expect(page).toMatch(/Votre choix/)
  })
  it("aucun Checkout automatique, aucune écriture DB depuis le query param", () => {
    expect(page).not.toMatch(/startSaasCheckout\s*\(/)
    expect(page).not.toMatch(/createSubscriptionCheckout\s*\(/)
    expect(page).not.toMatch(/redirect\([^)]*checkout/i)
    expect(page).not.toMatch(/\.(insert|update)\(/)
  })
})

describe("aucun Stripe / Connect touché par le lot", () => {
  it("les nouveaux fichiers n'importent pas Stripe", () => {
    for (const f of ["lib/pricing/desired-plan.ts", "app/demarrer/page.tsx", "app/admin/creer-mon-espace/page.tsx"]) {
      expect(code(f), f).not.toMatch(/from ["'](stripe|@\/lib\/stripe|@\/lib\/billing|@\/lib\/customer-subscriptions)/)
    }
  })
})
