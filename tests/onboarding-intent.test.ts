import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Routage des parcours d'onboarding — SOURCE DE VÉRITÉ pure
 * (`lib/onboarding/intent.ts`). On teste ici la logique qui décide, côté
 * serveur, quel parcours le dashboard affiche à partir de la valeur PERSISTÉE
 * `companies.onboardingIntent`, du `customSiteKey` et du transport `?start=`.
 *
 * Ces tests garantissent que :
 *  - le choix fait avant l'inscription se retrouve après reconnexion ;
 *  - un tenant historique (colonne NULL) conserve son comportement ;
 *  - les sites 100 % personnalisés ne subissent AUCUNE régression.
 */

import {
  toCanonicalIntent,
  isCanonicalIntent,
  resolveDashboardIntent,
  ONBOARDING_INTENTS,
} from "@/lib/onboarding/intent"

describe("mapping transport → canonique", () => {
  it("booking → booking_only", () => {
    expect(toCanonicalIntent("booking")).toBe("booking_only")
  })
  it("page → public_page", () => {
    expect(toCanonicalIntent("page")).toBe("public_page")
  })
  it("website → custom_website", () => {
    expect(toCanonicalIntent("website")).toBe("custom_website")
  })
  it("valeur inconnue / nulle → null", () => {
    expect(toCanonicalIntent("autre")).toBeNull()
    expect(toCanonicalIntent(null)).toBeNull()
    expect(toCanonicalIntent(undefined)).toBeNull()
  })
})

describe("garde de type canonique", () => {
  it("accepte exactement les 3 valeurs métier", () => {
    expect(ONBOARDING_INTENTS).toEqual(["booking_only", "public_page", "custom_website"])
    for (const v of ONBOARDING_INTENTS) expect(isCanonicalIntent(v)).toBe(true)
  })
  it("rejette les codes de transport courts et le bruit", () => {
    expect(isCanonicalIntent("booking")).toBe(false)
    expect(isCanonicalIntent("page")).toBe(false)
    expect(isCanonicalIntent("website")).toBe(false)
    expect(isCanonicalIntent(null)).toBe(false)
    expect(isCanonicalIntent(undefined)).toBe(false)
    expect(isCanonicalIntent("")).toBe(false)
  })
})

describe("resolveDashboardIntent — persistance des 3 parcours", () => {
  it("booking_only persisté est renvoyé tel quel", () => {
    expect(resolveDashboardIntent({ persisted: "booking_only", customSiteKey: null })).toBe("booking_only")
  })
  it("public_page persisté est renvoyé tel quel", () => {
    expect(resolveDashboardIntent({ persisted: "public_page", customSiteKey: null })).toBe("public_page")
  })
  it("custom_website persisté est renvoyé tel quel", () => {
    expect(resolveDashboardIntent({ persisted: "custom_website", customSiteKey: null })).toBe("custom_website")
  })
})

describe("resolveDashboardIntent — reconnexion (aucun transport)", () => {
  it("retrouve le parcours uniquement depuis la colonne persistée", () => {
    // Simule une reconnexion sur un autre appareil : pas de ?start=.
    expect(resolveDashboardIntent({ persisted: "public_page", customSiteKey: null, transport: null })).toBe(
      "public_page",
    )
    expect(resolveDashboardIntent({ persisted: "booking_only", customSiteKey: null, transport: undefined })).toBe(
      "booking_only",
    )
  })

  it("la valeur persistée prime sur un transport divergent", () => {
    expect(resolveDashboardIntent({ persisted: "booking_only", customSiteKey: null, transport: "page" })).toBe(
      "booking_only",
    )
  })
})

describe("resolveDashboardIntent — NULL = comportement historique", () => {
  it("colonne NULL et aucun transport → null (dashboard standard inchangé)", () => {
    expect(resolveDashboardIntent({ persisted: null, customSiteKey: null, transport: null })).toBeNull()
    expect(resolveDashboardIntent({ persisted: undefined, customSiteKey: null })).toBeNull()
  })

  it("valeur persistée non canonique (donnée douteuse) → traitée comme absente", () => {
    expect(resolveDashboardIntent({ persisted: "booking", customSiteKey: null, transport: null })).toBeNull()
  })
})

describe("resolveDashboardIntent — repli transport pour comptes pré-colonne", () => {
  it("utilise ?start= uniquement quand rien n'est persisté", () => {
    expect(resolveDashboardIntent({ persisted: null, customSiteKey: null, transport: "booking" })).toBe("booking_only")
    expect(resolveDashboardIntent({ persisted: null, customSiteKey: null, transport: "website" })).toBe(
      "custom_website",
    )
  })
})

describe("resolveDashboardIntent — sites personnalisés protégés (aucune régression)", () => {
  it("customSiteKey non nul force le comportement historique, même avec une intention persistée", () => {
    // Spirit ACS, Rozan, Cleanyzer, JustClean… : jamais de panneau self-service.
    expect(resolveDashboardIntent({ persisted: "public_page", customSiteKey: "spirit-acs" })).toBeNull()
    expect(resolveDashboardIntent({ persisted: "booking_only", customSiteKey: "rozan" })).toBeNull()
    expect(resolveDashboardIntent({ persisted: "custom_website", customSiteKey: "cleanyzer" })).toBeNull()
  })

  it("customSiteKey non nul ignore aussi le transport", () => {
    expect(resolveDashboardIntent({ persisted: null, customSiteKey: "justclean", transport: "page" })).toBeNull()
  })

  it("customSiteKey vide/espaces est traité comme absent (non custom)", () => {
    expect(resolveDashboardIntent({ persisted: "public_page", customSiteKey: "   " })).toBe("public_page")
  })
})

/**
 * Cohérence schéma Drizzle ⇄ migration SQL. La migration régularise
 * l'historique du dépôt (la colonne existe déjà en production). On vérifie
 * qu'elle est STRICTEMENT ADDITIVE et IDEMPOTENTE, et qu'elle décrit exactement
 * la même colonne + les mêmes valeurs autorisées que le schéma applicatif.
 */
describe("migration onboarding-intent — additive & idempotente", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
  const migration = read("scripts/onboarding-intent-migration.sql")
  const schema = read("lib/db/schema.ts")
  // SQL exécutable seul (hors lignes de commentaire "--"), pour ne pas
  // confondre les mots-clés cités dans l'en-tête pédagogique avec du code.
  const executable = migration
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")

  it("ajoute la colonne uniquement si absente (idempotent, nullable, sans défaut)", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS "onboardingIntent" text/)
    // Aucune valeur par défaut ni contrainte NOT NULL sur la colonne.
    expect(migration).not.toMatch(/onboardingIntent"?\s+text[^;]*DEFAULT/i)
    expect(migration).not.toMatch(/onboardingIntent"?\s+text[^;]*NOT NULL/i)
  })

  it("ajoute la contrainte CHECK uniquement si elle n'existe pas (garde pg_constraint)", () => {
    expect(migration).toMatch(/pg_constraint WHERE conname = 'companies_onboarding_intent_check'/)
    expect(migration).toMatch(/ADD CONSTRAINT "companies_onboarding_intent_check"/)
    expect(migration).toMatch(
      /CHECK \("onboardingIntent" IN \('booking_only', 'public_page', 'custom_website'\)\)/,
    )
  })

  it("n'exécute aucune opération destructive ou de backfill", () => {
    for (const forbidden of [/\bDROP\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bNOT NULL\b/i, /\bDEFAULT\b/i, /CREATE TYPE/i]) {
      expect(executable).not.toMatch(forbidden)
    }
  })

  it("ne touche qu'à la table companies", () => {
    const tables = [...executable.matchAll(/ALTER TABLE "([^"]+)"/g)].map((m) => m[1])
    expect(new Set(tables)).toEqual(new Set(["companies"]))
  })

  it("les valeurs autorisées correspondent exactement à ONBOARDING_INTENTS", () => {
    for (const v of ONBOARDING_INTENTS) expect(migration).toContain(`'${v}'`)
  })

  it("le schéma Drizzle déclare bien la colonne onboardingIntent en text", () => {
    expect(schema).toMatch(/onboardingIntent:\s*text\("onboardingIntent"\)/)
  })
})
