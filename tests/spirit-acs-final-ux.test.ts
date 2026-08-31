import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

/**
 * Finition UX Spirit ACS — invariants STRUCTURELS (environnement de test
 * « node », sans rendu DOM ni base de données). On lit le SOURCE et on vérifie
 * les garanties du cahier des charges :
 *  1. choix Particulier/Professionnel + champ légal conditionnel ;
 *  2. bouton WhatsApp partagé monté dans le shell Spirit (message prestations) ;
 *  3. header Spirit animé/compact au défilement ;
 *  4. transitions éditoriales (séparateurs décoratifs supprimés), header compact,
 *     bandeau de réassurance premium, simplification admin Spirit ;
 *  - non-régression : autres tenants inchangés (toggle opt-in, cycle intact).
 */

const root = process.cwd()
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8")
const SPIRIT = "components/custom-sites/spirit-acs"

describe("Spirit — formulaire Particulier / Professionnel", () => {
  const form = () => read("components/custom-request-form.tsx")

  it("le sélecteur d'audience est opt-in (prop audienceToggle, désactivé par défaut)", () => {
    const src = form()
    expect(src).toMatch(/audienceToggle\s*=\s*false/)
    expect(src).toMatch(/audienceToggle\?\:\s*boolean/)
  })

  it("particulier par défaut ; le champ légal est masqué pour un particulier", () => {
    const src = form()
    expect(src).toMatch(/useState<"particulier" \| "professionnel">\("particulier"\)/)
    // Le champ légal n'est rendu que si showLegalField ; en mode audience il
    // dépend de isPro (donc masqué pour un particulier).
    expect(src).toMatch(/showLegalField\s*=\s*audienceToggle\s*\?\s*isPro\s*:\s*true/)
    expect(src).toMatch(/\{showLegalField\s*&&/)
  })

  it("professionnel : libellé, aide et required corrects (SIREN/SIRET/BCE)", () => {
    const src = form()
    expect(src).toMatch(/SIREN \/ SIRET ou numéro BCE/)
    expect(src).toMatch(/SIREN ou SIRET en France, numéro BCE en Belgique\./)
    expect(src).toMatch(/required=\{audienceToggle\}/)
  })

  it("réutilise le champ existant customerLegalRegistrationNumber (aucune nouvelle colonne)", () => {
    expect(form()).toMatch(/name="customerLegalRegistrationNumber"/)
    // La transmission passe par le formulaire natif : le champ existant est réutilisé tel quel.
    const schema = read("lib/db/schema.ts")
    expect(schema).toMatch(/customerLegalRegistrationNumber/)
  })

  it("Spirit active le sélecteur d'audience", () => {
    expect(read(`${SPIRIT}/spirit-demande-devis.tsx`)).toMatch(/audienceToggle/)
  })

  it("la Server Action normalise l'identifiant et l'exige seulement pour un professionnel", () => {
    const action = read("app/(site)/demande/actions.ts")
    // Normalisation (retrait espaces/points/tirets/parenthèses/slashs).
    expect(action).toMatch(/customerLegalRegistrationNumber[\s\S]*replace\(/)
    // Requis uniquement si professionnel.
    expect(action).toMatch(/customerType === "professionnel" && !customerLegalRegistrationNumber/)
    // Le cycle existant est préservé : insertion dans customRequests conservée.
    expect(action).toMatch(/customRequests/)
  })
})

describe("Spirit — WhatsApp monté dans le shell (pas de doublon)", () => {
  it("le shell Spirit monte le bouton partagé avec le numéro réel et un message prestations", () => {
    const shell = read(`${SPIRIT}/site-shell.tsx`)
    expect(shell).toMatch(/import \{ WhatsAppButton \}/)
    expect(shell).toMatch(/<WhatsAppButton phone=\{phoneRaw\} message=\{SPIRIT_WHATSAPP_MESSAGE\} \/>/)
    expect(shell).toMatch(/renseignements sur vos prestations/)
  })

  it("le layout public ne rend plus qu'UN bouton WhatsApp (branche standard) — plus de doublon", () => {
    const layout = read("app/(site)/layout.tsx")
    const mounts = layout.match(/<WhatsAppButton/g) ?? []
    expect(mounts.length).toBe(1)
  })

  it("le bouton reste masqué sans numéro valide (helper de normalisation partagé)", () => {
    const btn = read("components/layout/whatsapp-button.tsx")
    expect(btn).toMatch(/toWhatsAppDigits/)
    expect(btn).toMatch(/if \(!digits\) return null/)
  })
})

describe("Spirit — header animé/compact au défilement", () => {
  const nav = () => read(`${SPIRIT}/spirit-navigation.tsx`)

  it("gère l'escamotage et le mode compact au scroll, avec seuil anti-clignotement", () => {
    const src = nav()
    expect(src).toMatch(/setHidden/)
    expect(src).toMatch(/setCompact/)
    // Seuil de delta (ignore les micro-mouvements 1–2 px).
    expect(src).toMatch(/Math\.abs\(delta\) < 6/)
    // Escamotage vers le haut.
    expect(src).toMatch(/-translate-y-full/)
  })

  it("respecte prefers-reduced-motion (header stable, jamais escamoté)", () => {
    const src = nav()
    expect(src).toMatch(/prefers-reduced-motion/)
    expect(src).toMatch(/if \(reduce\) setHidden\(false\)/)
    expect(src).toMatch(/motion-reduce:transition-none/)
  })

  it("ferme le menu au clic et bloque le scroll du body à l'ouverture", () => {
    const src = nav()
    // Les liens/CTA in-page passent par un handler partagé qui ferme le menu
    // (setOpen(false)) puis défile avec l'offset d'en-tête ; le verrou de scroll
    // du body à l'ouverture du menu est conservé.
    expect(src).toMatch(/setOpen\(false\)/)
    expect(src).toMatch(/document\.body\.style\.overflow/)
  })
})

describe("Spirit — transitions éditoriales (séparateurs décoratifs supprimés)", () => {
  it("le composant décoratif SpiritSectionDivider n'existe plus", () => {
    expect(existsSync(path.join(root, SPIRIT, "spirit-section-divider.tsx"))).toBe(false)
    expect(existsSync(path.join(root, "components/ui/spirit-section-divider.tsx"))).toBe(false)
  })

  it("la page Spirit n'utilise plus de séparateur décoratif", () => {
    const home = read(`${SPIRIT}/home-page.tsx`)
    expect(home).not.toMatch(/SpiritSectionDivider/)
  })

  it("la CSS Spirit ne contient plus de lignes à points / gouttes décoratives", () => {
    const css = read(`${SPIRIT}/spirit.css`)
    expect(css).not.toMatch(/spirit-divider/)
    expect(css).not.toMatch(/spirit-drop-in|spirit-divider-in/)
  })

  it("les transitions restent éditoriales : trait rose au-dessus des titres (spirit-rule)", () => {
    const css = read(`${SPIRIT}/spirit.css`)
    expect(css).toMatch(/\.spirit-acs \.spirit-rule/)
  })
})

describe("Spirit — header compact premium", () => {
  const nav = () => read(`${SPIRIT}/spirit-navigation.tsx`)

  it("hauteurs compactes (barre principale ≤ 76px, mode réduit 60px) et transition courte", () => {
    const src = nav()
    expect(src).toMatch(/h-\[76px\]/)
    expect(src).toMatch(/h-\[60px\]/)
    // Transition courte (180–240ms) → duration-200.
    expect(src).toMatch(/duration-200/)
  })

  it("le décalage du shell suit la hauteur compacte (pas de grand bloc blanc)", () => {
    expect(read(`${SPIRIT}/site-shell.tsx`)).toMatch(/pt-\[112px\] lg:pt-\[116px\]/)
  })
})

describe("Spirit — bandeau de réassurance premium (3 engagements)", () => {
  const band = () => read(`${SPIRIT}/spirit-reassurance.tsx`)

  it("icônes fines sans fond carré (strokeWidth fin, pas de rounded-sm/bg derrière l'icône)", () => {
    const src = band()
    expect(src).toMatch(/strokeWidth=\{1\.5\}/)
    expect(src).not.toMatch(/rounded-sm bg-\[var\(--spirit-teal\)\]/)
  })

  it("bande bleu nuit, 3 colonnes desktop avec séparateurs (divide)", () => {
    const src = band()
    expect(src).toMatch(/spirit-navy-2/)
    expect(src).toMatch(/sm:grid-cols-3/)
    expect(src).toMatch(/divide-/)
  })
})

describe("Admin — simplification Spirit (réglages standard sans effet masqués)", () => {
  const page = () => read("app/admin/(dashboard)/parametres/page.tsx")

  it("détecte le site Spirit et filtre l'onglet Apparence", () => {
    const src = page()
    expect(src).toMatch(/customSiteKey === "spirit-acs"/)
    expect(src).toMatch(/filter\(\(t\) => t\.value !== "appearance"\)/)
  })

  it("masque pour Spirit l'ordre des sections et l'onglet Apparence ; regroupe le contenu", () => {
    const src = page()
    expect(src).toMatch(/\{!isSpiritSite && \(\s*<TabsContent value="appearance"/)
    expect(src).toMatch(/Contenu du site Spirit ACS/)
    expect(src).toMatch(/simplified=\{isSpiritSite\}/)
  })

  it("SiteBranding et PublicSiteContent acceptent un mode simplifié opt-in (défaut false)", () => {
    const branding = read("components/admin/settings/site-branding.tsx")
    expect(branding).toMatch(/simplified\?\:\s*boolean/)
    expect(branding).toMatch(/simplified = false/)
    // Logo et libellés CTA Hero masqués en simplifié.
    expect(branding).toMatch(/\{!simplified && \(/)

    const content = read("components/admin/settings/public-site-content.tsx")
    expect(content).toMatch(/simplified\?\:\s*boolean/)
    expect(content).toMatch(/simplified = false/)
  })
})

describe("Non-régression — autres tenants inchangés", () => {
  it("le formulaire standard garde le champ légal facultatif et sans sélecteur d'audience", () => {
    const src = read("components/custom-request-form.tsx")
    // Libellé facultatif conservé pour le mode standard.
    expect(src).toMatch(/identifiant légal \(facultatif\)/)
    // Le sélecteur « Vous êtes : » n'apparaît que si audienceToggle est actif.
    expect(src).toMatch(/\{audienceToggle && \(/)
  })

  it("le header animé et les séparateurs vivent dans le dossier Spirit uniquement", () => {
    // Aucune modification de la navbar/footer standard n'est requise ici.
    expect(existsSync(path.join(root, SPIRIT, "spirit-navigation.tsx"))).toBe(true)
    expect(existsSync(path.join(root, SPIRIT, "spirit.css"))).toBe(true)
  })
})
