/**
 * Propositions de MENTIONS D'EXONÉRATION de TVA — PURE et prudente.
 *
 * RÈGLES STRICTES (cf. contraintes réglementaires DetailFlow) :
 *  - aucune mention n'est appliquée automatiquement (l'utilisateur choisit) ;
 *  - AUCUN article juridique inventé. Seule la référence française bien connue
 *    de la franchise en base (art. 293 B du CGI), déjà utilisée par défaut dans
 *    DetailFlow, est citée. Pour BE/CH, aucune référence d'article n'est fournie ;
 *  - la mention reste toujours modifiable par l'utilisateur ;
 *  - en cas d'incertitude, un message de vérification comptable est affiché,
 *    jamais « conforme ».
 */

export type ExemptionMention = {
  /** Le cas concerné (langage simple). */
  caseLabel: string
  /** La mention proposée, à insérer telle quelle (modifiable ensuite). */
  mention: string
  /** Explication courte, non juridique. */
  explanation: string
  source?: { label: string; url: string }
}

export type ExemptionMentionResult = {
  /** false si l'entreprise facture la TVA (aucune mention nécessaire). */
  applicable: boolean
  proposals: ExemptionMention[]
  /** Message de contexte / incertitude. Toujours présent. */
  note: string
}

const SOURCE_FR = {
  label: "impots.gouv.fr — franchise en base de TVA",
  url: "https://www.impots.gouv.fr/professionnel/la-franchise-en-base-de-tva",
}
const SOURCE_BE = {
  label: "finances.belgium.be — TVA",
  url: "https://finances.belgium.be/fr/entreprises/tva",
}
const SOURCE_CH = {
  label: "estv.admin.ch — TVA",
  url: "https://www.estv.admin.ch/fr/taxe-sur-la-valeur-ajoutee",
}

const VERIFY_NOTE =
  "Votre situation peut nécessiter une vérification auprès de votre comptable ou de l'administration compétente. Adaptez la mention à votre cas."

export function getExemptionMentions(input: {
  country: string | null | undefined
  vatStatus: string | null | undefined
}): ExemptionMentionResult {
  const country = (input.country ?? "FR").toUpperCase()
  const vatStatus = (input.vatStatus ?? "unknown").toLowerCase()

  if (vatStatus === "subject") {
    return {
      applicable: false,
      proposals: [],
      note: "Vous facturez la TVA : aucune mention d'exonération n'est nécessaire.",
    }
  }

  if (vatStatus !== "exempt") {
    return {
      applicable: false,
      proposals: [],
      note: "Précisez d'abord votre situation TVA (franchise / exonération) pour voir des propositions de mention.",
    }
  }

  switch (country) {
    case "FR":
      return {
        applicable: true,
        proposals: [
          {
            caseLabel: "Franchise en base de TVA",
            mention: "TVA non applicable, art. 293 B du CGI",
            explanation:
              "Mention usuelle pour une entreprise bénéficiant de la franchise en base (TVA ni facturée, ni déductible).",
            source: SOURCE_FR,
          },
        ],
        note:
          "Si vous relevez d'un autre cas d'exonération que la franchise en base, la mention peut être différente. " +
          VERIFY_NOTE,
      }
    case "BE":
      return {
        applicable: true,
        proposals: [
          {
            caseLabel: "Petite entreprise exonérée",
            mention: "TVA non applicable — régime de la franchise pour petites entreprises",
            explanation:
              "Formulation générale, sans référence d'article. À adapter précisément à votre régime réel.",
            source: SOURCE_BE,
          },
        ],
        note:
          "DetailFlow ne cite pas d'article de loi belge pour éviter toute erreur. Vérifiez la mention exacte applicable à votre régime. " +
          VERIFY_NOTE,
      }
    case "CH":
      return {
        applicable: true,
        proposals: [
          {
            caseLabel: "Entreprise non assujettie / exonérée",
            mention: "TVA non applicable",
            explanation:
              "Formulation générale. Les règles suisses dépendent de votre chiffre d'affaires et de votre activité.",
            source: SOURCE_CH,
          },
        ],
        note:
          "Les conditions d'assujettissement en Suisse dépendent de votre situation. " + VERIFY_NOTE,
      }
    default:
      return {
        applicable: true,
        proposals: [
          {
            caseLabel: "Exonération de TVA",
            mention: "TVA non applicable",
            explanation: "Formulation générale à adapter à la réglementation de votre pays.",
          },
        ],
        note: "Aucun modèle spécifique n'est disponible pour ce pays. " + VERIFY_NOTE,
      }
  }
}
