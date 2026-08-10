/**
 * ============================================================================
 *  CONTENU DE LA VITRINE SaaS DetailFlow (domaine racine)
 * ============================================================================
 *  Centralise TOUT le texte de la landing page pour un ajustement facile.
 *  Positionnement : Programme Beta Tester premium et exclusif.
 *  Ne JAMAIS employer les mots « essai gratuit » ici (voir CGV uniquement).
 * ============================================================================
 */

import { Calendar, FileText, Gauge, MapPin, Palette, ShieldCheck } from "lucide-react"

export const marketing = {
  brand: {
    name: "DetailFlow",
    tagline: "Le logiciel des professionnels du detailing automobile",
  },

  hero: {
    badge: "Programme Beta Tester — Lancement",
    title: "Le logiciel tout-en-un pour votre entreprise de detailing",
    subtitle:
      "Réservations en ligne, devis, facturation et gestion clients : DetailFlow réunit tout ce dont votre atelier a besoin, sur un site à votre image.",
    primaryCta: { label: "Rejoindre le programme Beta", href: "#beta" },
    secondaryCta: { label: "Découvrir les fonctionnalités", href: "#features" },
  },

  overview: {
    title: "Un seul outil, toute votre activité",
    description:
      "DetailFlow remplace le carnet de rendez-vous, le tableur de devis et les relances manuelles par une plateforme unique, pensée pour le detailing.",
  },

  features: [
    {
      icon: Calendar,
      title: "Réservation en ligne",
      description:
        "Vos clients réservent leur créneau 24/7. Gestion des disponibilités, des zones de déplacement et des acomptes.",
    },
    {
      icon: FileText,
      title: "Devis & factures",
      description:
        "Devis et factures conformes générés automatiquement, avec numérotation, TVA et logo de votre entreprise.",
    },
    {
      icon: Gauge,
      title: "Tableau de bord",
      description: "Chiffre d'affaires, réservations à venir et activité de l'atelier en un coup d'œil.",
    },
    {
      icon: MapPin,
      title: "Prestations & tarifs",
      description: "Grille tarifaire par type de véhicule, options et suppléments kilométriques entièrement paramétrables.",
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

  benefits: {
    title: "Pourquoi DetailFlow ?",
    items: [
      {
        title: "Gagnez du temps",
        description: "Automatisez la prise de rendez-vous, les confirmations et les rappels. Concentrez-vous sur le métier.",
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
   * Section "Déjà testé sur le terrain" (remplace les témoignages).
   *
   * RÈGLE STRICTE : `count` doit rester `null` et `companies` doit rester un
   * tableau vide tant que l'utilisateur n'a pas fourni le chiffre exact et/ou
   * les logos/noms réels des entreprises partenaires bêta, avec confirmation
   * explicite de celles pouvant être citées publiquement (`consent: true`).
   * Ne JAMAIS inventer de nombre, de nom d'entreprise ou de témoignage ici.
   */
  betaPartners: {
    label: "Déjà testé sur le terrain",
    fallbackNote: "Actuellement testé par des professionnels du detailing.",
    // Nombre réel d'entreprises en bêta — à renseigner par l'utilisateur.
    count: null as number | null,
    // Logos fournis par les entreprises partenaires (badges circulaires,
    // recadrés au même format dans un cercle uniforme côté UI).
    companies: [
      { name: "Rhine Shine Detailling", logo: "/marketing/partners/rhine-shine.jpg", consent: true },
      { name: "KY Detailing", logo: "/marketing/partners/ky-detailing.png", consent: true },
      { name: "AutoCare — Nettoyage Automobile", logo: "/marketing/partners/autocare.jpg", consent: true },
      { name: "JustClean — Lavage Auto", logo: "/marketing/partners/justclean.jpg", consent: true },
    ] as Array<{ name: string; logo: string; url?: string; consent: boolean }>,
  },

  beta: {
    badge: "Places limitées",
    title: "Rejoignez le programme Beta DetailFlow",
    lead: "Nous recherchons les 20 premières entreprises de detailing prêtes à façonner l'avenir de la plateforme.",
    points: [
      "Accès complet à toutes les fonctionnalités",
      "Accompagnement personnalisé au démarrage",
      "Votre retour influence directement les prochaines évolutions",
      "Accès anticipé exclusif avant l'ouverture publique",
    ],
    formTitle: "Candidater au programme",
    formNote:
      "Nous étudions chaque candidature et revenons vers vous rapidement pour préparer la mise en place de votre espace.",
  },

  faq: [
    {
      q: "Qu'est-ce que le programme Beta Tester ?",
      a: "C'est un programme de lancement réservé aux premières entreprises de detailing. Vous accédez à l'ensemble de la plateforme et participez à son amélioration en nous faisant part de vos retours.",
    },
    {
      q: "Ai-je besoin de compétences techniques ?",
      a: "Non. Nous configurons votre espace, votre sous-domaine et vos prestations avec vous. Vous n'avez qu'à gérer votre activité.",
    },
    {
      q: "Puis-je récupérer mes données ?",
      a: "Oui, à tout moment. Vous restez propriétaire de vos données et pouvez les exporter aux formats standard (CSV et JSON) quand vous le souhaitez.",
    },
    {
      q: "Que se passe-t-il à la fin de la période Beta ?",
      a: "Nous vous contactons personnellement pour faire le point et décider ensemble de la suite. Aucun compte n'est supprimé automatiquement.",
    },
    {
      q: "Combien de places sont disponibles ?",
      a: "Le programme est limité aux 20 premières entreprises afin de garantir un accompagnement de qualité.",
    },
  ],
} as const
