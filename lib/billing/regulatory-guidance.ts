/**
 * LOT 2B.5B — Moteur réglementaire CONSULTATIF (facturation électronique).
 *
 * Fonction pure et déterministe : aucun accès DB / réseau / React.
 *
 * Périmètre STRICT :
 *  - n'accepte QUE des données du PROFIL VENDEUR courant ;
 *  - ne connaît NI facture, NI client, NI pays/type client, NI n° TVA client,
 *    NI taxTreatment / taxLegalMention, NI montant ;
 *  - ne déduit JAMAIS B2B/B2C, assujettissement, exemption, reverse charge ni
 *    champ réglementaire ;
 *  - ne conclut JAMAIS « conforme » / « non conforme » ni ne valide une TVA.
 *
 * Sa sortie sert UNIQUEMENT à afficher des informations dans les paramètres.
 */

export type RegulatoryStatus = "INFORMATION" | "TO_COMPLETE" | "REVIEW_REQUIRED" | "ACTION_REQUIRED"

export type RegulatorySource = {
  label: string
  url: string
}

export type RegulatoryGuidance = {
  status: RegulatoryStatus
  title: string
  message: string
  /** Échéance indicative éventuelle (texte libre, ex. "1 septembre 2026"). */
  deadline?: string
  source?: RegulatorySource
}

/**
 * Entrée du moteur : EXCLUSIVEMENT le profil vendeur. Aucun autre champ n'est
 * accepté (pas de facture / client / taxTreatment / montant).
 */
export type SellerRegulatoryInput = {
  country: string | null | undefined
  confirmed: boolean
  vatStatus: string | null | undefined
  frBusinessCategory: string | null | undefined
}

const SOURCE_FR: RegulatorySource = {
  label: "impots.gouv.fr — Facturation électronique",
  url: "https://www.impots.gouv.fr/foire-aux-questions-je-decouvre-la-facturation-electronique",
}
const SOURCE_BE: RegulatorySource = {
  label: "efacture.belgium.be — Pour qui l'obligation ?",
  url: "https://efacture.belgium.be/fr/article/pour-qui-la-facturation-electronique-deviendra-t-elle-obligatoire",
}
const SOURCE_CH: RegulatorySource = {
  label: "estv.admin.ch — TVA",
  url: "https://www.estv.admin.ch/fr/taxe-sur-la-valeur-ajoutee",
}

/**
 * Résout l'information consultative pour le profil vendeur.
 * Toujours au moins un élément (jamais de conclusion pays si non confirmé).
 */
export function resolveRegulatoryGuidance(input: SellerRegulatoryInput): RegulatoryGuidance[] {
  // Règle préalable : sans profil confirmé, aucune conclusion pays détaillée.
  if (!input.confirmed) {
    return [
      {
        status: "TO_COMPLETE",
        title: "Complétez et confirmez votre profil",
        message:
          "Renseignez et confirmez le pays et les informations légales de votre entreprise pour afficher les informations de facturation électronique correspondantes.",
      },
    ]
  }

  const country = (input.country ?? "").trim().toUpperCase()
  const vatStatus = (input.vatStatus ?? "").trim().toLowerCase()
  const frCategory = (input.frBusinessCategory ?? "").trim().toLowerCase()

  switch (country) {
    case "FR":
      return guidanceFR(vatStatus, frCategory)
    case "BE":
      return guidanceBE(vatStatus)
    case "CH":
      return guidanceCH()
    default:
      return guidanceGeneric()
  }
}

/* ----------------------------- FRANCE ----------------------------- */
function guidanceFR(vatStatus: string, frCategory: string): RegulatoryGuidance[] {
  const out: RegulatoryGuidance[] = []

  // Réception : commune à toutes les entreprises concernées (action requise).
  out.push({
    status: "ACTION_REQUIRED",
    title: "Réception des factures électroniques",
    message:
      "À partir du 1er septembre 2026, les entreprises concernées doivent être en mesure de recevoir leurs factures électroniques et avoir choisi une plateforme agréée pour cette réception. DetailFlow ne fournit pas encore cette réception.",
    deadline: "1er septembre 2026",
    source: SOURCE_FR,
  })

  // Émission : dépend de la catégorie DÉCLARÉE (jamais déduite).
  if (frCategory === "ge" || frCategory === "eti") {
    out.push({
      status: "ACTION_REQUIRED",
      title: "Émission des factures électroniques",
      message:
        "Pour une grande entreprise ou une ETI concernée, l'émission des factures électroniques est prévue à partir du 1er septembre 2026. DetailFlow ne transmet pas encore les factures via une plateforme agréée.",
      deadline: "1er septembre 2026",
      source: SOURCE_FR,
    })
  } else if (frCategory === "pme" || frCategory === "micro") {
    out.push({
      status: "INFORMATION",
      title: "Émission des factures électroniques",
      message:
        "Pour une PME ou une micro-entreprise, l'émission des factures électroniques est prévue à partir du 1er septembre 2027.",
      deadline: "1er septembre 2027",
      source: SOURCE_FR,
    })
  } else {
    // unknown ou absente => à préciser.
    out.push({
      status: "TO_COMPLETE",
      title: "Précisez votre catégorie d'entreprise",
      message:
        "Indiquez votre catégorie déclarée (micro-entreprise, PME, ETI ou grande entreprise) pour connaître votre échéance d'émission.",
      source: SOURCE_FR,
    })
  }

  // Rappel PDF ≠ facture électronique (jamais supprimé par un statut TVA).
  out.push({
    status: "REVIEW_REQUIRED",
    title: "Un PDF ne suffit pas",
    message:
      "Un PDF envoyé par email ne constitue pas, à lui seul, une facture électronique au sens de la réforme. DetailFlow ne réalise pas encore la transmission via une plateforme agréée ni le e-reporting.",
    source: SOURCE_FR,
  })

  // Un statut TVA "exempt" ne retire jamais l'information réglementaire.
  if (vatStatus === "exempt") {
    out.push({
      status: "REVIEW_REQUIRED",
      title: "Franchise ou exonération de TVA",
      message:
        "Une franchise ou une exonération de TVA ne signifie pas automatiquement une absence d'obligation de facturation électronique. Vérifiez votre situation selon les sources officielles.",
      source: SOURCE_FR,
    })
  }

  return out
}

/* ----------------------------- BELGIQUE ----------------------------- */
function guidanceBE(vatStatus: string): RegulatoryGuidance[] {
  if (vatStatus === "subject") {
    return [
      {
        status: "ACTION_REQUIRED",
        title: "Facturation électronique structurée B2B",
        message:
          "Depuis le 1er janvier 2026, la facturation électronique structurée est généralement obligatoire pour le B2B domestique belge concerné. Un PDF seul est généralement insuffisant. Peppol constitue la voie de référence, mais une autre solution respectant la norme EN 16931 peut exister par accord entre les parties. DetailFlow ne transmet pas encore de facture électronique structurée.",
        deadline: "1 janvier 2026",
        source: SOURCE_BE,
      },
    ]
  }

  // exempt ou unknown => revue nécessaire, jamais d'exemption automatique.
  return [
    {
      status: "REVIEW_REQUIRED",
      title: "Situation à vérifier",
      message:
        "Votre statut TVA actuel ne suffit pas à déterminer si une exception s'applique. Ne concluez pas automatiquement à une exemption : vérifiez votre situation selon les sources officielles. Peppol est la voie de référence, sans être nécessairement la seule voie envisageable.",
      source: SOURCE_BE,
    },
  ]
}

/* ----------------------------- SUISSE ----------------------------- */
function guidanceCH(): RegulatoryGuidance[] {
  return [
    {
      status: "INFORMATION",
      title: "Facturation en Suisse",
      message:
        "Les obligations applicables doivent être vérifiées selon la situation de votre entreprise et de votre destinataire. DetailFlow ne garantit pas une conformité réglementaire.",
      source: SOURCE_CH,
    },
  ]
}

/* ----------------------------- AUTRES PAYS ----------------------------- */
function guidanceGeneric(): RegulatoryGuidance[] {
  return [
    {
      status: "REVIEW_REQUIRED",
      title: "Calendrier réglementaire non disponible",
      message:
        "DetailFlow ne fournit pas encore de calendrier réglementaire spécifique pour ce pays. Vérifiez vos obligations selon votre situation et les sources officielles applicables.",
    },
  ]
}
