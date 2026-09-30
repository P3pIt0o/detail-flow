export function isTestPageTrialEligible(company: { subscriptionStartedAt: Date | null } | null | undefined) {
  return company?.subscriptionStartedAt == null
}

export function describeTestPageTrialCopy(trialEligible: boolean) {
  return trialEligible
    ? {
        intro:
          "Stripe TEST et base Preview isolée. 30 jours gratuits, sans carte bancaire. Vous pourrez ajouter votre moyen de paiement avant la fin de l’essai.",
        planNote: "1er mois offert",
      }
    : {
        intro:
          "Stripe TEST et base Preview isolée. Votre essai gratuit a déjà été utilisé. Toute nouvelle souscription est facturée immédiatement.",
        planNote: "Paiement immédiat",
      }
}
