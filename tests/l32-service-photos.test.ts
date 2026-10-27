import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  SPIRIT_PHOTO_SLOTS,
  isSpiritPhotoKey,
  readSpiritServicePhotos,
  spiritOptimizedPhotoPrefix,
  spiritPhotoOverrides,
  spiritPhotoUploadPrefix,
  spiritServicePhotoSrc,
} from "@/components/custom-sites/spirit-acs/service-photos"
import { MAIN_FAMILIES } from "@/components/custom-sites/spirit-acs/configurator/flow-data"
import { SPIRIT_SERVICES } from "@/components/custom-sites/spirit-acs/seo-content"
import { resolveSpiritEffectiveTexts } from "@/components/custom-sites/spirit-acs/site-texts"

/**
 * L32 — photos des prestations Spirit : 7 emplacements, portée « même image
 * d'origine », rendu inchangé sans photo choisie (S5), substitution ciblée (S4).
 */

const pathFor = (key: string, companyId = 7) => `${spiritOptimizedPhotoPrefix(companyId, key)}AbC123xyz.webp`
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("emplacements", () => {
  it("exactement 7 photos : 6 familles visibles + Protection céramique", () => {
    expect(SPIRIT_PHOTO_SLOTS.map((s) => s.key)).toEqual([
      "nettoyage",
      "polissage-ceramique",
      "ppf-personnalisation",
      "renovation-phares",
      "moto",
      "nettoyage-textile",
      "protection-ceramique",
    ])
    expect(isSpiritPhotoKey("entretien-regulier")).toBe(false)
    expect(isSpiritPhotoKey("moteur-echappement")).toBe(false)
    expect(isSpiritPhotoKey("__proto__")).toBe(false)
  })

  it("correspondance famille → pages de prestation (même image d'origine)", () => {
    expect(Object.fromEntries(SPIRIT_PHOTO_SLOTS.map((s) => [s.key, [s.familyKey, s.serviceSlugs]]))).toEqual({
      nettoyage: ["nettoyage", ["nettoyage-automobile"]],
      "polissage-ceramique": ["polissage-ceramique", ["polissage-automobile"]],
      "ppf-personnalisation": ["ppf-personnalisation", ["protection-ppf"]],
      "renovation-phares": ["renovation-phares", ["renovation-phares"]],
      moto: ["moto", ["detailing-moto"]],
      "nettoyage-textile": ["nettoyage-textile", ["nettoyage-textile"]],
      "protection-ceramique": [null, ["protection-ceramique"]],
    })
    for (const s of SPIRIT_PHOTO_SLOTS) expect(s.title.length).toBeGreaterThan(0)
  })
})

describe("lecture des photos enregistrées", () => {
  it("ignore tout ce qui n'est pas une photo optimisée d'une clé connue", () => {
    expect(readSpiritServicePhotos(undefined)).toEqual({})
    expect(readSpiritServicePhotos(null)).toEqual({})
    expect(readSpiritServicePhotos({ servicePhotos: "x" })).toEqual({})
    expect(
      readSpiritServicePhotos({
        servicePhotos: {
          moto: pathFor("moto"),
          inconnue: pathFor("inconnue"),
          nettoyage: `${spiritPhotoUploadPrefix(7, "nettoyage")}brut.jpg`, // fichier brut : jamais servi
          "ppf-personnalisation": pathFor("moto"), // pathname d'une autre clé
          "renovation-phares": 42,
          "nettoyage-textile": "https://ailleurs.example/x.webp",
        },
      }),
    ).toEqual({ moto: pathFor("moto") })
  })

  it("« nettoyage » ne capte pas le pathname de « nettoyage-textile »", () => {
    expect(readSpiritServicePhotos({ servicePhotos: { nettoyage: pathFor("nettoyage-textile") } })).toEqual({})
  })

  it("exposé dans les textes effectifs", () => {
    expect(resolveSpiritEffectiveTexts(undefined).servicePhotos).toEqual({})
    expect(resolveSpiritEffectiveTexts({ servicePhotos: { moto: pathFor("moto") } }).servicePhotos).toEqual({
      moto: pathFor("moto"),
    })
  })
})

describe("S5 — sans photo choisie, rien ne change", () => {
  it.each([undefined, {}, { moto: 12 }])("%o → aucune substitution", (raw) => {
    const o = spiritPhotoOverrides("spirit-acs", readSpiritServicePhotos({ servicePhotos: raw }))
    expect(o.families).toEqual({})
    expect(o.services).toEqual({})
  })

  // Configurateur : vrai rendu dans tests/l32-configurator-render.test.ts. Accueil et page de
  // prestation sont des composants serveur branchés sur la BDD : contrôle du repli dans le code.
  it("accueil et page de prestation retombent sur l'image d'origine du code", () => {
    const servicePage = read("components/custom-sites/spirit-acs/service-page.tsx")
    expect(servicePage).toMatch(/photo\?\.src \?\? service\.image/)
    const home = read("components/custom-sites/spirit-acs/home-page.tsx")
    expect(home).toMatch(/photo \? \{ \.\.\.p, image: photo\.src, imageAlt: photo\.alt \} : p/)
  })
})

describe("S4 — photo choisie : configurateur, accueil et page liés seulement", () => {
  it("Polissage remplace la carte du configurateur et la page Polissage, pas Protection céramique", () => {
    const o = spiritPhotoOverrides("spirit-acs", { "polissage-ceramique": pathFor("polissage-ceramique") })
    const src = spiritServicePhotoSrc("spirit-acs", "polissage-ceramique", pathFor("polissage-ceramique"))
    expect(o.families).toEqual({ "polissage-ceramique": { src, alt: "Polissage & protection céramique" } })
    expect(o.services).toEqual({ "polissage-automobile": { src, alt: "Polissage & protection céramique" } })
  })

  it("Protection céramique : sa page seulement (pas de carte d'accueil ni de carte du configurateur)", () => {
    const o = spiritPhotoOverrides("spirit-acs", { "protection-ceramique": pathFor("protection-ceramique") })
    expect(o.families).toEqual({})
    expect(Object.keys(o.services)).toEqual(["protection-ceramique"])
  })

  it("l'URL publique ne révèle pas le pathname et change à chaque nouveau fichier", () => {
    const a = spiritServicePhotoSrc("spirit-acs", "moto", pathFor("moto"))
    const b = spiritServicePhotoSrc("spirit-acs", "moto", `${spiritOptimizedPhotoPrefix(7, "moto")}Zz9.webp`)
    expect(a).toMatch(/^\/api\/spirit-service-photo\?company=spirit-acs&k=moto&v=[a-z0-9]+$/)
    expect(a).not.toContain("spirit-service-photo/company")
    expect(a).not.toBe(b)
  })

  it("chaque famille visible et chaque page de prestation reste couverte par l'emplacement attendu", () => {
    const all = Object.fromEntries(SPIRIT_PHOTO_SLOTS.map((s) => [s.key, pathFor(s.key)]))
    const o = spiritPhotoOverrides("spirit-acs", all)
    expect(Object.keys(o.families).sort()).toEqual(MAIN_FAMILIES.map((f) => f.key).sort())
    expect(Object.keys(o.services).sort()).toEqual(
      SPIRIT_SERVICES.filter((s) => s.image).map((s) => s.slug).sort(),
    )
  })
})
