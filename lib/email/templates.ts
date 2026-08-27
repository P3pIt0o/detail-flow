import { formatPrice, formatMoney, formatDateLong, formatDuration } from "@/lib/format"
import { parseDepositMethods } from "@/lib/booking/types"

/**
 * Gabarits HTML des emails transactionnels.
 * Design clair et sobre (lisibilité en boîte mail), bleu de marque en accent.
 * Styles 100% inline : les clients mail ignorent le plus souvent <style>.
 */

const BRAND = "#2563eb" // bleu électrique (équivalent clair de --primary)
const INK = "#0f172a"
const MUTED = "#64748b"
const BORDER = "#e2e8f0"
const BG = "#f1f5f9"

export type BookingEmailData = {
  reference: string
  customerName: string
  date: string
  startTime: string
  endTime: string
  totalDurationMin: number
  address: string
  items: { serviceName: string; vehicleTypeName: string; priceCents: number }[]
  servicesCents: number
  optionsCents: number
  travelFeeCents: number
  totalCents: number
  depositCents: number
  /** Moyens de paiement de l'acompte (CSV de slugs) + instructions libres. */
  depositMethods?: string | null
  depositInstructions?: string | null
  businessName: string
  businessEmail?: string | null
  businessPhone?: string | null
  /** Lien sécurisé de gestion du RDV (annuler / choisir un autre créneau). */
  manageUrl?: string | null
  /** Lien vers le parcours de réservation du même tenant (nouveau créneau). */
  newBookingUrl?: string | null
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Enveloppe commune : header marque + contenu + footer coordonnées. */
function layout(opts: {
  businessName: string
  businessEmail?: string | null
  businessPhone?: string | null
  heading: string
  accent?: string
  bodyHtml: string
}): string {
  const accent = opts.accent ?? BRAND
  const contactLines = [
    opts.businessEmail ? `Email : ${esc(opts.businessEmail)}` : "",
    opts.businessPhone ? `Tél : ${esc(opts.businessPhone)}` : "",
  ]
    .filter(Boolean)
    .join(" &nbsp;·&nbsp; ")

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK};">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
      <div style="background:${accent};padding:20px 28px;">
        <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">${esc(opts.businessName)}</div>
      </div>
      <div style="padding:28px;">
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${INK};">${esc(opts.heading)}</h1>
        ${opts.bodyHtml}
      </div>
    </div>
    <div style="text-align:center;padding:18px 8px;color:${MUTED};font-size:12px;line-height:1.6;">
      ${contactLines ? `${contactLines}<br>` : ""}
      Cet email vous est envoyé automatiquement, merci de ne pas y répondre directement.
    </div>
  </div>
</body></html>`
}

/** Bloc récapitulatif d'une réservation (réutilisé dans plusieurs emails). */
function bookingSummary(b: BookingEmailData): string {
  const rows = b.items
    .map(
      (it) =>
        `<tr><td style="padding:6px 0;color:${INK};">${esc(it.serviceName)} <span style="color:${MUTED};">· ${esc(it.vehicleTypeName)}</span></td>
         <td style="padding:6px 0;text-align:right;white-space:nowrap;color:${INK};">${formatPrice(it.priceCents)}</td></tr>`,
    )
    .join("")

  const line = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 0;color:${strong ? INK : MUTED};font-weight:${strong ? 700 : 400};">${label}</td>
     <td style="padding:4px 0;text-align:right;color:${strong ? INK : MUTED};font-weight:${strong ? 700 : 400};white-space:nowrap;">${value}</td></tr>`

  return `
  <div style="background:${BG};border-radius:10px;padding:18px 20px;margin:8px 0 20px;">
    <div style="font-size:13px;color:${MUTED};margin-bottom:2px;">Référence</div>
    <div style="font-size:15px;font-weight:700;color:${INK};margin-bottom:14px;">${esc(b.reference)}</div>

    <div style="font-size:13px;color:${MUTED};">Date &amp; horaire</div>
    <div style="font-size:15px;color:${INK};margin-bottom:12px;text-transform:capitalize;">
      ${esc(formatDateLong(b.date))}<br>
      <span style="color:${MUTED};">${esc(b.startTime)} – ${esc(b.endTime)} (${esc(formatDuration(b.totalDurationMin))})</span>
    </div>

    <div style="font-size:13px;color:${MUTED};">Adresse</div>
    <div style="font-size:15px;color:${INK};">${esc(b.address)}</div>
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;">
    ${rows}
    <tr><td colspan="2" style="padding:8px 0;"><div style="border-top:1px solid ${BORDER};"></div></td></tr>
    ${b.optionsCents > 0 ? line("Options", formatPrice(b.optionsCents)) : ""}
    ${line("Déplacement", b.travelFeeCents > 0 ? formatPrice(b.travelFeeCents) : "Offert")}
    ${line("Total", formatPrice(b.totalCents), true)}
    ${b.depositCents > 0 ? line("Acompte demandé", formatPrice(b.depositCents)) : ""}
  </table>`
}

/** Bouton d'action centré (CTA email), style inline pour compatibilité mail. */
function ctaButton(url: string, label: string, color: string = BRAND): string {
  return `<div style="text-align:center;margin:22px 0 4px;">
    <a href="${esc(url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;">
      ${esc(label)}
    </a>
  </div>`
}

/** Bloc "Gérer mon rendez-vous" (annulation / autre créneau), si lien fourni. */
function manageBlock(b: BookingEmailData): string {
  if (!b.manageUrl) return ""
  return `${ctaButton(b.manageUrl, "Gérer mon rendez-vous")}
    <p style="text-align:center;font-size:13px;line-height:1.6;color:${MUTED};margin:8px 0 0;">
      Vous pourrez annuler votre rendez-vous ou choisir un autre créneau.
    </p>`
}

/* -------------------------- Confirmation client -------------------------- */

export function clientConfirmationEmail(b: BookingEmailData) {
  const methods = parseDepositMethods(b.depositMethods)
  const methodsLine = methods.length
    ? `<p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 8px;">
         Moyens de paiement acceptés : <strong style="color:${INK};">${esc(methods.join(" · "))}</strong>.
       </p>`
    : ""
  const instructionsBlock = b.depositInstructions?.trim()
    ? `<div style="background:${BG};border-radius:10px;padding:14px 18px;margin:8px 0 4px;">
         <div style="font-size:13px;color:${MUTED};margin-bottom:6px;">Instructions de paiement</div>
         <div style="font-size:14px;line-height:1.6;color:${INK};white-space:pre-line;">${esc(b.depositInstructions.trim())}</div>
       </div>`
    : ""
  const depositNote =
    b.depositCents > 0
      ? `<p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 4px;">
           Un acompte de <strong style="color:${INK};">${formatPrice(b.depositCents)}</strong> est demandé pour confirmer définitivement votre créneau.
         </p>
         ${methodsLine}
         ${instructionsBlock}`
      : ""

  return {
    subject: `Votre réservation ${b.reference} est bien reçue`,
    html: layout({
      businessName: b.businessName,
      businessEmail: b.businessEmail,
      businessPhone: b.businessPhone,
      heading: `Merci ${esc(b.customerName)}, votre demande est enregistrée`,
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          Nous avons bien reçu votre réservation. Voici le récapitulatif :
        </p>
        ${bookingSummary(b)}
        ${depositNote}
        ${manageBlock(b)}
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:16px 0 0;">
          Vous recevrez un email dès la confirmation de votre rendez-vous.
        </p>`,
    }),
  }
}

/* --------------------------- Notification pro --------------------------- */

export function proNotificationEmail(b: BookingEmailData) {
  return {
    subject: `Nouvelle réservation — ${b.customerName} (${b.reference})`,
    html: layout({
      businessName: b.businessName,
      businessEmail: b.businessEmail,
      businessPhone: b.businessPhone,
      heading: "Nouvelle réservation reçue",
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          <strong style="color:${INK};">${esc(b.customerName)}</strong> vient de réserver.
        </p>
        ${bookingSummary(b)}`,
    }),
  }
}

/* ------------------------- Paiement encaissé ------------------------- */

const PAY_GREEN = "#16a34a"

/** Détail d'un paiement encaissé (client & pro). */
export type PaymentEmailInfo = {
  /** Montant réellement encaissé (centimes). */
  amountCents: number
  /** true = acompte, false = paiement intégral. */
  isDeposit: boolean
  /** Solde restant dû sur place (centimes) — pertinent pour un acompte. */
  remainingCents?: number
}

/** Email CLIENT : confirmation du paiement + rappel du rendez-vous. */
export function paymentReceivedClientEmail(b: BookingEmailData, pay: PaymentEmailInfo) {
  const kind = pay.isDeposit ? "acompte" : "paiement intégral"
  const remaining =
    pay.isDeposit && (pay.remainingCents ?? 0) > 0
      ? `<p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 4px;">
           Solde à régler sur place le jour du rendez-vous :
           <strong style="color:${INK};">${formatPrice(pay.remainingCents ?? 0)}</strong>.
         </p>`
      : ""
  return {
    subject: `Paiement confirmé — réservation ${b.reference}`,
    html: layout({
      businessName: b.businessName,
      businessEmail: b.businessEmail,
      businessPhone: b.businessPhone,
      heading: "Votre paiement est confirmé",
      accent: PAY_GREEN,
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 8px;">
          Bonjour ${esc(b.customerName)}, nous confirmons la bonne réception de votre ${esc(kind)} de
          <strong style="color:${INK};">${formatPrice(pay.amountCents)}</strong>. Votre rendez-vous est confirmé.
        </p>
        ${remaining}
        ${bookingSummary(b)}
        ${manageBlock(b)}`,
    }),
  }
}

/** Email PRO : notification d'un paiement encaissé. */
export function paymentReceivedProEmail(b: BookingEmailData, pay: PaymentEmailInfo) {
  const kind = pay.isDeposit ? "Acompte" : "Paiement intégral"
  return {
    subject: `Paiement reçu — ${b.customerName} (${b.reference})`,
    html: layout({
      businessName: b.businessName,
      businessEmail: b.businessEmail,
      businessPhone: b.businessPhone,
      heading: "Nouveau paiement reçu",
      accent: PAY_GREEN,
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          <strong style="color:${INK};">${esc(b.customerName)}</strong> vient de régler
          (${esc(kind)}) : <strong style="color:${INK};">${formatPrice(pay.amountCents)}</strong>.
        </p>
        ${bookingSummary(b)}`,
    }),
  }
}

/* ------------------------- Changements de statut ------------------------- */

const STATUS_GREEN = "#16a34a"
const STATUS_RED = "#dc2626"

export function statusConfirmedEmail(b: BookingEmailData) {
  return {
    subject: `Votre rendez-vous ${b.reference} est confirmé`,
    html: layout({
      businessName: b.businessName,
      businessEmail: b.businessEmail,
      businessPhone: b.businessPhone,
      heading: "Votre rendez-vous est confirmé",
      accent: STATUS_GREEN,
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          Bonjour ${esc(b.customerName)}, votre rendez-vous est confirmé. Nous vous attendons :
        </p>
        ${bookingSummary(b)}`,
    }),
  }
}

export function statusCompletedEmail(b: BookingEmailData) {
  return {
    subject: `Merci pour votre confiance — ${b.reference}`,
    html: layout({
      businessName: b.businessName,
      businessEmail: b.businessEmail,
      businessPhone: b.businessPhone,
      heading: "Prestation terminée",
      accent: STATUS_GREEN,
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          Bonjour ${esc(b.customerName)}, votre prestation est terminée. Merci de votre confiance !
          N&apos;hésitez pas à nous recontacter pour un prochain entretien.
        </p>
        ${bookingSummary(b)}`,
    }),
  }
}

export function statusCancelledEmail(b: BookingEmailData) {
  const summaryLine = `${esc(formatDateLong(b.date))} · ${esc(b.startTime)}`
  return {
    subject: `Annulation de votre réservation ${b.reference}`,
    html: layout({
      businessName: b.businessName,
      businessEmail: b.businessEmail,
      businessPhone: b.businessPhone,
      heading: "Réservation annulée",
      accent: STATUS_RED,
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 8px;">
          Bonjour ${esc(b.customerName)}, votre rendez-vous a bien été annulé.
        </p>
        <div style="background:${BG};border-radius:10px;padding:14px 18px;margin:8px 0 4px;">
          <div style="font-size:13px;color:${MUTED};margin-bottom:2px;">Référence</div>
          <div style="font-size:15px;font-weight:700;color:${INK};margin-bottom:10px;">${esc(b.reference)}</div>
          <div style="font-size:13px;color:${MUTED};margin-bottom:2px;">Rendez-vous annulé</div>
          <div style="font-size:15px;color:${INK};text-transform:capitalize;">${summaryLine}</div>
        </div>
        ${b.depositCents > 0
          ? `<p style="font-size:13px;line-height:1.6;color:${MUTED};margin:12px 0 0;">
               Si un acompte ou un paiement a déjà été effectué, les conditions de remboursement
               dépendent de l&apos;entreprise. Elle pourra vous contacter si nécessaire.
             </p>`
          : ""}
        ${b.newBookingUrl ? ctaButton(b.newBookingUrl, "Réserver un nouveau créneau") : ""}`,
    }),
  }
}

/** Notification au professionnel : un client vient d'annuler son RDV. */
export function proCancellationEmail(b: BookingEmailData) {
  return {
    subject: `Annulation client — ${b.customerName} (${b.reference})`,
    html: layout({
      businessName: b.businessName,
      businessEmail: b.businessEmail,
      businessPhone: b.businessPhone,
      heading: "Un client a annulé son rendez-vous",
      accent: STATUS_RED,
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          <strong style="color:${INK};">${esc(b.customerName)}</strong> vient d&apos;annuler son rendez-vous.
          Le créneau est de nouveau disponible.
        </p>
        <div style="background:${BG};border-radius:10px;padding:18px 20px;margin:8px 0 4px;">
          <div style="font-size:13px;color:${MUTED};margin-bottom:2px;">Référence</div>
          <div style="font-size:15px;font-weight:700;color:${INK};margin-bottom:10px;">${esc(b.reference)}</div>
          <div style="font-size:13px;color:${MUTED};margin-bottom:2px;">Date &amp; horaire</div>
          <div style="font-size:15px;color:${INK};text-transform:capitalize;">
            ${esc(formatDateLong(b.date))}<br>
            <span style="color:${MUTED};">${esc(b.startTime)} – ${esc(b.endTime)}</span>
          </div>
        </div>`,
    }),
  }
}

/* ------------------------------ Facture ------------------------------ */

export function invoiceEmail(opts: {
  customerName: string
  invoiceNumber: string
  totalCents: number
  balanceCents: number
  /** Devise snapshotée de la facture (invoices.currencyCode). NULL => EUR legacy. */
  currencyCode?: string | null
  dueDate?: string | null
  businessName: string
  businessEmail?: string | null
  businessPhone?: string | null
  /** Corps personnalisé (paramètres). Variables : {{client}} {{numero}} {{entreprise}} */
  customBody?: string | null
  /** true => email d'AVOIR (wording différent, pas de « Reste à régler »). */
  isCreditNote?: boolean
  /** Référence de la facture d'origine (avoirs uniquement). */
  originalRef?: { number: string | null; issueDate: string | null } | null
}) {
  const isCredit = opts.isCreditNote === true
  const docWord = isCredit ? "avoir" : "facture"
  const greeting = `Bonjour ${esc(opts.customerName)},`
  let intro: string
  if (!isCredit && opts.customBody && opts.customBody.trim()) {
    intro = esc(opts.customBody)
      .replace(/\{\{client\}\}/g, esc(opts.customerName))
      .replace(/\{\{numero\}\}/g, esc(opts.invoiceNumber))
      .replace(/\{\{entreprise\}\}/g, esc(opts.businessName))
      .replace(/\n/g, "<br>")
  } else if (isCredit) {
    const orig = opts.originalRef?.number ? ` rectifiant la facture <strong>${esc(opts.originalRef.number)}</strong>` : ""
    intro = `Veuillez trouver ci-joint votre avoir <strong>${esc(opts.invoiceNumber)}</strong>${orig}.`
  } else {
    intro = `Veuillez trouver ci-joint votre facture <strong>${esc(opts.invoiceNumber)}</strong>.`
  }

  const line = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 0;color:${strong ? INK : MUTED};font-weight:${strong ? 700 : 400};">${label}</td>
     <td style="padding:4px 0;text-align:right;color:${strong ? INK : MUTED};font-weight:${strong ? 700 : 400};white-space:nowrap;">${value}</td></tr>`

  // Un avoir n'affiche jamais « Reste à régler » : c'est un remboursement/
  // annulation, pas une demande de paiement. On montre « Total crédité ».
  const amountRows = isCredit
    ? `${line("Total crédité", formatMoney(opts.totalCents, opts.currencyCode), true)}`
    : `${line("Total TTC", formatMoney(opts.totalCents, opts.currencyCode))}
       ${line("Reste à régler", formatMoney(opts.balanceCents, opts.currencyCode), true)}
       ${opts.dueDate ? line("Échéance", formatDateLong(opts.dueDate)) : ""}`

  return {
    subject: isCredit
      ? `Avoir ${opts.invoiceNumber} — ${opts.businessName}`
      : `Facture ${opts.invoiceNumber} — ${opts.businessName}`,
    html: layout({
      businessName: opts.businessName,
      businessEmail: opts.businessEmail,
      businessPhone: opts.businessPhone,
      heading: isCredit ? `Votre avoir ${opts.invoiceNumber}` : `Votre facture ${opts.invoiceNumber}`,
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">${greeting}</p>
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 20px;">${intro}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;background:${BG};border-radius:10px;padding:8px;">
          <tr><td colspan="2" style="height:6px;"></td></tr>
          ${amountRows}
          <tr><td colspan="2" style="height:6px;"></td></tr>
        </table>
        <p style="font-size:13px;line-height:1.6;color:${MUTED};margin:20px 0 0;">
          ${isCredit ? "L'avoir détaillé est disponible" : "La facture détaillée est disponible"} en pièce jointe (PDF).
        </p>`,
    }),
  }
}

/* ------------------- Vérification d'email (compte admin) ------------------- */

export function verificationEmail(opts: {
  url: string
  name?: string | null
  businessName: string
  businessEmail?: string | null
  businessPhone?: string | null
}) {
  const greeting = opts.name ? `Bonjour ${esc(opts.name)},` : "Bonjour,"
  return {
    subject: `Confirmez votre adresse email — ${opts.businessName}`,
    html: layout({
      businessName: opts.businessName,
      businessEmail: opts.businessEmail,
      businessPhone: opts.businessPhone,
      heading: "Confirmez votre adresse email",
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          ${greeting} pour activer votre accès à l&apos;espace professionnel, veuillez
          confirmer votre adresse email en cliquant sur le bouton ci-dessous.
        </p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${esc(opts.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;">
            Confirmer mon email
          </a>
        </div>
        <p style="font-size:13px;line-height:1.6;color:${MUTED};margin:0 0 8px;">
          Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :
        </p>
        <p style="font-size:12px;line-height:1.5;color:${BRAND};word-break:break-all;margin:0;">
          ${esc(opts.url)}
        </p>
        <p style="font-size:13px;line-height:1.6;color:${MUTED};margin:20px 0 0;">
          Si vous n&apos;êtes pas à l&apos;origine de cette demande, ignorez simplement cet email.
        </p>`,
    }),
  }
}

/* ------------ Invitation propriétaire (compte créé depuis l'admin) ------------ */

export function ownerInvitationEmail(opts: {
  ownerName?: string | null
  /** Nom de l'entreprise réellement créée. */
  companyName: string
  /** URL d'administration COMPLÈTE (avec ?tenant=) — cible du CTA principal. */
  adminUrl: string
  /** URL publique COMPLÈTE (avec ?tenant=) — lien secondaire "Voir mon site". */
  publicSiteUrl: string
  /** Email de connexion. */
  email: string
  /** Mot de passe provisoire en clair (le même que le hash enregistré). */
  tempPassword: string
  businessEmail?: string | null
  businessPhone?: string | null
}) {
  return {
    subject: "Bienvenue sur DetailFlow — Vos accès",
    html: layout({
      businessName: opts.companyName,
      businessEmail: opts.businessEmail,
      businessPhone: opts.businessPhone,
      heading: "Bienvenue sur DetailFlow",
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          Votre candidature au programme bêta a été acceptée. Votre espace est
          maintenant disponible.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;background:${BG};border-radius:10px;">
          <tr><td colspan="2" style="height:6px;"></td></tr>
          <tr><td style="padding:4px 14px;color:${MUTED};">Entreprise</td>
              <td style="padding:4px 14px;text-align:right;color:${INK};font-weight:600;">${esc(opts.companyName)}</td></tr>
          <tr><td style="padding:4px 14px;color:${MUTED};">Email de connexion</td>
              <td style="padding:4px 14px;text-align:right;color:${INK};font-weight:600;">${esc(opts.email)}</td></tr>
          <tr><td style="padding:4px 14px;color:${MUTED};">Mot de passe provisoire</td>
              <td style="padding:4px 14px;text-align:right;color:${INK};font-weight:600;">${esc(opts.tempPassword)}</td></tr>
          <tr><td colspan="2" style="height:6px;"></td></tr>
        </table>
        <div style="text-align:center;margin:24px 0 12px;">
          <a href="${esc(opts.adminUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;">
            Accéder à mon espace
          </a>
        </div>
        <p style="text-align:center;font-size:13px;line-height:1.6;margin:0 0 16px;">
          <a href="${esc(opts.publicSiteUrl)}" style="color:${BRAND};text-decoration:underline;">Voir mon site</a>
        </p>
        <p style="font-size:13px;line-height:1.6;color:${MUTED};margin:16px 0 8px;">
          Pour votre sécurité, nous vous recommandons de modifier votre mot de
          passe après votre première connexion.
        </p>
        <p style="font-size:13px;line-height:1.6;color:${MUTED};margin:0 0 4px;">
          Si le bouton ne fonctionne pas, copiez-collez ce lien :
        </p>
        <p style="font-size:12px;line-height:1.5;color:${BRAND};word-break:break-all;margin:0;">
          ${esc(opts.adminUrl)}
        </p>`,
    }),
  }
}

/* --------------------------- Modification RDV --------------------------- */

export function bookingUpdatedEmail(b: BookingEmailData) {
  return {
    subject: `Votre rendez-vous ${b.reference} a été modifié`,
    html: layout({
      businessName: b.businessName,
      businessEmail: b.businessEmail,
      businessPhone: b.businessPhone,
      heading: "Votre rendez-vous a été modifié",
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          Bonjour ${esc(b.customerName)}, votre rendez-vous a été mis à jour. Voici le nouveau récapitulatif :
        </p>
        ${bookingSummary(b)}`,
    }),
  }
}

/* ------------------- Demandes personnalisées / sur mesure ------------------- */

type CustomRequestIdentity = {
  businessName: string
  businessEmail?: string | null
  businessPhone?: string | null
}

/** Notification au professionnel : nouvelle demande personnalisée reçue. */
export function customRequestNewLeadEmail(
  o: CustomRequestIdentity & {
    typeLabel: string
    customerName: string
    customerEmail: string
    customerPhone: string
    description: string
    detailLines: { label: string; value: string }[]
    adminUrl: string
  },
) {
  const rows = o.detailLines
    .map(
      (d) =>
        `<tr><td style="padding:4px 0;color:${MUTED};">${esc(d.label)}</td>
         <td style="padding:4px 0;text-align:right;color:${INK};">${esc(d.value)}</td></tr>`,
    )
    .join("")
  return {
    subject: `Nouvelle demande personnalisée — ${o.typeLabel}`,
    html: layout({
      businessName: o.businessName,
      businessEmail: o.businessEmail,
      businessPhone: o.businessPhone,
      heading: "Nouvelle demande personnalisée",
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          Vous avez reçu une nouvelle demande de type <strong style="color:${INK};">${esc(o.typeLabel)}</strong>.
        </p>
        <div style="background:${BG};border-radius:10px;padding:18px 20px;margin:8px 0 16px;">
          <div style="font-size:15px;font-weight:700;color:${INK};margin-bottom:8px;">${esc(o.customerName)}</div>
          <div style="font-size:14px;color:${MUTED};">${esc(o.customerEmail)} &nbsp;·&nbsp; ${esc(o.customerPhone)}</div>
        </div>
        ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;margin-bottom:16px;">${rows}</table>` : ""}
        <div style="font-size:13px;color:${MUTED};">Besoin décrit</div>
        <p style="font-size:14px;line-height:1.6;color:${INK};margin:4px 0 20px;white-space:pre-wrap;">${esc(o.description)}</p>
        <a href="${esc(o.adminUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;">Voir la demande</a>`,
    }),
  }
}

/** Email au client : proposition personnalisée + liens accepter/refuser. */
export function customRequestProposalEmail(
  o: CustomRequestIdentity & {
    customerName: string
    proposalTitle: string
    proposalDescription?: string | null
    proposalPriceCents: number
    proposalDurationMin: number
    proposalMessage?: string | null
    acceptUrl: string
    refuseUrl: string
  },
) {
  const line = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:${MUTED};">${label}</td>
     <td style="padding:6px 0;text-align:right;color:${INK};font-weight:700;white-space:nowrap;">${value}</td></tr>`
  return {
    subject: `Votre proposition personnalisée — ${o.businessName}`,
    html: layout({
      businessName: o.businessName,
      businessEmail: o.businessEmail,
      businessPhone: o.businessPhone,
      heading: "Votre proposition personnalisée",
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          Bonjour ${esc(o.customerName)}, suite à votre demande, voici notre proposition :
        </p>
        <div style="background:${BG};border-radius:10px;padding:18px 20px;margin:8px 0 16px;">
          <div style="font-size:16px;font-weight:700;color:${INK};margin-bottom:6px;">${esc(o.proposalTitle)}</div>
          ${o.proposalDescription ? `<p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 8px;white-space:pre-wrap;">${esc(o.proposalDescription)}</p>` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;margin-top:8px;">
            ${line("Prix", formatPrice(o.proposalPriceCents))}
            ${o.proposalDurationMin > 0 ? line("Durée estimée", formatDuration(o.proposalDurationMin)) : ""}
          </table>
        </div>
        ${o.proposalMessage ? `<p style="font-size:14px;line-height:1.6;color:${INK};margin:0 0 20px;white-space:pre-wrap;">${esc(o.proposalMessage)}</p>` : ""}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0;">
          <tr>
            <td style="padding-right:10px;">
              <a href="${esc(o.acceptUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:999px;">Accepter la proposition</a>
            </td>
            <td>
              <a href="${esc(o.refuseUrl)}" style="display:inline-block;color:${MUTED};text-decoration:underline;font-size:14px;padding:12px 6px;">Refuser</a>
            </td>
          </tr>
        </table>`,
    }),
  }
}

/** Notification au professionnel : le client a accepté ou refusé la proposition. */
export function customRequestDecisionEmail(
  o: CustomRequestIdentity & {
    customerName: string
    typeLabel: string
    decision: "accepted" | "declined"
    adminUrl: string
  },
) {
  const accepted = o.decision === "accepted"
  return {
    subject: `${accepted ? "Proposition acceptée" : "Proposition refusée"} — ${o.customerName}`,
    html: layout({
      businessName: o.businessName,
      businessEmail: o.businessEmail,
      businessPhone: o.businessPhone,
      heading: accepted ? "Proposition acceptée" : "Proposition refusée",
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          ${esc(o.customerName)} a <strong style="color:${INK};">${accepted ? "accepté" : "refusé"}</strong> votre proposition
          (demande « ${esc(o.typeLabel)} »).
        </p>
        ${
          accepted
            ? `<p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 20px;">Vous pouvez maintenant l'ajouter à votre calendrier depuis l'espace d'administration.</p>`
            : ""
        }
        <a href="${esc(o.adminUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;">Voir la demande</a>`,
    }),
  }
}

/* ----------------------------- Rappel RDV ----------------------------- */

export function reminderEmail(b: BookingEmailData) {
  return {
    subject: `Rappel : votre rendez-vous demain (${b.reference})`,
    html: layout({
      businessName: b.businessName,
      businessEmail: b.businessEmail,
      businessPhone: b.businessPhone,
      heading: "Rappel de votre rendez-vous",
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          Bonjour ${esc(b.customerName)}, petit rappel : votre rendez-vous a lieu <strong style="color:${INK};">demain</strong>.
        </p>
        ${bookingSummary(b)}
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:16px 0 0;">
          Merci de préparer l&apos;accès au véhicule. À demain !
        </p>`,
    }),
  }
}

/* ---------------------------- Recharges SMS ----------------------------- */

/** Notification interne DetailFlow : nouvelle demande de recharge SMS. */
export function smsRechargeRequestEmail(opts: {
  companyName: string
  companyEmail: string
  quantity: number
  amountLabel: string
  reference: string
  createdAt: string
}) {
  const line = (label: string, value: string) =>
    `<tr><td style="padding:4px 14px;color:${MUTED};">${esc(label)}</td>
     <td style="padding:4px 14px;text-align:right;color:${INK};font-weight:600;">${esc(value)}</td></tr>`
  return {
    subject: `Nouvelle demande de recharge SMS — ${opts.companyName}`,
    html: layout({
      businessName: "DetailFlow",
      heading: "Nouvelle demande de recharge SMS",
      bodyHtml: `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;background:${BG};border-radius:10px;">
          <tr><td colspan="2" style="height:6px;"></td></tr>
          ${line("Entreprise", opts.companyName)}
          ${line("Email", opts.companyEmail)}
          ${line("Pack choisi", `${opts.quantity} SMS`)}
          ${line("Nombre de SMS", String(opts.quantity))}
          ${line("Montant", opts.amountLabel)}
          ${line("Référence", opts.reference)}
          ${line("Date", opts.createdAt)}
          <tr><td colspan="2" style="height:6px;"></td></tr>
        </table>
        <p style="font-size:13px;line-height:1.6;color:${MUTED};margin:16px 0 0;">
          Créditez les SMS depuis le Super Admin (« Recharges SMS ») une fois le paiement reçu.
        </p>`,
    }),
  }
}

/** Confirmation au professionnel : ses SMS ont été crédités. */
export function smsCreditedEmail(opts: {
  companyName: string
  quantity: number
  newBalance: number
  adminUrl: string
  businessEmail?: string | null
  businessPhone?: string | null
}) {
  return {
    subject: "Vos SMS ont été crédités",
    html: layout({
      businessName: opts.companyName,
      businessEmail: opts.businessEmail,
      businessPhone: opts.businessPhone,
      heading: "Vos SMS ont été crédités",
      bodyHtml: `
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          Votre recharge de <strong style="color:${INK};">${opts.quantity} SMS</strong> a été validée.
        </p>
        <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 16px;">
          Votre nouveau solde est de <strong style="color:${INK};">${opts.newBalance} SMS</strong>.
          Vous pouvez continuer à utiliser vos rappels automatiques depuis DetailFlow.
        </p>
        <div style="text-align:center;margin:24px 0 8px;">
          <a href="${esc(opts.adminUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;">
            Accéder à mon espace
          </a>
        </div>`,
    }),
  }
}
