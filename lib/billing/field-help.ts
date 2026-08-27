// Aides contextuelles pour les champs de facturation difficiles.
// Contenu PÉDAGOGIQUE et neutre : explique le champ, pourquoi il est demandé,
// où trouver l'information, un exemple et le cas d'obligation. Ne contient
// AUCUNE affirmation de conformité et n'invente aucun article de loi (les
// références juridiques précises restent dans les profils réglementaires).

export type FieldHelp = {
  title: string
  what: string // ce que signifie le champ
  why: string // pourquoi il est demandé
  where?: string // où trouver l'information
  example?: string // un exemple concret
  required?: string // dans quel cas il est obligatoire
}

// Clés = identifiants stables des champs difficiles listés dans la demande.
export const FIELD_HELP: Record<string, FieldHelp> = {
  legalForm: {
    title: "Forme juridique",
    what: "Le statut sous lequel votre entreprise est enregistrée (micro-entreprise, société…).",
    why: "Elle apparaît sur vos factures et influence les mentions légales attendues.",
    where: "Sur votre extrait d'immatriculation (Kbis en France, extrait BCE en Belgique, registre du commerce en Suisse).",
    example: "EI, SASU, SARL (FR) · SRL, SA (BE) · Sàrl, SA (CH).",
    required: "Recommandée pour des factures complètes. Choisissez « Je ne sais pas » si vous hésitez.",
  },
  frBusinessCategory: {
    title: "Catégorie d'entreprise",
    what: "La taille déclarée de votre entreprise (micro, PME, ETI, grande entreprise).",
    why: "En France, elle sert de repère pour le calendrier de la facturation électronique.",
    where: "Selon votre chiffre d'affaires et votre effectif. En cas de doute, votre comptable peut vous l'indiquer.",
    example: "Un artisan seul relève généralement de « Micro-entreprise » ou « PME ».",
    required: "Utile uniquement en France. Choisissez « Je ne sais pas » si vous n'êtes pas certain.",
  },
  legalRegistrationNumber: {
    title: "Numéro d'immatriculation",
    what: "L'identifiant officiel de votre entreprise au registre de votre pays.",
    why: "Il identifie légalement votre entreprise sur vos factures.",
    where: "Sur votre document d'immatriculation officiel.",
    example: "SIRET (FR) : 123 456 789 00012 · N° BCE (BE) : 0123.456.789 · IDE (CH) : CHE-123.456.789.",
    required: "Généralement obligatoire dès que vous facturez. Vérifiez selon votre statut.",
  },
  vatNumber: {
    title: "Numéro de TVA",
    what: "Votre numéro d'identification à la TVA intracommunautaire.",
    why: "Obligatoire sur les factures lorsque vous facturez la TVA.",
    where: "Communiqué par votre administration fiscale lors de votre assujettissement.",
    example: "FR12345678901 (FR) · BE0123456789 (BE) · CHE-123.456.789 TVA (CH).",
    required: "Requis si vous êtes redevable de la TVA. Inutile en franchise/exonération.",
  },
  vatStatus: {
    title: "Situation TVA",
    what: "Indique si vous facturez la TVA à vos clients ou non.",
    why: "Détermine l'affichage de la TVA et les mentions à faire figurer sur vos factures.",
    where: "Selon votre régime fiscal. Un comptable ou votre administration peut le confirmer.",
    example: "Un micro-entrepreneur en franchise ne facture pas de TVA ; une société assujettie la facture.",
    required: "À renseigner pour des factures correctes.",
  },
  exemptionMention: {
    title: "Mention d'exonération",
    what: "La phrase qui justifie l'absence de TVA sur vos factures.",
    why: "Lorsque vous ne facturez pas de TVA, une mention explicative est attendue sur la facture.",
    where: "Selon votre régime. DetailFlow vous propose des mentions adaptées à votre pays et à votre statut.",
    example: "En franchise en base (FR) : « TVA non applicable, art. 293 B du CGI ».",
    required: "Attendue si vous ne facturez pas la TVA. La mention reste toujours modifiable.",
  },
  defaultCurrency: {
    title: "Devise",
    what: "La devise dans laquelle vous établissez vos factures.",
    why: "Elle fixe l'unité monétaire de tous vos montants.",
    where: "En général la devise de votre pays.",
    example: "EUR en France et en Belgique · CHF en Suisse.",
    required: "Toujours nécessaire. Une suggestion est proposée selon votre pays.",
  },
  paymentTerms: {
    title: "Conditions de paiement",
    what: "Le délai accordé à vos clients pour régler une facture.",
    why: "Elles figurent sur la facture et servent de référence en cas de retard.",
    where: "À votre convenance, dans le respect des délais légaux applicables.",
    example: "« Paiement à réception » ou « Paiement à 30 jours ».",
    required: "Recommandées. Utiles pour cadrer vos encaissements.",
  },
  lateFees: {
    title: "Pénalités de retard",
    what: "Les intérêts appliqués lorsqu'une facture est réglée en retard.",
    why: "Une mention des pénalités est souvent attendue sur les factures entre professionnels.",
    where: "Selon la réglementation de votre pays. Consultez les sources officielles ou votre comptable.",
    example: "Un taux de pénalité mentionné sur la facture (par ex. le taux légal en vigueur).",
    required: "Souvent attendue en B2B. À vérifier selon votre situation.",
  },
  fixedIndemnity: {
    title: "Indemnité forfaitaire",
    what: "Un montant forfaitaire dû en cas de retard de paiement entre professionnels.",
    why: "Elle accompagne généralement les pénalités de retard sur les factures B2B.",
    where: "Selon la réglementation de votre pays.",
    example: "Un montant forfaitaire de recouvrement mentionné sur la facture.",
    required: "Souvent attendue en B2B. À vérifier selon votre pays.",
  },
  numbering: {
    title: "Numérotation des factures",
    what: "La façon dont vos factures sont numérotées de manière continue et unique.",
    why: "Une numérotation chronologique sans trou est une exigence comptable courante.",
    where: "DetailFlow gère la numérotation pour vous ; vous pouvez en définir le format.",
    example: "F-2026-0001, F-2026-0002…",
    required: "Toujours nécessaire. DetailFlow assure la continuité automatiquement.",
  },
}
