import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** Retire les commentaires pour tester le CODE réel (pas les commentaires). */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")

const actions = read("app/(site)/demande/actions.ts")
const form = read("components/custom-request-form.tsx")
const adminDetail = read("app/admin/(dashboard)/demandes/[id]/page.tsx")
const schema = read("lib/db/schema.ts")

/**
 * Réplique EXACTE du helper `str` de l'action (trim + slice(max)) pour valider
 * la sémantique de normalisation du numéro sans monter une base de données.
 */
const str = (v: string | null, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : ""

const FIELD = "customerLegalRegistrationNumber"

describe("Demande spéciale — numéro d'entreprise (normalisation)", () => {
  it("valeur présente : enregistrée après trim", () => {
    const normalized = str("  BE0123456789  ", 60) || null
    expect(normalized).toBe("BE0123456789")
  })

  it("chaîne vide (ou espaces) : enregistrée en null", () => {
    expect(str("", 60) || null).toBeNull()
    expect(str("   ", 60) || null).toBeNull()
    expect(str(null, 60) || null).toBeNull()
  })

  it("longueur limitée à 60 caractères", () => {
    const long = "9".repeat(200)
    const normalized = str(long, 60) || null
    expect(normalized).toHaveLength(60)
  })
})

describe("Demande spéciale — câblage serveur", () => {
  const code = stripComments(actions)

  it("lit le champ via le helper str limité à 60", () => {
    expect(code).toMatch(
      new RegExp(`const ${FIELD} = str\\(formData\\.get\\("${FIELD}"\\), 60\\)`),
    )
  })

  it("insère la valeur ou null (jamais de chaîne vide)", () => {
    expect(code).toMatch(new RegExp(`${FIELD}: ${FIELD} \\|\\| null`))
  })

  it("ajoute le numéro aux detailLines de l'email quand présent", () => {
    // push() n'ajoute la ligne que si la valeur est non vide.
    expect(code).toMatch(new RegExp(`push\\("[^"]*identifiant légal", ${FIELD}\\)`))
  })

  it("aucune validation / déduction pays ou type d'entreprise", () => {
    // Le champ ne pilote aucune logique conditionnelle.
    expect(code).not.toMatch(new RegExp(`if\\s*\\([^)]*${FIELD}`))
    expect(code).not.toMatch(new RegExp(`${FIELD}[^\\n]*(country|customerType|vatNumber|siren|siret|bce)`, "i"))
  })
})

describe("Demande spéciale — isolation tenant préservée (anti-IDOR)", () => {
  const code = stripComments(actions)

  it("le tenant est résolu côté serveur (requireTenant)", () => {
    expect(code).toMatch(/const tenant = await requireTenant\(\)/)
    expect(code).toMatch(/companyId: tenant\.id/)
  })

  it("aucun companyId accepté depuis le formulaire", () => {
    expect(code).not.toMatch(/formData\.get\(\s*["']companyId["']\s*\)/)
  })

  it("le détail admin lit la demande scopée au tenant (getCustomRequestById + tenant.id)", () => {
    const detail = stripComments(adminDetail)
    expect(detail).toMatch(/getCustomRequestById\(requestId, tenant\.id\)/)
  })
})

describe("Demande spéciale — UI & schéma", () => {
  it("formulaire : champ facultatif, maxLength 60, libellé + aide", () => {
    expect(form).toMatch(new RegExp(`name="${FIELD}"`))
    expect(form).toMatch(/maxLength=\{60\}/)
    expect(form).toMatch(/identifiant légal \(facultatif\)/)
    expect(form).toMatch(/BCE en Belgique ou SIREN\/SIRET en France/)
  })

  it("détail admin : affiche le numéro quand présent", () => {
    expect(adminDetail).toMatch(new RegExp(`req\\.${FIELD}`))
  })

  it("schéma : colonne TEXT nullable (aucun notNull)", () => {
    const line = schema.split("\n").find((l) => l.includes(`${FIELD}: text(`))
    expect(line).toBeTruthy()
    expect(line).not.toMatch(/notNull/)
  })

  it("aucune affirmation 'numéro vérifié' / 'valide'", () => {
    for (const src of [form, adminDetail]) {
      expect(src).not.toMatch(/numéro vérifié/i)
      expect(src).not.toMatch(/numéro valide/i)
    }
  })
})
