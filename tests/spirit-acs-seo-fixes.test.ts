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

  it("les 6 cartes photographiques lient vers les pages via serviceHref (tenant conservé)", () => {
    // Nouveau design : une seule grille de 6 cartes (plus de bloc gris doublon).
    expect(prest).not.toMatch(/Découvrir toutes nos prestations/)
    // Phase 3 : les slugs vivent dans la SOURCE ÉDITORIALE UNIQUE (seo-content),
    // consommée via le catalogue public — la grille n'en garde plus aucune copie.
    const seo = read("components/custom-sites/spirit-acs/seo-content.ts")
    for (const slug of [
      "nettoyage-automobile",
      "polissage-automobile",
      "protection-ceramique",
      "protection-ppf",
      "renovation-phares",
      "detailing-moto",
    ]) {
      expect(seo, `slug manquant: ${slug}`).toMatch(new RegExp(slug))
    }
    // La grille reste routée via serviceHref (tenant-aware) en itérant sur les
    // pages du catalogue (`page.slug`).
    expect(prest).toMatch(/href=\{serviceHref\((?:card|page)\.slug\)\}/)
  })
})

/* -------------------------------------------------------------------------- */
/*  5. JSON-LD : nom commercial + adresse professionnelle complète            */
/* -------------------------------------------------------------------------- */

describe("buildLocalBusinessJsonLd — alternateName + addressRegion", () => {
  it("émet alternateName et l'adresse complète (dont addressRegion)", () => {
    const jsonLd = buildLocalBusinessJsonLd({
      name: "Spirit Auto Clean Service",
      alternateName: "Spirit ACS",
      telephone: "+33699901303",
      address: {
        streetAddress: "53 Rue Pierre Semard",
        postalCode: "77400",
        addressLocality: "Lagny-sur-Marne",
        addressRegion: "Île-de-France",
        addressCountry: "FR",
      },
    })
    expect(jsonLd.name).toBe("Spirit Auto Clean Service")
    expect(jsonLd.alternateName).toBe("Spirit ACS")
    expect(jsonLd.telephone).toBe("+33699901303")
    expect(jsonLd.address).toMatchObject({
      "@type": "PostalAddress",
      streetAddress: "53 Rue Pierre Semard",
      postalCode: "77400",
      addressLocality: "Lagny-sur-Marne",
      addressRegion: "Île-de-France",
      addressCountry: "FR",
    })
  })

  it("alternateName omis si absent (aucune propriété vide)", () => {
    const jsonLd = buildLocalBusinessJsonLd({ name: "Spirit ACS" })
    expect(jsonLd).not.toHaveProperty("alternateName")
  })
})

describe("Repli SEO Spirit — configuration business vérifiée (jamais Neon)", () => {
  const server = read("lib/seo/tenant-seo.server.ts")
  const footer = read("components/custom-sites/spirit-acs/spirit-footer.tsx")

  it("le JSON-LD utilise le repli Spirit uniquement quand la donnée tenant manque", () => {
    // Donnée réelle du tenant prioritaire (tenant.address ?? biz.streetAddress).
    expect(server).toMatch(/tenant\.address \?\? biz\?\.streetAddress/)
    expect(server).toMatch(/tenant\.phone \?\? biz\?\.phone/)
    // Repli activé uniquement pour Spirit.
    expect(server).toMatch(/const biz = seo\.isSpirit \? SPIRIT_BUSINESS : null/)
  })

  it("le footer affiche les coordonnées complètes vérifiées (tel: + adresse)", () => {
    expect(footer).toMatch(/SPIRIT_BUSINESS\.streetAddress/)
    expect(footer).toMatch(/SPIRIT_BUSINESS\.postalCode/)
    expect(footer).toMatch(/SPIRIT_BUSINESS\.addressLocality/)
    expect(footer).toMatch(/tel:\$\{SPIRIT_BUSINESS\.phone\}/)
    // Adresse sémantique.
    expect(footer).toMatch(/<address/)
  })
})

/* -------------------------------------------------------------------------- */
/*  6. Lisibilité : justification + cartes non rognées sur mobile             */
/* -------------------------------------------------------------------------- */

describe("Lisibilité éditoriale — paragraphes justifiés (spirit-prose)", () => {
  const css = read("components/custom-sites/spirit-acs/spirit.css")
  const prest = read("components/custom-sites/spirit-acs/spirit-prestations.tsx")
  const about = read("components/custom-sites/spirit-acs/spirit-qui-sommes-nous.tsx")

  it("la classe .spirit-prose applique justify + hyphens + overflow-wrap", () => {
    expect(css).toMatch(/\.spirit-acs \.spirit-prose\s*\{[^}]*text-align:\s*justify/)
    expect(css).toMatch(/\.spirit-acs \.spirit-prose\s*\{[^}]*text-align-last:\s*left/)
    expect(css).toMatch(/\.spirit-acs \.spirit-prose\s*\{[^}]*hyphens:\s*auto/)
    expect(css).toMatch(/\.spirit-acs \.spirit-prose\s*\{[^}]*overflow-wrap:\s*break-word/)
  })

  it("l'intro des prestations et les paragraphes « Qui sommes-nous ? » sont justifiés", () => {
    expect(prest).toMatch(/spirit-prose/)
    // Contraste renforcé de l'intro (plus de gris clair muted).
    expect(prest).toMatch(/text-\[color:var\(--spirit-ink\)\]\/75/)
    expect(about).toMatch(/spirit-prose/)
  })
})

describe("Cartes prestations — plus aucun titre rogné sur mobile", () => {
  const prest = read("components/custom-sites/spirit-acs/spirit-prestations.tsx")

  it("hauteur minimale extensible (min-h), pas de ratio fixe qui rogne", () => {
    expect(prest).toMatch(/min-h-\[16rem\]/)
    expect(prest).not.toMatch(/aspect-\[4\/3\]/)
  })

  it("titres jamais tronqués : pas de line-clamp, ni marge/position négative sur le contenu", () => {
    expect(prest).not.toMatch(/line-clamp/)
    // Aucune marge négative ni décalage vertical négatif du bloc de contenu.
    expect(prest).not.toMatch(/-mt-|-top-|translate-y-\[-/)
  })

  it("hauteur homogène (h-full + items-stretch) et images en lazy", () => {
    expect(prest).toMatch(/items-stretch/)
    expect(prest).toMatch(/className="h-full"/)
    expect(prest).toMatch(/loading="lazy"/)
    expect(prest).not.toMatch(/loading=\{i < 2 \? "eager"/)
  })
})
