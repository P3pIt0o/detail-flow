/**
 * Onboarding « Vos premiers pas » — logique PURE et déterministe.
 *
 * Aucune dépendance DB / React / réseau : reçoit uniquement des signaux booléens
 * DÉJÀ calculés à partir des données réellement enregistrées du tenant, et
 * renvoie la liste ordonnée des étapes + la progression.
 *
 * Principe : aucune étape n'est cochée manuellement. Chaque `done` reflète une
 * donnée existante (profil, prestation, horaires, site public, réservation).
 * Les `href` sont des chemins RELATIFS ; l'ajout du paramètre tenant est fait
 * côté page serveur (withTenant) pour préserver l'isolation multi-tenant.
 */

export type OnboardingStepKey =
  | "company"
  | "billing"
  | "service"
  | "availability"
  | "publicSite"
  | "booking"

export type OnboardingStep = {
  key: OnboardingStepKey
  title: string
  description: string
  done: boolean
  href: string
}

export type OnboardingResult = {
  steps: OnboardingStep[]
  doneCount: number
  total: number
  /** Toutes les étapes sont terminées. */
  allDone: boolean
  /** Progression en pourcentage entier (0–100). */
  percent: number
}

/** Signaux d'avancement, dérivés des données réelles côté serveur. */
export type OnboardingSignals = {
  /** Nom + téléphone + adresse de l'entreprise renseignés. */
  companyInfoComplete: boolean
  /** Profil de facturation confirmé (billingProfileConfirmedAt non nul). */
  billingConfirmed: boolean
  /** Au moins une prestation créée. */
  hasService: boolean
  /** Des horaires d'ouverture sont enregistrés (au moins un jour ouvert). */
  hasAvailability: boolean
  /** Site public : description d'activité + téléphone de contact. */
  publicSiteComplete: boolean
  /** Au moins une réservation a été enregistrée (parcours testé). */
  hasBooking: boolean
}

/**
 * Construit la liste des étapes d'onboarding à partir des signaux réels.
 * L'ordre est stable et pensé pour un accompagnement progressif.
 */
export function computeOnboardingSteps(signals: OnboardingSignals): OnboardingResult {
  const steps: OnboardingStep[] = [
    {
      key: "company",
      title: "Compléter les informations de mon entreprise",
      description: "Votre nom, votre téléphone et votre adresse, pour vos factures et vos clients.",
      done: signals.companyInfoComplete,
      href: "/admin/parametres?tab=business",
    },
    {
      key: "billing",
      title: "Configurer ma facturation",
      description: "Vos informations légales et votre TVA, pour des factures en règle.",
      done: signals.billingConfirmed,
      href: "/admin/parametres?tab=invoicing",
    },
    {
      key: "service",
      title: "Créer ma première prestation",
      description: "Ce que vous proposez, son prix et sa durée.",
      done: signals.hasService,
      href: "/admin/prestations",
    },
    {
      key: "availability",
      title: "Définir mes disponibilités",
      description: "Vos horaires réels, pour que les créneaux proposés soient les vôtres.",
      done: signals.hasAvailability,
      href: "/admin/parametres?tab=hours",
    },
    {
      key: "publicSite",
      title: "Compléter mon site public",
      description: "Une description de votre activité et un téléphone où vous joindre.",
      done: signals.publicSiteComplete,
      href: "/admin/parametres?tab=site",
    },
    {
      key: "booking",
      title: "Tester mon parcours de réservation",
      description: "Vérifiez que vos clients peuvent réserver sans accroc. Se coche à la première réservation.",
      done: signals.hasBooking,
      href: "/admin/reservations",
    },
  ]

  const total = steps.length
  const doneCount = steps.filter((s) => s.done).length
  return {
    steps,
    doneCount,
    total,
    allDone: doneCount === total,
    percent: total === 0 ? 0 : Math.round((doneCount / total) * 100),
  }
}
