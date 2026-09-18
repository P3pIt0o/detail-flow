import { describe, it, expect } from "vitest"
import {
  resolveSpiritEffectiveTexts,
  SPIRIT_TEXT_FIELDS,
  SPIRIT_STATIC_FALLBACKS,
  SPIRIT_CARD_SLUGS,
  SPIRIT_SERVICE_SLUGS,
  SPIRIT_HERO_SUBTITLE_FALLBACK,
  SPIRIT_SERVICES_INTRO_FALLBACK,
  SPIRIT_ABOUT_FALLBACKS,
  SPIRIT_ZONE_TEXT_FALLBACK,
  SPIRIT_PHOTO_GALLERY_TITLE_FALLBACK,
  SPIRIT_TEXT_FORM_SECTIONS,
  spiritCardTaglineFallback,
  spiritServiceIntroFallback,
} from "@/components/custom-sites/spirit-acs/site-texts"
import { SPIRIT_SERVICES, SPIRIT_ZONE_TEXT } from "@/components/custom-sites/spirit-acs/seo-content"

/**
 * Textes éditoriaux Spirit ACS — module PUR (résolveur + liste blanche + repli).
 * Verrouille l'invariant clé : SANS override, tous les textes du site restent
 * strictement identiques au code (aucun changement visible au déploiement), et
 * les valeurs invalides retombent sur le fallback sans planter.
 */

describe("resolveSpiritEffectiveTexts — repli (aucun override)", () => {
  it("renvoie EXACTEMENT les fallbacks du code quand rien n'est personnalisé", () => {
    for (const raw of [undefined, null, {}, { home: {} }, { services: {} }]) {
      const t = resolveSpiritEffectiveTexts(raw)
      expect(t.servicesIntro).toBe(SPIRIT_SERVICES_INTRO_FALLBACK)
      // Zone : le fallback est la source unique SPIRIT_ZONE_TEXT.
      expect(t.zoneText).toBe(SPIRIT_ZONE_TEXT_FALLBACK)
      expect(t.zoneText).toBe(SPIRIT_ZONE_TEXT)
      expect(t.photoGalleryTitle).toBe(SPIRIT_PHOTO_GALLERY_TITLE_FALLBACK)
      expect(t.about).toEqual([...SPIRIT_ABOUT_FALLBACKS])
      // Flotte : null => le composant conserve son rendu par défaut À L'IDENTIQUE.
      expect(t.fleetHeading).toBeNull()
      expect(t.fleetText).toBeNull()
      for (const slug of SPIRIT_CARD_SLUGS) {
        expect(t.cardTaglines[slug]).toBe(spiritCardTaglineFallback(slug))
      }
      for (const slug of SPIRIT_SERVICE_SLUGS) {
        expect(t.serviceIntros[slug]).toEqual([...spiritServiceIntroFallback(slug)])
      }
    }
  })

  it("le fallback du hero est bien celui de SpiritHero (pas la constante SEO)", () => {
    expect(SPIRIT_STATIC_FALLBACKS.heroSubtitle).toBe(SPIRIT_HERO_SUBTITLE_FALLBACK)
    expect(SPIRIT_HERO_SUBTITLE_FALLBACK).toBe("Nettoyage, polissage et protection, réalisés avec exigence.")
  })
})

describe("resolveSpiritEffectiveTexts — overrides & valeurs invalides", () => {
  it("applique un override valide et laisse les autres champs au fallback", () => {
    const t = resolveSpiritEffectiveTexts({ home: { zoneText: "Ma zone" } })
    expect(t.zoneText).toBe("Ma zone")
    expect(t.servicesIntro).toBe(SPIRIT_SERVICES_INTRO_FALLBACK)
  })

  it("une valeur vide / d'espaces / d'un mauvais type retombe sur le fallback", () => {
    expect(resolveSpiritEffectiveTexts({ home: { zoneText: "   " } }).zoneText).toBe(SPIRIT_ZONE_TEXT)
    expect(resolveSpiritEffectiveTexts({ home: { zoneText: 42 } }).zoneText).toBe(SPIRIT_ZONE_TEXT)
    expect(resolveSpiritEffectiveTexts({ home: { zoneText: "" } }).zoneText).toBe(SPIRIT_ZONE_TEXT)
  })

  it("un override de flotte est renvoyé ; absent => null (rendu par défaut conservé)", () => {
    const t = resolveSpiritEffectiveTexts({ home: { fleetHeading: "Flottes pro", fleetText: "Décrivez." } })
    expect(t.fleetHeading).toBe("Flottes pro")
    expect(t.fleetText).toBe("Décrivez.")
  })

  it("remplace seulement le paragraphe surchargé d'une page prestation", () => {
    const slug = "polissage-automobile"
    const fallback = spiritServiceIntroFallback(slug)
    const t = resolveSpiritEffectiveTexts({ services: { [slug]: { intro: { paragraph2: "Nouveau P2" } } } })
    expect(t.serviceIntros[slug][0]).toBe(fallback[0])
    expect(t.serviceIntros[slug][1]).toBe("Nouveau P2")
    expect(t.serviceIntros[slug].length).toBe(fallback.length)
  })
})

describe("Liste blanche d'écriture (sécurité)", () => {
  it("6 cartes (protection-ceramique exclue), 7 pages de prestations", () => {
    expect(SPIRIT_CARD_SLUGS).toHaveLength(6)
    expect(SPIRIT_CARD_SLUGS).not.toContain("protection-ceramique")
    expect(SPIRIT_SERVICE_SLUGS).toHaveLength(7)
    expect(SPIRIT_SERVICE_SLUGS).toContain("protection-ceramique")
  })

  it("le nombre de paragraphes par prestation suit EXACTEMENT SPIRIT_SERVICES", () => {
    for (const s of SPIRIT_SERVICES) {
      const count = s.intro.length
      for (let i = 1; i <= count; i++) {
        expect(SPIRIT_TEXT_FIELDS[`service:${s.slug}:${i}`]).toBeDefined()
      }
      // Aucun paragraphe surnuméraire (ex. 3e paragraphe hors nettoyage-automobile).
      expect(SPIRIT_TEXT_FIELDS[`service:${s.slug}:${count + 1}`]).toBeUndefined()
    }
    // Contrôle explicite du cahier des charges : seul nettoyage-automobile a 3 §.
    expect(SPIRIT_TEXT_FIELDS["service:nettoyage-automobile:3"]).toBeDefined()
    expect(SPIRIT_TEXT_FIELDS["service:polissage-automobile:3"]).toBeUndefined()
  })

  it("rejette toute clé inconnue / slug inconnu / carte exclue", () => {
    expect(SPIRIT_TEXT_FIELDS["clé-inconnue"]).toBeUndefined()
    expect(SPIRIT_TEXT_FIELDS["service:slug-bidon:1"]).toBeUndefined()
    expect(SPIRIT_TEXT_FIELDS["cardTagline:protection-ceramique"]).toBeUndefined()
  })

  it("le hero est stocké en colonne dédiée, pas dans le jsonb", () => {
    expect(SPIRIT_TEXT_FIELDS.heroSubtitle.location).toEqual({ kind: "column", column: "heroSubtitle" })
  })

  it("les champs réutilisés pointent vers leur emplacement historique", () => {
    expect(SPIRIT_TEXT_FIELDS.galleryTitle.location).toEqual({ kind: "json", path: ["gallery", "title"] })
    expect(SPIRIT_TEXT_FIELDS.footerTagline.location).toEqual({ kind: "json", path: ["footer", "tagline"] })
    expect(SPIRIT_TEXT_FIELDS.customRequestsTitle.location).toEqual({ kind: "json", path: ["customRequests", "title"] })
  })

  it("les nouveaux textes vivent sous siteContent.spiritAcs", () => {
    expect(SPIRIT_TEXT_FIELDS.zoneText.location).toEqual({
      kind: "json",
      path: ["spiritAcs", "home", "zoneText"],
    })
    expect(SPIRIT_TEXT_FIELDS["about:1"].location).toEqual({
      kind: "json",
      path: ["spiritAcs", "home", "about", "paragraph1"],
    })
  })
})

describe("Schéma du formulaire d'administration", () => {
  it("chaque champ affiché correspond à une entrée de la liste blanche", () => {
    const ids = SPIRIT_TEXT_FORM_SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields.map((f) => f.id)))
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(SPIRIT_TEXT_FIELDS[id]).toBeDefined()
    // Réciproque : tout champ modifiable est exposé dans le formulaire.
    for (const id of Object.keys(SPIRIT_TEXT_FIELDS)) expect(ids).toContain(id)
  })
})
