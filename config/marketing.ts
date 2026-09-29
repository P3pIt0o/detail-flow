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

/**
 * ============================================================================
 *  CONTENU VITRINE v2 — REFONTE MARKETING (Lot 3)
 * ============================================================================
 *  Namespace dédié pour la nouvelle composition storytelling. Séparé de
 *  `marketing` (ci-dessus) pour NE RIEN casser des composants existants qui
 *  s'y réfèrent encore (StaticMarketingContent, beta-form, marketing-sections).
 *
 *  RÈGLES STRICTES (identiques) :
 *  - Aucune fausse UI, aucun faux avis, aucun faux chiffre.
 *  - CTA principal orienté self-service : « Créer mon espace » -> /admin/signup.
 *  - Les prix ci-dessous sont les valeurs commerciales validées en Phase 2.
 *    Ils seront reliés à la source unique `lib/pricing/plans.ts` au Lot 4.
 * ============================================================================
 */
export const marketingV2 = {
  /* ----------------------------------- HERO ----------------------------------- */
  hero: {
    badge: "Logiciel de gestion pour les professionnels du detailing",
    title: "Vous detaillez. DetailFlow gère tout le reste.",
    subtitle:
      "Réservations, planning, clients, véhicules, devis, factures et relances automatiques réunis dans un seul outil pensé pour le detailing automobile.",
    primaryCta: { label: "Créer mon espace", href: "/demarrer" },
    secondaryCta: { label: "Voir comment ça marche", href: "#parcours" },
    highlights: ["Réservation en ligne 24/7", "Planning temps réel", "Devis & factures reliés", "Rappels automatiques"],
    reassurance:
      "Sans carte bancaire pour commencer • Votre page en ligne en quelques minutes • Vos données exportables à tout moment",
    image: {
      src: "/marketing/dashboard-preview.png",
      alt: "Tableau de bord DetailFlow : réservations, planning et chiffre d'affaires d'un professionnel du detailing",
    },
    notifications: ["Nouvelle réservation", "Devis accepté", "Facture créée", "Rappel envoyé", "Nouvel avis client"],
  },

  /* --------------------------------- PROBLÈMES -------------------------------- */
  painPoints: {
    title: "Le detailing, vous savez faire. La gestion vous mange vos journées.",
    lead: "Une demande sur Instagram, une autre par SMS, un rendez-vous noté sur un carnet, un devis dans un tableur, une facture ailleurs, des relances de tête. Plus l'activité grandit, plus le risque d'oubli augmente.",
    items: [
      {
        title: "Des demandes partout",
        description: "Instagram, WhatsApp, appels, formulaires : impossible de tout suivre au même endroit.",
      },
      {
        title: "Un agenda fragile",
        description: "Un rendez-vous mal noté, un créneau doublé, et c'est toute la journée qui déraille.",
      },
      {
        title: "De la double saisie",
        description: "Les mêmes informations recopiées du message au devis, puis du devis à la facture.",
      },
      {
        title: "Des rendez-vous manqués",
        description: "Sans confirmation ni rappel, certains clients oublient tout simplement de venir.",
      },
    ],
  },

  /* --------------------------- CHAÎNE AVANT / NO-SHOW -------------------------- */
  noShow: {
    title: "Moins de rendez-vous manqués, sans y penser",
    lead: "DetailFlow enchaîne automatiquement les étapes qui sécurisent un rendez-vous : acompte à la réservation, confirmation immédiate et rappel avant le jour J.",
    steps: [
      { label: "Réservation en ligne", description: "Le client choisit sa prestation, son véhicule et son créneau." },
      { label: "Acompte demandé", description: "Un acompte peut être encaissé à la réservation via le paiement en ligne." },
      { label: "Confirmation immédiate", description: "Le client reçoit une confirmation dès la réservation validée." },
      { label: "Rappel avant le rendez-vous", description: "Un rappel automatique est envoyé avant le jour J." },
      { label: "Client présent", description: "Le créneau est sécurisé, votre planning reste fiable." },
    ],
    acomptePlaceholder: "Encaissement d'acompte côté client (paiement en ligne connecté)",
    footnote: "L'encaissement d'acompte s'appuie sur le paiement en ligne connecté à votre compte professionnel.",
  },

  /* ------------------------------ PARCOURS CLIENT ----------------------------- */
  journey: {
    title: "Le parcours de votre client, de la réservation à l'avis",
    lead: "Chaque étape alimente la suivante, sans jamais ressaisir les mêmes informations.",
    steps: [
      {
        n: "01",
        title: "Il réserve en ligne",
        description: "Depuis votre page, à toute heure, il choisit sa prestation, son véhicule et son créneau.",
        image: { src: "/marketing/product/booking.png", alt: "Page de réservation en ligne DetailFlow" },
        placeholder: null as string | null,
      },
      {
        n: "02",
        title: "Le rendez-vous arrive dans votre planning",
        description: "Le créneau se place automatiquement et la fiche client est créée sans ressaisie.",
        image: { src: "/marketing/product/calendar.png", alt: "Planning des rendez-vous dans DetailFlow" },
        placeholder: null as string | null,
      },
      {
        n: "03",
        title: "Sa fiche se remplit toute seule",
        description: "Client, véhicule et historique des prestations réunis au même endroit.",
        image: null as { src: string; alt: string } | null,
        placeholder: "Fiche client DetailFlow (coordonnées, véhicules, historique des prestations)",
      },
      {
        n: "04",
        title: "Vous éditez devis puis facture",
        description: "Le devis devient facture en conservant les mêmes informations : moins de saisie, moins d'erreurs.",
        image: { src: "/marketing/product/quote.png", alt: "Création de devis dans DetailFlow" },
        placeholder: null as string | null,
      },
      {
        n: "05",
        title: "Le suivi part automatiquement",
        description: "Confirmation, rappel avant le rendez-vous et demande d'avis peuvent s'envoyer sans intervention.",
        image: { src: "/marketing/product/invoice.png", alt: "Facture générée par DetailFlow" },
        placeholder: null as string | null,
      },
    ],
  },

  /* ----------------------- CENTRALISATION PROFESSIONNELLE --------------------- */
  cockpit: {
    title: "Votre activité entière, dans un seul cockpit",
    lead: "Réservations, planning, clients, véhicules, devis, factures et chiffre d'affaires réunis dans une interface unique, pensée pour le detailing.",
    points: [
      "Tableau de bord clair de votre activité",
      "Planning temps réel consultable partout",
      "Fiches clients et véhicules centralisées",
      "Devis, factures et suivi du chiffre d'affaires",
    ],
    image: {
      src: "/marketing/dashboard-preview.png",
      alt: "Tableau de bord DetailFlow d'un professionnel du detailing",
    },
    statsPlaceholder: "Vue chiffre d'affaires et statistiques d'activité",
    mobilePlaceholder: "Réservation et planning sur mobile",
  },

  /* ------------------------------ AUTOMATISATIONS ----------------------------- */
  automations: {
    title: "DetailFlow travaille même quand vous ne travaillez pas",
    lead: "Moins de tâches répétitives, moins d'oublis, une meilleure expérience client.",
    scenarios: [
      { trigger: "Nouvelle réservation", action: "Confirmation envoyée au client" },
      { trigger: "Rendez-vous le lendemain", action: "Rappel automatique envoyé" },
      { trigger: "Prestation terminée", action: "Demande d'avis envoyée" },
    ],
    notificationPlaceholder: "Exemple de notification / rappel reçu par le client",
  },

  /* ---------------------- PAGE PROFESSIONNELLE EN MINUTES --------------------- */
  publicPage: {
    badge: "Votre présence en ligne",
    title: "Votre page professionnelle en ligne en quelques minutes",
    lead: "Dès la création de votre espace, DetailFlow génère une page professionnelle à votre nom : votre logo, vos couleurs, vos prestations et un bouton de réservation relié directement à votre planning.",
    points: [
      "Une adresse dédiée, prête à partager",
      "Vos prestations et vos tarifs mis en avant",
      "La réservation en ligne intégrée",
      "Personnalisable à votre image",
    ],
    cta: { label: "Créer mon espace", href: "/demarrer" },
    placeholder: "Page publique d'un professionnel (démo) générée par DetailFlow",
  },

  /* ----------------------------------------------------------------------------
   * PRICING — DÉPLACÉ vers la SOURCE UNIQUE `lib/pricing/plans.ts`.
   * Le marketing ne définit plus ses propres prix/offres : la section tarifs
   * (<Pricing />) consomme désormais COMMERCIAL_PLANS / LIFETIME_OFFER, reliés
   * au moteur de licences. Ne PAS réintroduire d'objet `pricing` ici.
   * -------------------------------------------------------------------------- */

  /* ------------------------ PREUVE SOCIALE / TRUSTPILOT ----------------------- */
  socialProof: {
    title: "Ils utilisent déjà DetailFlow sur le terrain",
    lead: "Des professionnels du detailing font confiance à DetailFlow au quotidien.",
    trustpilotTitle: "Nos avis vérifiés",
  },

  /* --------------------------------- CTA FINAL -------------------------------- */
  finalCta: {
    title: "Prêt à gérer votre activité au même endroit ?",
    subtitle: "Créez votre espace DetailFlow et mettez votre page professionnelle en ligne dès aujourd'hui.",
    primaryCta: { label: "Créer mon espace", href: "/demarrer" },
    secondaryCta: { label: "Voir les tarifs", href: "#tarifs" },
    reassurance: "Sans carte bancaire pour commencer • Vos données exportables à tout moment",
  },
} as const

/**
 * ============================================================================
 *  CONTENU VITRINE v3 — REFONTE « PHILOSOPHIE KARZLY » (Lot 3bis)
 * ============================================================================
 *  Objectif : qu'un professionnel comprenne DetailFlow en moins de 5 secondes.
 *  Narration continue, une idée par section, titres SEO explicites (H1 unique,
 *  H2 orientés intentions de recherche), aucune fausse UI ni faux chiffre.
 *  CTA principal self-service : « Créer mon espace » -> /demarrer.
 * ============================================================================
 */
export const marketingV3 = {
  hero: {
    eyebrow: "Logiciel de gestion pour detailing automobile",
    // H1 UNIQUE de la homepage : explicite, pas d'accroche abstraite.
    h1: "Le logiciel de gestion conçu pour les professionnels du detailing",
    subtitle:
      "Réservations, planning, clients, acomptes, facturation et site internet : gérez votre activité depuis un seul espace.",
    primaryCta: { label: "Créer mon espace", href: "/demarrer" },
    secondaryCta: { label: "Découvrir DetailFlow", href: "#decouvrir" },
    image: {
      src: "/marketing/dashboard-preview.png",
      alt: "Tableau de bord DetailFlow : réservations, planning et chiffre d'affaires d'un centre de detailing",
    },
    reassurance: "Sans carte bancaire pour commencer • Votre page en ligne en quelques minutes",
  },

  problem: {
    title: "Votre gestion est éparpillée",
    lead: "Réservations sur Instagram, rendez-vous sur un carnet, factures dans un tableur, rappels de tête. Plus l'activité grandit, plus le risque d'oubli augmente.",
    scattered: ["Réservations", "Planning", "Clients", "Acomptes", "Factures", "Rappels", "Site internet"],
    convergeLabel: "DetailFlow",
    convergeMessage: "Tout votre centre de detailing au même endroit.",
  },

  overview: {
    id: "decouvrir",
    title: "Tout ce qu'il faut pour gérer votre centre de detailing",
    lead: "Une seule plateforme, du premier contact client à la facture.",
  },

  // Sections fonctionnelles, alternance texte / produit (H2 SEO explicites).
  features: [
    {
      id: "reservations",
      reversed: false,
      h2: "Des réservations en ligne adaptées à votre activité",
      lead: "Vos clients réservent en quelques étapes claires. Le rendez-vous arrive directement dans votre planning.",
      flow: ["Client", "Véhicule", "Prestation", "Options", "Créneau", "Acompte", "Confirmation"],
      media: { type: "image" as const, src: "/marketing/product/booking.png", alt: "Réservation en ligne dans DetailFlow" },
    },
    {
      id: "planning",
      reversed: true,
      h2: "Un planning clair pour organiser vos rendez-vous",
      lead: "Vos disponibilités, vos rendez-vous et vos indisponibilités au même endroit, en temps réel.",
      points: ["Disponibilités", "Rendez-vous", "Durées des prestations", "Indisponibilités"],
      media: { type: "image" as const, src: "/marketing/product/calendar.png", alt: "Planning des rendez-vous dans DetailFlow" },
    },
    {
      id: "clients",
      reversed: false,
      h2: "Centralisez vos clients et leurs véhicules",
      lead: "Chaque client regroupe ses véhicules, ses réservations et l'historique de ses prestations.",
      flow: ["Client", "Véhicules", "Réservations", "Historique"],
      media: { type: "placeholder" as const, label: "Fiche client DetailFlow : coordonnées, véhicules et historique des prestations" },
    },
    {
      id: "facturation",
      reversed: true,
      h2: "Gérez vos acomptes, paiements et factures",
      lead: "De la réservation à la facture, sans ressaisir les mêmes informations.",
      flow: ["Réservation", "Acompte", "Prestation", "Facture"],
      media: { type: "image" as const, src: "/marketing/product/invoice.png", alt: "Facture générée par DetailFlow" },
      footnote: "L'encaissement d'acompte s'appuie sur le paiement en ligne connecté à votre compte professionnel.",
    },
    {
      id: "automatisations",
      reversed: false,
      h2: "Automatisez les confirmations et rappels clients",
      lead: "DetailFlow envoie les messages au bon moment, sans que vous ayez à y penser.",
      flow: ["Réservation créée", "Confirmation", "Rappel", "Rendez-vous"],
      media: { type: "placeholder" as const, label: "Exemple de confirmation et de rappel reçus par le client" },
    },
    {
      id: "tableau-de-bord",
      reversed: true,
      h2: "Suivez votre activité depuis un seul tableau de bord",
      lead: "Réservations à venir, chiffre d'affaires et activité de l'atelier, en un coup d'œil.",
      points: ["Réservations à venir", "Chiffre d'affaires", "Activité récente", "Accessible partout"],
      media: { type: "image" as const, src: "/marketing/dashboard-preview.png", alt: "Tableau de bord DetailFlow" },
    },
  ],

  site: {
    id: "site",
    h2: "Créez votre page ou votre site de detailing",
    lead: "Vous choisissez la présence en ligne qui correspond à votre activité.",
    options: [
      {
        title: "Ajoutez la réservation à votre site",
        description: "Vous gardez votre site actuel et vous y ajoutez un bouton de réservation relié à DetailFlow.",
      },
      {
        title: "Créez votre page professionnelle",
        description: "Une page simple à partager sur Instagram, Google, WhatsApp ou par QR code.",
      },
      {
        title: "Créez votre site professionnel",
        description: "Un site complet pour présenter votre activité et prendre vos réservations.",
      },
    ],
  },

  adaptation: {
    id: "metier",
    h2: "Un logiciel qui s'adapte à votre métier",
    lead: "DetailFlow s'organise autour de vos prestations, quelles qu'elles soient.",
    examples: [
      { metier: "Detailing automobile", fields: ["Véhicules", "Prestations", "Options", "Durées"] },
      { metier: "Nettoyage textile", fields: ["Type", "Quantité / dimensions", "Options", "Déplacement"] },
      { metier: "Chaussures", fields: ["Quantité", "Prestation", "Options"] },
    ],
  },

  faq: {
    id: "faq",
    h2: "Questions fréquentes sur DetailFlow",
  },

  finalCta: {
    h2: "Prêt à gérer votre activité depuis un seul espace ?",
    subtitle: "Créez votre espace DetailFlow et mettez votre page professionnelle en ligne dès aujourd'hui.",
    primaryCta: { label: "Créer mon espace", href: "/demarrer" },
    secondaryCta: { label: "Voir les tarifs", href: "#tarifs" },
    reassurance: "Sans carte bancaire pour commencer • Vos données exportables à tout moment",
  },
} as const
