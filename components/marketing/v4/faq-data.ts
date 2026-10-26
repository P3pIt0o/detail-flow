/**
 * FAQ de la landing — réponses vérifiées dans le code (aucune promesse d'une
 * fonctionnalité non livrée). Partagée entre le composant FAQ et le JSON-LD.
 */
export const LANDING_FAQ: { q: string; a: string }[] = [
  {
    q: "DetailFlow est-il réservé au detailing automobile ?",
    a: "DetailFlow est conçu pour les professionnels du detailing et du nettoyage automobile : catégories de véhicules, prix et durées par véhicule, options, atelier et déplacement. Toute entreprise qui fonctionne par prestations et rendez-vous sur des véhicules peut l'utiliser.",
  },
  {
    q: "Mes clients peuvent-ils réserver directement ?",
    a: "Oui. Vos clients réservent depuis votre site DetailFlow, depuis un lien de réservation à partager ou depuis le tunnel intégré à votre propre site. Seuls les créneaux réellement disponibles leur sont proposés.",
  },
  {
    q: "Puis-je gérer mes prestations et mes tarifs ?",
    a: "Oui. Chaque prestation a un prix et une durée par type de véhicule, avec des options qui ajoutent un supplément de prix et de temps. Le site et la réservation se mettent à jour dès que vous modifiez une prestation.",
  },
  {
    q: "Puis-je demander un acompte ?",
    a: "Oui. Vous choisissez : pas d'acompte, un montant fixe ou un pourcentage. Le paiement en ligne passe par Stripe une fois votre compte connecté ; vous pouvez aussi indiquer vos propres modalités de règlement.",
  },
  {
    q: "Puis-je gérer un atelier et des déplacements ?",
    a: "Oui. Vous indiquez l'adresse de votre atelier, les kilomètres offerts, le prix au kilomètre et la distance maximale. Les frais de déplacement s'ajoutent automatiquement au total.",
  },
  {
    q: "Puis-je personnaliser mon site ?",
    a: "Oui, depuis l'administration : logo, couleurs, textes, sections affichées, prestations, galerie avant/après, avis et coordonnées. Aucune compétence technique n'est nécessaire.",
  },
  {
    q: "Puis-je utiliser mon propre domaine ?",
    a: "Oui, un domaine peut déjà être relié sur demande, avec notre accompagnement. La gestion autonome du domaine personnalisé depuis votre espace arrive bientôt.",
  },
  {
    q: "Est-ce utilisable sur mobile ?",
    a: "Oui. DetailFlow est une application web responsive : le site, la réservation et l'administration fonctionnent sur smartphone, et l'espace pro peut être ajouté à l'écran d'accueil.",
  },
  {
    q: "Combien coûte DetailFlow ?",
    a: "Essentiel est gratuit et disponible dès maintenant. Indépendant coûte 19,90 €/mois avec 30 jours gratuits et est également disponible. Les offres Performance et Équipe sont présentées dans la section Tarifs et seront bientôt disponibles. Automatisations avancées, Marketing avancé, Campagnes et relances clients et Domaine personnalisé sont en préparation et ne sont incluses dans aucune offre actuellement.",
  },
  {
    q: "Les SMS sont-ils inclus ?",
    a: "Essentiel n'inclut aucun SMS mensuel, mais vous pouvez acheter des packs SMS. Indépendant crédite 20 SMS chaque mois, avec la possibilité d'acheter des packs supplémentaires.",
  },
  {
    q: "Comment fonctionne la commission DetailFlow ?",
    a: "Vous ne payez une commission DetailFlow que sur l'offre Essentiel, lorsque vous encaissez en ligne : 2 %, plafonnée à 19,90 €/mois. Indépendant, Performance et Équipe : 0 % de commission. Les frais Stripe restent distincts.",
  },
]
