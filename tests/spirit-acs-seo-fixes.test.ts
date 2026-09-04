import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Correctifs SEO Spirit ACS (audit production) — invariants vérifiables sans
 * rendu DOM ni base de données :
 *  1. Normalisation téléphone (helper pur).
 *  2. JSON-LD : téléphone international, PostalAddress, hasMap (fiche Google),
 *     sameAs (validation + déduplication).
 *  3. Priorité de la description SEO de l'accueil (contrôle de source).
 *  4. Accès aux 6 pages de prestations depuis l'accueil (contrôle de source).
 */

import { normalizePhoneForJsonLd } from "@/lib/seo/phone"
import { buildLocalBusinessJsonLd, sanitizeSameAs } from "@/lib/seo/structured-data"

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8")
}

/* -------------------------------------------------------------------------- */
/*  1. Normalisation téléphone                                                */
/* -------------------------------------------------------------------------- */

describe("normalizePhoneForJsonLd", () => {
  it("numéro français national → format international +33", () => {
    expect(normalizePhoneForJsonLd("06 99 90 13 03")).toBe("+33699901303")
    expect(normalizePhoneForJsonLd("06.99.90.13.03")).toBe("+33699901303")
    expect(normalizePhoneForJsonLd("06-99-90-13-03")).toBe("+33699901303")
  })

  it("numéro déjà international (+33) → conservé sans séparateurs", () => {
    expect(normalizePhoneForJsonLd("+33 6 99 90 13 03")).toBe("+33699901303")
  })

  it("préfixe international 00 → +", () => {
    expect(normalizePhoneForJsonLd("0033 6 99 90 13 03")).toBe("+33699901303")
  })

  it("numéro étranger déjà international → conservé, jamais préfixé +33", () => {
    expect(normalizePhoneForJsonLd("+49 30 901820")).toBe("+4930901820")
    // Un numéro national d'un pays non répertorié n'est pas deviné.
    expect(normalizePhoneForJsonLd("030 901820", "DE")).toBeNull()
  })

  it("valeur vide → null", () => {
    expect(normalizePhoneForJsonLd("")).toBeNull()
    expect(normalizePhoneForJsonLd("   ")).toBeNull()
    expect(normalizePhoneForJsonLd(null)).toBeNull()
    expect(normalizePhoneForJsonLd(undefined)).toBeNull()
  })

  it("valeur invalide → null", () => {
    expect(normalizePhoneForJsonLd("abc")).toBeNull()
    expect(normalizePhoneForJsonLd("12")).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  2. JSON-LD LocalBusiness                                                  */
/* -------------------------------------------------------------------------- */

describe("buildLocalBusinessJsonLd — téléphone / adresse / hasMap / sameAs", () => {
  it("téléphone normalisé en international dans le JSON-LD", () => {
    const jsonLd = buildLocalBusinessJsonLd({
      name: "Spirit ACS",
      telephone: "06 99 90 13 03",
      address: { addressLocality: "Lagny-sur-Marne", addressCountry: "France" },
    })
    expect(jsonLd.telephone).toBe("+33699901303")
  })

  it("PostalAddress construit uniquement avec les champs réellement présents", () => {
    const full = buildLocalBusinessJsonLd({
      name: "Spirit ACS",
      address: {
        streetAddress: "12 rue des Artisans",
        postalCode: "77400",
        addressLocality: "Lagny-sur-Marne",
        addressCountry: "FR",
      },
    })
    expect(full.address).toMatchObject({
      "@type": "PostalAddress",
      streetAddress: "12 rue des Artisans",
      postalCode: "77400",
      addressLocality: "Lagny-sur-Marne",
      addressCountry: "FR",
    })

    // Seule la ville renseignée → seule addressLocality est émise.
    const partial = buildLocalBusinessJsonLd({
      name: "Spirit ACS",
      address: { addressLocality: "Lagny-sur-Marne" },
    })
    const addr = partial.address as Record<string, unknown>
    expect(addr.addressLocality).toBe("Lagny-sur-Marne")
    expect(addr).not.toHaveProperty("streetAddress")
    expect(addr).not.toHaveProperty("postalCode")
    expect(addr).not.toHaveProperty("addressCountry")
  })

  it("hasMap = fiche Google fournie, jamais une recherche générique", () => {
    const url = "https://maps.google.com/?cid=1234567890"
    const jsonLd = buildLocalBusinessJsonLd({ name: "Spirit ACS", hasMap: url })
    expect(jsonLd.hasMap).toBe(url)
    expect(JSON.stringify(jsonLd)).not.toContain("/maps/search/")
  })

  it("hasMap absent si aucune URL vérifiée n'existe", () => {
    const jsonLd = buildLocalBusinessJsonLd({ name: "Spirit ACS", hasMap: null })
    expect(jsonLd).not.toHaveProperty("hasMap")
  })

  it("sameAs : URL HTTP(S) valides, sans doublon, chaînes vides ignorées", () => {
    const jsonLd = buildLocalBusinessJsonLd({
      name: "Spirit ACS",
      sameAs: [
        "https://www.instagram.com/spiritacs",
        "https://www.instagram.com/spiritacs", // doublon
        "https://www.facebook.com/spiritacs",
        "", // vide
        "pas-une-url", // invalide
        "https://maps.google.com/?cid=1234567890", // fiche Google
      ],
    })
    expect(jsonLd.sameAs).toEqual([
      "https://www.instagram.com/spiritacs",
      "https://www.facebook.com/spiritacs",
      "https://maps.google.com/?cid=1234567890",
    ])
  })

  it("sameAs absent si aucune URL exploitable", () => {
    const jsonLd = buildLocalBusinessJsonLd({ name: "Spirit ACS", sameAs: ["", "nope"] })
    expect(jsonLd).not.toHaveProperty("sameAs")
  })
})

describe("sanitizeSameAs", () => {
  it("valide, déduplique et préserve l'ordre", () => {
    expect(
      sanitizeSameAs([
        "https://a.com",
        "http://b.com",
        "https://a.com",
        "ftp://c.com",
        "",
        null,
        undefined,
        "   ",
      ]),
    ).toEqual(["https://a.com", "http://b.com"])
  })
})

/* -------------------------------------------------------------------------- */
/*  3. Priorité de la description SEO de l'accueil                            */
/* -------------------------------------------------------------------------- */

describe("Accueil — description SEO Spirit prioritaire sur les contenus Neon", () => {
  const layout = read("app/(site)/layout.tsx")

  it("Spirit ACS utilise SPIRIT_PAGE_META.home.description, jamais about.text", () => {
    // La description Spirit est choisie AVANT toute retombée sur heroSubtitle /
    // about.text (ternaire piloté par seo.isSpirit).
    expect(layout).toMatch(/seo\.isSpirit\s*\n?\s*\?\s*SPIRIT_PAGE_META\.home\.description/)
  })

  it("la recherche Google générique a été retirée du JSON-LD", () => {
    expect(layout).not.toContain("/maps/search/")
  })
})

/* -------------------------------------------------------------------------- */
/*  4. Accès aux 6 pages de prestations depuis l'accueil                     */
/* -------------------------------------------------------------------------- */

describe("Accueil — maillage vers les 6 pages de prestations", () => {
  const prest = read("components/custom-sites/spirit-acs/spirit-prestations.tsx")

  it("un bloc liste les 6 prestations via serviceHref (tenant conservé)", () => {
    expect(prest).toMatch(/Découvrir toutes nos prestations/)
    // Itère sur l'ensemble des prestations (les 6), pas seulement les 4 cartes.
    expect(prest).toMatch(/SPIRIT_SERVICES\.map\(\(service\)/)
    expect(prest).toMatch(/href=\{serviceHref\(service\.slug\)\}/)
  })
})
