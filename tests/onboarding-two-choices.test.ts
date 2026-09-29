import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { toCanonicalIntent } from "@/lib/onboarding/intent"
import { publicReservationUrl, publicReservationPath } from "@/lib/tenant-shared"

/**
 * Onboarding self-service — DEUX choix seulement sur /demarrer, calqués sur la
 * situation réelle du professionnel (pas deux offres, un même prix) :
 *  1. « J'ai déjà un site internet »        → booking_only (module à intégrer)
 *  2. « Je n'ai pas encore de site internet » → public_page (site vitrine)
 *
 * La valeur métier `custom_website` (site sur mesure) reste supportée pour les
 * anciens comptes mais n'est PAS proposée ici (aucune régression, aucune
 * migration). Ces tests verrouillent le parcours et la garantie fondamentale :
 * UNE seule URL de réservation, utilisable de plusieurs façons.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("/demarrer — deux choix uniquement", () => {
  const onboarding = read("app/demarrer/onboarding.tsx")

  it("le tableau INTENTS n'expose que booking et page (plus de website self-service)", () => {
    const ids = [...onboarding.matchAll(/id:\s*"(booking|page|website)"/g)].map((m) => m[1])
    expect(new Set(ids)).toEqual(new Set(["booking", "page"]))
    expect(ids).not.toContain("website")
  })

  it("chaque choix porte son intitulé et son CTA attendus", () => {
    // A — le pro a déjà un site : on installe le module de réservation.
    expect(onboarding).toContain("J'ai déjà un site internet")
    expect(onboarding).toContain("Installer ma réservation")
    // B — le pro n'a pas de site : on crée un site vitrine DetailFlow.
    expect(onboarding).toContain("Je n'ai pas encore de site internet")
    expect(onboarding).toContain("Créer mon site")
  })

  it("le choix « déjà un site » se mappe sur booking_only et « pas de site » sur public_page", () => {
    // Le transport du formulaire ("booking"/"page") est traduit en valeur métier.
    expect(toCanonicalIntent("booking")).toBe("booking_only")
    expect(toCanonicalIntent("page")).toBe("public_page")
  })
})

describe("réservation — UNE seule URL, plusieurs usages", () => {
  const root = "detailflow.fr"

  it("l'URL pointe vers le bon tenant et la route de réservation canonique", () => {
    expect(publicReservationPath("mon-garage")).toBe("/p/mon-garage/reservation")
    expect(publicReservationUrl("mon-garage", root)).toBe("https://www.detailflow.fr/p/mon-garage/reservation")
  })

  it("un autre tenant obtient une URL différente (aucune fuite cross-tenant)", () => {
    const a = publicReservationUrl("garage-a", root)
    const b = publicReservationUrl("garage-b", root)
    expect(a).toContain("/p/garage-a/reservation")
    expect(b).toContain("/p/garage-b/reservation")
    expect(a).not.toBe(b)
  })

  it("le lien « Instagram / partage » et le lien « bouton du site » sont identiques", () => {
    // Les deux blocs de la carte booking_only reçoivent la MÊME prop `url`.
    const card = read("components/admin/start-flow-card.tsx")
    // BookingPanel transmet une unique `reservationUrl` aux deux blocs.
    expect(card).toMatch(/<ShareBlock url=\{reservationUrl\}/)
    expect(card).toMatch(/<AddToSiteBlock url=\{reservationUrl\}/)
    // Fonctionnellement : partager ou intégrer, c'est la même URL de réservation.
    const url = publicReservationUrl("mon-garage", root)
    expect(url).toBe(publicReservationUrl("mon-garage", root))
  })
})

describe("dashboard — carte booking_only sans bloc contradictoire", () => {
  const card = read("components/admin/start-flow-card.tsx")

  it("affiche la carte « Ma réservation en ligne »", () => {
    expect(card).toContain("Ma réservation en ligne")
    expect(card).toContain("Votre lien DetailFlow est prêt à être partagé avec vos clients.")
  })

  it("le parcours booking_only n'emploie pas le jargon « page publique » / « site internet » comme produit", () => {
    // Le titre de la carte booking ne doit pas parler de « page professionnelle ».
    const bookingPanel = card.slice(card.indexOf("function BookingPanel"), card.indexOf("function ShareBlock"))
    expect(bookingPanel).not.toContain("page publique")
    expect(bookingPanel).not.toContain("page professionnelle")
    expect(bookingPanel).not.toContain("Votre moteur de réservation")
  })
})
