/**
 * ============================================================================
 *  CONFIGURATION CENTRALE DU SITE  —  siteConfig
 * ============================================================================
 *
 *  CE FICHIER EST LE SEUL À MODIFIER POUR PERSONNALISER LE SITE D'UN CLIENT.
 *
 *  Il centralise TOUTE l'identité de marque : nom, logo, couleurs, textes,
 *  coordonnées, réseaux sociaux, WhatsApp, horaires, etc.
 *
 *  Pour dupliquer le projet pour un nouveau client :
 *    1. Copier le projet.
 *    2. Modifier CE fichier (config/site.ts).
 *    3. Remplacer les images dans /public.
 *    4. Ajuster les couleurs dans app/globals.css (voir la section "brand").
 *
 *  Aucune connaissance technique poussée n'est requise : tout est commenté.
 * ============================================================================
 */

export type NavItem = {
  /** Libellé affiché dans le menu */
  label: string
  /** Chemin de la page (ex: "/prestations") */
  href: string
}

export type SocialLinks = {
  instagram?: string
  facebook?: string
  tiktok?: string
  youtube?: string
  linkedin?: string
}

export type BusinessHours = {
  /** Jour de la semaine (0 = dimanche, 1 = lundi, ... 6 = samedi) */
  day: number
  label: string
  /** Ouvert ce jour ? */
  open: boolean
  /** Heure d'ouverture au format "HH:mm" */
  from?: string
  /** Heure de fermeture au format "HH:mm" */
  to?: string
}

export const siteConfig = {
  /* ----------------------------------------------------------------------- */
  /*  IDENTITÉ DE MARQUE                                                     */
  /* ----------------------------------------------------------------------- */
  brand: {
    /** Nom commercial affiché partout */
    name: "DetailFlow",
    /** Slogan court affiché sous le logo / dans le hero */
    tagline: "L'excellence du detailing automobile",
    /**
     * Chemin du logo (clair) — mis dans /public.
     * Laisser vide ("") pour afficher le nom en texte stylé à la place.
     */
    logo: "",
    logoDark: "",
    /** Emoji/texte de secours si aucun logo n'est fourni */
    favicon: "/favicon.ico",
  },

  /* ----------------------------------------------------------------------- */
  /*  SEO — Métadonnées par défaut (surchargées page par page)               */
  /* ----------------------------------------------------------------------- */
  seo: {
    /** URL de production, sans slash final (utilisée pour sitemap, OG, canonical) */
    url: "https://www.detailflow.fr",
    /** Titre par défaut (balise <title>) */
    defaultTitle: "DetailFlow — Detailing automobile premium",
    /** Modèle de titre pour les pages internes ; %s = titre de la page */
    titleTemplate: "%s | DetailFlow",
    description:
      "Detailing automobile haut de gamme : lavage premium, rénovation, protection céramique et service à domicile. Prenez rendez-vous en ligne.",
    keywords: [
      "detailing automobile",
      "lavage auto premium",
      "protection céramique",
      "rénovation carrosserie",
      "nettoyage voiture à domicile",
    ],
    /** Langue du site */
    locale: "fr_FR",
    /** Image Open Graph par défaut (1200x630) dans /public */
    ogImage: "/og-image.png",
    /** Compte Twitter/X (ex: "@detailflow") — optionnel */
    twitterHandle: "",
  },

  /* ----------------------------------------------------------------------- */
  /*  COORDONNÉES                                                            */
  /* ----------------------------------------------------------------------- */
  contact: {
    /** Téléphone affiché */
    phone: "+33 6 12 34 56 78",
    /** Version "brute" pour les liens tel: (sans espaces) */
    phoneRaw: "+33612345678",
    email: "contact@detailflow.fr",
    /** Adresse de l'atelier / base (aussi utilisée pour le calcul de déplacement) */
    address: {
      street: "12 rue des Artisans",
      zip: "75011",
      city: "Paris",
      country: "France",
    },
    /** Numéro WhatsApp au format international sans "+" ni espaces */
    whatsapp: "33612345678",
    /** Message pré-rempli à l'ouverture de WhatsApp */
    whatsappMessage: "Bonjour, je souhaite des informations sur vos prestations de detailing.",
  },

  /* ----------------------------------------------------------------------- */
  /*  RÉSEAUX SOCIAUX (laisser vide "" pour masquer un réseau)               */
  /* ----------------------------------------------------------------------- */
  social: {
    instagram: "https://instagram.com/detailflow",
    facebook: "https://facebook.com/detailflow",
    tiktok: "https://tiktok.com/@detailflow",
    youtube: "",
    linkedin: "",
  } satisfies SocialLinks,

  /* ----------------------------------------------------------------------- */
  /*  HORAIRES D'OUVERTURE                                                   */
  /* ----------------------------------------------------------------------- */
  hours: [
    { day: 1, label: "Lundi", open: true, from: "09:00", to: "18:00" },
    { day: 2, label: "Mardi", open: true, from: "09:00", to: "18:00" },
    { day: 3, label: "Mercredi", open: true, from: "09:00", to: "18:00" },
    { day: 4, label: "Jeudi", open: true, from: "09:00", to: "18:00" },
    { day: 5, label: "Vendredi", open: true, from: "09:00", to: "18:00" },
    { day: 6, label: "Samedi", open: true, from: "10:00", to: "16:00" },
    { day: 0, label: "Dimanche", open: false },
  ] satisfies BusinessHours[],

  /* ----------------------------------------------------------------------- */
  /*  NAVIGATION PRINCIPALE                                                  */
  /* ----------------------------------------------------------------------- */
  nav: [
    { label: "Accueil", href: "/" },
    { label: "Prestations", href: "/prestations" },
    { label: "Avis", href: "/avis" },
    { label: "Contact", href: "/contact" },
  ] satisfies NavItem[],

  /** Liens du pied de page (mentions légales, etc.) */
  legalNav: [
    { label: "Mentions légales", href: "/mentions-legales" },
    { label: "CGV", href: "/cgv" },
    { label: "Politique de confidentialité", href: "/confidentialite" },
  ] satisfies NavItem[],

  /* ----------------------------------------------------------------------- */
  /*  APPEL À L'ACTION PRINCIPAL (bouton "Réserver")                         */
  /* ----------------------------------------------------------------------- */
  cta: {
    label: "Réserver",
    /**
     * Destination du bouton de réservation.
     * Le moteur de réservation en ligne (Phase 2) est actif : /reservation.
     * Pour désactiver la réservation en ligne, repasser sur "/contact"
     * et mettre features.booking à false.
     */
    href: "/reservation",
  },

  /* ----------------------------------------------------------------------- */
  /*  FONCTIONNALITÉS ACTIVABLES (préparent les phases suivantes)            */
  /* ----------------------------------------------------------------------- */
  features: {
    /** Moteur de réservation en ligne (Phase 2) */
    booking: true,
    /** Espace client avec comptes (Phase 5) */
    clientAccounts: false,
    /** Paiement d'acompte en ligne (Phase 4) */
    onlineDeposit: false,
    /** Dashboard administrateur (Phase 3) */
    adminDashboard: false,
  },
} as const

export type SiteConfig = typeof siteConfig

/** URL WhatsApp prête à l'emploi, construite depuis la config. */
export function getWhatsAppUrl(): string {
  const { whatsapp, whatsappMessage } = siteConfig.contact
  const base = `https://wa.me/${whatsapp}`
  return whatsappMessage ? `${base}?text=${encodeURIComponent(whatsappMessage)}` : base
}

/** Adresse complète formatée sur une ligne. */
export function getFullAddress(): string {
  const { street, zip, city, country } = siteConfig.contact.address
  return `${street}, ${zip} ${city}, ${country}`
}
