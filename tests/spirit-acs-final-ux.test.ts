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

  it("Spirit active le sélecteur d'audience (via le configurateur, Phase 5)", () => {
    // Le sélecteur d'audience Particulier/Professionnel vit désormais DANS le
    // configurateur, monté par la section devis à la place du formulaire libre
    // direct. Le comportement est préservé (aucune régression fonctionnelle).
    expect(read(`${SPIRIT}/spirit-demande-devis.tsx`)).toMatch(/SpiritConfigurator/)
    const cfg = read(`${SPIRIT}/configurator/spirit-configurator.tsx`)
    expect(cfg).toMatch(/particulier/)
    expect(cfg).toMatch(/professionnel/)
    // Le repli « Autre demande » conserve le formulaire libre avec audienceToggle.
    expect(cfg).toMatch(/audienceToggle/)
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

  it("en-tête TOUJOURS visible : fond opaque au défilement (aucun escamotage)", () => {
    const src = nav()
    // Design validé : l'en-tête reste visible en permanence. On ne masque plus
    // la barre au scroll ; seul le fond passe de transparent à bleu nuit opaque
    // au-delà d'un seuil (70 px), via un état `scrolled`.
    expect(src).toMatch(/setScrolled/)
    expect(src).toMatch(/window\.scrollY > 70/)
    // Plus aucun escamotage vers le haut ni état « caché ».
    expect(src).not.toMatch(/-translate-y-full/)
    expect(src).not.toMatch(/setHidden/)
  })

  it("respecte prefers-reduced-motion (transitions neutralisées, header stable)", () => {
    const src = nav()
    expect(src).toMatch(/prefers-reduced-motion/)
    expect(src).toMatch(/motion-reduce:transition-none/)
    // Header stable : jamais escamoté, donc aucun état « hidden » à rétablir.
    expect(src).not.toMatch(/-translate-y-full/)
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

  it("hauteur d'en-tête stable (72px mobile / 80px bureau) et transition courte", () => {
    const src = nav()
    expect(src).toMatch(/h-\[72px\]/)
    expect(src).toMatch(/lg:h-20/)
    // Transition courte (180–240ms) → duration-200.
    expect(src).toMatch(/duration-200/)
  })

  it("le décalage du shell suit la hauteur d'en-tête (pas de grand bloc blanc)", () => {
    expect(read(`${SPIRIT}/site-shell.tsx`)).toMatch(/pt-\[72px\] lg:pt-20/)
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

  it("détecte le site Spirit et filtre les catégories via le helper centralisé", () => {
    const src = page()
    expect(src).toMatch(/customSiteKey === "spirit-acs"/)
    // Le masquage (dont l'onglet Apparence) passe désormais par le helper
    // centralisé, isolé par customSiteKey, plutôt qu'un filtre inline.
    expect(src).toMatch(/getVisibleSettingsCategories\(tenant\.customSiteKey\)/)
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
