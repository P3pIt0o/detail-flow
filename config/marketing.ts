/**
 * ============================================================================
 *  CONTENU DE LA VITRINE SaaS DetailFlow (domaine racine)
 * ============================================================================
 *  Centralise TOUT le texte de la landing page pour un ajustement facile.
 *
 *  Positionnement : DetailFlow n'est PAS un simple module de réservation.
 *  C'est le logiciel de GESTION tout-en-un des professionnels du detailing
 *  automobile (réservations, planning, clients, véhicules, prestations, devis,
 *  factures, suivi d'activité, automatisations, site connecté).
 *
 *  RÈGLES STRICTES :
 *  - Ne JAMAIS employer « essai gratuit » (voir CGV). L'accès se fait via le
 *    programme Beta réel (formulaire de candidature).
 *  - Ne JAMAIS inventer d'avis, d'étoiles, de nombre de clients, de chiffres,
 *    de témoignages ou d'entreprises. Les seules preuves sociales autorisées
 *    sont les partenaires réels ayant explicitement consenti (`consent: true`).
 * ============================================================================
 */

import {
  Calendar,
  CalendarClock,
  FileText,
  Gauge,
  Car,
  Bell,
  Palette,
  ShieldCheck,
  Users,
  Receipt,
  Wallet,
  Globe,
  MessageSquareText,
  ClipboardList,
} from "lucide-react"

export const marketing = {
  brand: {
    name: "DetailFlow",
    tagline: "Le logiciel de gestion des professionnels du detailing automobile",
  },

  /* ----------------------------------------------------------------------- */
  /*  HERO                                                                   */
  /* ----------------------------------------------------------------------- */
  hero: {
    badge: "La bêta est ouverte aux professionnels sélectionnés",
    title: "Vous detaillez. DetailFlow gère le reste.",
    subtitle:
      "Réservations, planning, clients, véhicules, devis, factures et automatisations réunis dans un seul outil conçu pour les professionnels du detailing.",
    betaLine:
      "La bêta DetailFlow est actuellement ouverte aux professionnels du detailing sélectionnés.",
    primaryCta: { label: "Rejoindre la bêta gratuitement", href: "#beta" },
    secondaryCta: { label: "Voir comment ça marche", href: "#workflow" },
    /** Réassurance sobre affichée sous le CTA (hero + CTA final). */
    reassurance: "Accès gratuit pendant la bêta • Avantages exclusifs à vie • Aucun engagement",
    /** Notifications sobres affichées autour du dashboard (produit réel). */
    notifications: [
      "Nouvelle réservation",
      "Devis accepté",
      "Facture créée",
      "Rappel envoyé",
      "Nouvel avis client",
    ],
    image: {
      src: "/marketing/dashboard-preview.png",
      alt: "Tableau de bord DetailFlow : réservations, planning et chiffre d'affaires d'un professionnel du detailing automobile",
    },
  },

  /* ----------------------------------------------------------------------- */
  /*  OVERVIEW                                                               */
  /* ----------------------------------------------------------------------- */
  overview: {
    title: "Un seul outil pour gérer toute votre activité de detailing",
    description:
      "DetailFlow centralise les réservations, le planning, les clients, les véhicules, les prestations, les devis, les factures et les automatisations. Vous remplacez plusieurs outils séparés par une plateforme unique, pensée pour le detailing.",
  },

  /* ----------------------------------------------------------------------- */
  /*  PROBLÈME (situation actuelle de nombreux detailers)                    */
  /* ----------------------------------------------------------------------- */
  problem: {
    title: "Votre métier, c'est le detailing. Pas l'administratif.",
    lead: "Aujourd'hui, une demande arrive par Instagram, une autre par WhatsApp, un rendez-vous se note sur un carnet, un devis se tape dans un tableur, une facture ailleurs, et les relances se font de mémoire.",
    tools: ["Instagram", "DM", "WhatsApp", "Téléphone", "Agenda papier", "Excel", "Devis", "Factures", "Relances"],
    conclusion:
      "Quand votre activité grandit, gérer tous ces outils séparément vous fait perdre du temps et augmente les risques d'oubli. DetailFlow centralise tout.",
  },

  /* ----------------------------------------------------------------------- */
  /*  AVANT / APRÈS                                                          */
  /* ----------------------------------------------------------------------- */
  beforeAfter: {
    title: "Le quotidien change vraiment",
    before: {
      label: "Sans DetailFlow",
      items: [
        "Demandes dispersées dans les DM",
        "Appels pendant les prestations",
        "Rendez-vous notés à la main",
        "Informations clients éparpillées",
        "Devis dans un tableur séparé",
        "Factures créées à part",
        "Relances oubliées",
        "Suivi d'activité approximatif",
      ],
    },
    after: {
      label: "Avec DetailFlow",
      items: [
        "Réservation en ligne 24/7",
        "Planning centralisé",
        "Fiche client et véhicules réunies",
        "Prestations et tarifs paramétrés",
        "Devis générés en quelques clics",
        "Facturation reliée au devis",
        "Rappels et avis automatisés",
        "Suivi clair de votre activité",
      ],
    },
  },

  /* ----------------------------------------------------------------------- */
  /*  WORKFLOW (de la réservation à la facture)                              */
  /* ----------------------------------------------------------------------- */
  workflow: {
    title: "De la réservation à la facture. Tout est connecté.",
    lead: "Chaque étape alimente la suivante, sans ressaisir les mêmes informations.",
    steps: [
      {
        step: "01",
        title: "Votre client réserve",
        description: "Il sélectionne sa prestation, son véhicule et son créneau depuis votre site, à toute heure.",
        image: { src: "/marketing/product/booking.png", alt: "Page de réservation en ligne DetailFlow" },
      },
      {
        step: "02",
        title: "DetailFlow organise",
        description: "Le rendez-vous arrive dans le planning et les informations client sont centralisées automatiquement.",
        image: { src: "/marketing/product/calendar.png", alt: "Planning des rendez-vous dans DetailFlow" },
      },
      {
        step: "03",
        title: "Vous réalisez la prestation",
        description: "Toutes les informations utiles (véhicule, prestation, options) sont disponibles depuis DetailFlow.",
        image: null,
      },
      {
        step: "04",
        title: "Vous facturez",
        description: "Créez le devis puis la facture sans ressaisir les informations : moins de saisie, moins d'erreurs.",
        image: { src: "/marketing/product/quote.png", alt: "Création de devis dans DetailFlow" },
      },
      {
        step: "05",
        title: "DetailFlow assure le suivi",
        description: "Confirmation, rappel avant le rendez-vous et demande d'avis peuvent être envoyés automatiquement.",
        image: { src: "/marketing/product/invoice.png", alt: "Facture générée par DetailFlow" },
      },
    ],
  },

  /* ----------------------------------------------------------------------- */
  /*  FONCTIONNALITÉS (bénéfices, pas features brutes)                       */
  /* ----------------------------------------------------------------------- */
  features: [
    {
      icon: Calendar,
      title: "Réservation en ligne",
      description:
        "Vos clients réservent pendant que vous travaillez sur un véhicule. Disponibilités, zones de déplacement et acomptes gérés automatiquement.",
    },
    {
      icon: CalendarClock,
      title: "Planning centralisé",
      description: "Tous vos rendez-vous au même endroit, à jour en temps réel, consultables depuis votre téléphone.",
    },
    {
      icon: Users,
      title: "Clients & véhicules",
      description:
        "Retrouvez chaque client, son véhicule et son historique de prestations en quelques secondes, sans fouiller vos messages.",
    },
    {
      icon: Car,
      title: "Prestations sur mesure",
      description:
        "Configurez vos prestations, options et tarifs par type de véhicule. L'outil parle le langage du detailing.",
    },
    {
      icon: FileText,
      title: "Devis & factures",
      description:
        "Passez du devis à la facture sans tout recommencer. Numérotation, TVA et logo de votre entreprise inclus.",
    },
    {
      icon: Wallet,
      title: "Chiffre d'affaires & frais",
      description:
        "Suivez ce que votre activité rapporte réellement en tenant compte des produits utilisés et des frais liés aux prestations.",
    },
    {
      icon: Bell,
      title: "Automatisations",
      description: "Confirmations, rappels avant rendez-vous et demandes d'avis partent automatiquement, sans y penser.",
    },
    {
      icon: Palette,
      title: "Site à votre image",
      description: "Chaque entreprise dispose de son propre site vitrine, avec son logo, ses couleurs et son sous-domaine.",
    },
    {
      icon: ShieldCheck,
      title: "Vos données vous appartiennent",
      description: "Export complet de vos clients, réservations et factures à tout moment, aux formats standard.",
    },
  ],

  /* ----------------------------------------------------------------------- */
  /*  AUTOMATISATIONS (scénarios concrets)                                   */
  /* ----------------------------------------------------------------------- */
  automations: {
    title: "DetailFlow travaille même quand vous ne travaillez pas.",
    lead: "Moins de tâches répétitives, moins d'oublis, une meilleure expérience client.",
    scenarios: [
      { icon: Calendar, trigger: "Nouvelle réservation", action: "Confirmation envoyée au client" },
      { icon: Bell, trigger: "Rendez-vous le lendemain", action: "Rappel automatique envoyé" },
      { icon: MessageSquareText, trigger: "Prestation terminée", action: "Demande d'avis envoyée" },
    ],
  },

  /* ----------------------------------------------------------------------- */
  /*  DEVIS & FACTURATION (chaîne de valeur)                                 */
  /* ----------------------------------------------------------------------- */
  billing: {
    title: "Du devis à la facture sans tout recommencer",
    lead: "Moins de saisie. Moins d'erreurs. Une image plus professionnelle auprès du client.",
    chain: ["Client", "Véhicule", "Prestation", "Devis", "Facture"],
  },

  /* ----------------------------------------------------------------------- */
  /*  SITE INTERNET + DETAILFLOW (différenciation)                           */
  /* ----------------------------------------------------------------------- */
  connectedSite: {
    title: "Votre site et votre gestion enfin connectés",
    lead: "DetailFlow fait le lien entre votre site internet et votre gestion quotidienne.",
    chain: ["Votre site", "Bouton réserver", "DetailFlow", "Planning", "Client + véhicule + prestation"],
  },

  /* ----------------------------------------------------------------------- */
  /*  POSITIONNEMENT DETAILING                                               */
  /* ----------------------------------------------------------------------- */
  positioning: {
    title: "Pas un logiciel générique adapté au detailing. Un logiciel pensé pour le detailing.",
    lead: "Chaque fonction correspond à la réalité d'un atelier de detailing.",
    items: [
      "Clients",
      "Véhicules",
      "Prestations",
      "Réservations",
      "Planning",
      "Devis",
      "Facturation",
      "Automatisations",
      "Suivi d'activité",
    ],
  },

  /* ----------------------------------------------------------------------- */
  /*  BÉNÉFICES                                                              */
  /* ----------------------------------------------------------------------- */
  benefits: {
    title: "Pourquoi les detailers choisissent DetailFlow",
    items: [
      {
        title: "Gagnez du temps",
        description:
          "Automatisez la prise de rendez-vous, les confirmations et les rappels. Concentrez-vous sur le métier.",
      },
      {
        title: "Image professionnelle",
        description: "Un site moderne et un parcours de réservation fluide renforcent la confiance de vos clients.",
      },
      {
        title: "Zéro double saisie",
        description: "Réservation, devis et facture partagent les mêmes données. Fini les erreurs de recopie.",
      },
      {
        title: "Pensé pour le detailing",
        description: "Types de véhicules, options, protection céramique : l'outil parle votre langage, pas l'inverse.",
      },
    ],
  },

  /**
   * Preuve sociale — partenaires bêta RÉELS uniquement.
   *
   * RÈGLE STRICTE : `count` reste `null` et `companies` ne contient que des
   * entreprises ayant explicitement consenti (`consent: true`). Ne JAMAIS
   * inventer de nombre, de nom d'entreprise ni de témoignage.
   */
  betaPartners: {
    label: "Déjà testé sur le terrain",
    fallbackNote: "Actuellement testé par des professionnels du detailing.",
    count: null as number | null,
    companies: [
      { name: "Rhine Shine Detailling", logo: "/marketing/partners/rhine-shine.jpg", consent: true },
      { name: "KY Detailing", logo: "/marketing/partners/ky-detailing.png", consent: true },
      { name: "AutoCare — Nettoyage Automobile", logo: "/marketing/partners/autocare.jpg", consent: true },
      { name: "JustClean — Lavage Auto", logo: "/marketing/partners/justclean.jpg", consent: true },
    ] as Array<{ name: string; logo: string; url?: string; consent: boolean }>,
  },

  /* ----------------------------------------------------------------------- */
  /*  BETA (conversion réelle)                                               */
  /* ----------------------------------------------------------------------- */
  beta: {
    badge: "Programme bêta ouvert",
    title: "Rejoignez DetailFlow avant son lancement officiel.",
    lead: "Nous ouvrons actuellement DetailFlow à une sélection de professionnels du detailing. Utilisez gratuitement la plateforme pendant sa phase bêta, participez à son évolution et conservez des avantages exclusifs réservés à vie aux premiers bêta-testeurs.",
    /** Trois avantages présentés en cartes. */
    perks: [
      {
        title: "Testez gratuitement DetailFlow",
        description: "Utilisez la plateforme dans votre activité pendant toute la phase bêta.",
      },
      {
        title: "Participez à sa construction",
        description:
          "Vos retours terrain nous permettent de construire DetailFlow autour des besoins réels des professionnels du detailing.",
      },
      {
        title: "Gardez votre statut de bêta-testeur",
        description:
          "Les professionnels ayant participé à la bêta conserveront des avantages exclusifs à vie après le lancement officiel de DetailFlow.",
      },
    ],
    /** Mise en avant premium "bêta-testeur historique". */
    historic: {
      label: "Bêta-testeur DetailFlow",
      title: "Vous étiez là avant le lancement.",
      description:
        "Les professionnels sélectionnés pour la bêta bénéficieront d'avantages exclusifs réservés aux premiers utilisateurs de DetailFlow, y compris après le lancement officiel. Ces avantages resteront liés à leur statut de bêta-testeur.",
    },
    sectionCta: { label: "Je veux rejoindre la bêta", href: "#beta-form" },
    /** Intro juste avant le formulaire. */
    formIntro: {
      title: "Devenez l'un des premiers utilisateurs de DetailFlow.",
      description:
        "Accès gratuit pendant la phase bêta et avantages exclusifs à vie réservés aux professionnels sélectionnés.",
    },
    formTitle: "Candidater au programme bêta",
    formNote:
      "La bêta est une sélection de professionnels avec lesquels nous construisons DetailFlow. Nous étudions chaque candidature et revenons vers vous rapidement.",
  },

  /* ----------------------------------------------------------------------- */
  /*  CTA FINAL                                                              */
  /* ----------------------------------------------------------------------- */
  finalCta: {
    title: "Faites partie des premiers à utiliser DetailFlow.",
    subtitle:
      "Testez gratuitement la plateforme pendant sa phase bêta, participez à son évolution et conservez des avantages exclusifs à vie réservés aux bêta-testeurs.",
    primaryCta: { label: "Rejoindre la bêta gratuitement", href: "#beta" },
    secondaryCta: { label: "Voir la démonstration", href: "#workflow" },
    reassurance: "Accès bêta gratuit • Avantages exclusifs à vie • Aucun engagement",
  },

  /* ----------------------------------------------------------------------- */
  /*  FAQ (utile commercialement ET pour le SEO / moteurs IA)                */
  /* ----------------------------------------------------------------------- */
  faq: [
    {
      q: "Qu'est-ce qu'un logiciel de detailing automobile ?",
      a: "C'est un logiciel de gestion conçu pour les professionnels du detailing. DetailFlow centralise les réservations, le planning, les clients, les véhicules, les prestations, les devis, les factures et les automatisations d'un atelier de detailing.",
    },
    {
      q: "À qui s'adresse DetailFlow ?",
      a: "Aux professionnels du detailing automobile : ateliers, indépendants et entreprises de nettoyage et rénovation qui veulent gérer leur activité au même endroit plutôt qu'avec plusieurs outils séparés.",
    },
    {
      q: "Comment fonctionne la réservation en ligne avec DetailFlow ?",
      a: "Vos clients choisissent une prestation, un véhicule et un créneau depuis votre site. Le rendez-vous arrive directement dans votre planning et la fiche client est créée automatiquement.",
    },
    {
      q: "DetailFlow permet-il de créer des devis et des factures ?",
      a: "Oui. Vous créez un devis puis la facture correspondante sans ressaisir les informations, avec numérotation, TVA et le logo de votre entreprise.",
    },
    {
      q: "Peut-on gérer plusieurs véhicules pour un même client ?",
      a: "Oui. Chaque client peut avoir plusieurs véhicules, avec l'historique des prestations réalisées pour chacun.",
    },
    {
      q: "DetailFlow permet-il de suivre son chiffre d'affaires ?",
      a: "Oui. Un tableau de bord présente le chiffre d'affaires, les réservations à venir et l'activité de l'atelier.",
    },
    {
      q: "Peut-on prendre en compte les frais liés aux prestations ?",
      a: "Oui. Vous pouvez tenir compte des produits utilisés pendant les prestations, des consommables et des frais associés pour obtenir une vision plus réaliste de ce que rapporte votre activité.",
    },
    {
      q: "Peut-on automatiser les rappels de rendez-vous ?",
      a: "Oui. DetailFlow peut envoyer automatiquement une confirmation à la réservation puis un rappel avant le rendez-vous.",
    },
    {
      q: "Peut-on demander automatiquement un avis client ?",
      a: "Oui. Une demande d'avis peut être envoyée automatiquement une fois la prestation terminée.",
    },
    {
      q: "Peut-on connecter DetailFlow à un site internet ?",
      a: "Oui. Chaque entreprise dispose de son propre site vitrine avec un bouton de réservation relié directement à DetailFlow.",
    },
    {
      q: "DetailFlow fonctionne-t-il sur smartphone ?",
      a: "Oui. DetailFlow s'utilise depuis un navigateur sur ordinateur, tablette et smartphone.",
    },
    {
      q: "Comment mes données sont-elles gérées ?",
      a: "Vous restez propriétaire de vos données et pouvez les exporter à tout moment aux formats standard (CSV et JSON).",
    },
  ],
} as const
