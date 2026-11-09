/**
 * Carte digitale du detailer (L45) — logique PURE, importable côté client et serveur.
 *
 * Réglages stockés dans `companies.siteContent.digitalCard`. Aucune valeur n'est
 * inventée : un bouton ou une ligne de vCard dont la donnée manque est omis.
 */

import { toTelHref, toWhatsAppDigits } from "@/lib/phone"

export const DIGITAL_CARD_STYLES = ["solid", "gradient", "holographic"] as const
export type DigitalCardStyle = (typeof DIGITAL_CARD_STYLES)[number]

export type DigitalCardSettings = {
  enabled: boolean
  background: string
  accent: string
  style: DigitalCardStyle
}

export const DEFAULT_CARD_BACKGROUND = "#0F172A"
export const DEFAULT_CARD_ACCENT = "#2563EB"
export const DEFAULT_CARD_STYLE: DigitalCardStyle = "holographic"

const HEX = /^#[0-9A-Fa-f]{6}$/
export const isHexColor = (v: unknown): v is string => typeof v === "string" && HEX.test(v)
const isStyle = (v: unknown): v is DigitalCardStyle => DIGITAL_CARD_STYLES.includes(v as DigitalCardStyle)

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

/** Validation stricte d'une saisie admin (clés inconnues ignorées). */
export function sanitizeDigitalCard(
  input: unknown,
): { ok: true; value: DigitalCardSettings } | { ok: false; error: string } {
  if (!isRecord(input) || typeof input.enabled !== "boolean") return { ok: false, error: "Réglages invalides." }
  if (!isHexColor(input.background) || !isHexColor(input.accent)) {
    return { ok: false, error: "Couleur invalide (format #RRGGBB)." }
  }
  if (!isStyle(input.style)) return { ok: false, error: "Style de carte invalide." }
  return {
    ok: true,
    value: {
      enabled: input.enabled,
      background: input.background.toUpperCase(),
      accent: input.accent.toUpperCase(),
      style: input.style,
    },
  }
}

/** Réglages effectifs : valeur stockée valide, sinon défaut (accent = couleur principale du tenant si valide). */
export function resolveDigitalCard(stored: unknown, brandPrimary?: string | null): DigitalCardSettings {
  const s = isRecord(stored) ? stored : {}
  return {
    enabled: s.enabled !== false,
    background: isHexColor(s.background) ? s.background.toUpperCase() : DEFAULT_CARD_BACKGROUND,
    accent: isHexColor(s.accent)
      ? s.accent.toUpperCase()
      : isHexColor(brandPrimary)
        ? brandPrimary.toUpperCase()
        : DEFAULT_CARD_ACCENT,
    style: isStyle(s.style) ? s.style : DEFAULT_CARD_STYLE,
  }
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** Luminance relative WCAG 2.x d'une couleur `#RRGGBB`. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Texte noir ou blanc selon le contraste maximal (seuil de croisement WCAG ≈ 0,179). */
export function contrastText(hex: string): "#000000" | "#FFFFFF" {
  return relativeLuminance(hex) > 0.179 ? "#000000" : "#FFFFFF"
}

/** Assombrit (f < 1) une couleur `#RRGGBB`. */
export function shadeHex(hex: string, f: number): string {
  return `#${channels(hex)
    .map((c) => Math.max(0, Math.min(255, Math.round(c * f))).toString(16).padStart(2, "0"))
    .join("")}`
}

/** Fond de la face : uni, ou dégradé fond → accent (dégradé et holographique). */
export function cardFaceBackground(c: Pick<DigitalCardSettings, "background" | "accent" | "style">): string {
  if (c.style === "solid") return c.background
  return `linear-gradient(135deg, ${c.background} 0%, ${shadeHex(c.accent, 0.55)} 60%, ${c.accent} 130%)`
}

/** Ligne activité/zone : accroche du pied de page puis ville, jointes par « · » ; null si vide. */
export function cardLine(tagline: string | null | undefined, city: string | null | undefined): string | null {
  return [tagline?.trim(), city?.trim()].filter(Boolean).join(" · ") || null
}

// ── Boutons de la page publique ─────────────────────────────────────────────

export type CardActionKey = "book" | "call" | "whatsapp" | "directions" | "review" | "contact"
export type CardAction = { key: CardActionKey; label: string; href: string; external: boolean }

/** Mobile français (06/07 ou +336/+337) : seul cas où WhatsApp est proposé. */
export function isFrenchMobile(raw: string | null | undefined): boolean {
  return /^33[67]\d{8}$/.test(toWhatsAppDigits(raw) ?? "")
}

const filled = (v: string | null | undefined): v is string => typeof v === "string" && v.trim() !== ""

export function buildCardActions(input: {
  reservationUrl: string | null
  phone: string | null
  /** Adresse PUBLIQUE uniquement (atelier) — jamais le domicile d'un detailer mobile. */
  address: string | null
  reviewLink: string | null
  contactUrl: string
}): CardAction[] {
  const actions: CardAction[] = []
  if (filled(input.reservationUrl)) actions.push({ key: "book", label: "Réserver", href: input.reservationUrl, external: false })
  const tel = toTelHref(input.phone)
  if (tel) actions.push({ key: "call", label: "Appeler", href: tel, external: false })
  if (isFrenchMobile(input.phone)) {
    actions.push({ key: "whatsapp", label: "WhatsApp", href: `https://wa.me/${toWhatsAppDigits(input.phone)}`, external: true })
  }
  if (filled(input.address)) {
    actions.push({
      key: "directions",
      label: "Itinéraire",
      href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(input.address.trim())}`,
      external: true,
    })
  }
  if (filled(input.reviewLink)) actions.push({ key: "review", label: "Avis Google", href: input.reviewLink, external: true })
  actions.push({ key: "contact", label: "Enregistrer le contact", href: input.contactUrl, external: false })
  return actions
}

// ── vCard 3.0 ───────────────────────────────────────────────────────────────

export type VCardAddress = { street: string; postalCode: string; city: string }

/** Échappement vCard 3.0 (RFC 2426) : `\` `,` `;` et retours à la ligne. */
export function escapeVCard(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r\n|\r|\n/g, "\\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
}

// shortcut: lignes non pliées à 75 octets (acceptées par iOS/Android/Outlook) ; plier si un client le refuse.
export function buildVCard(input: {
  name: string
  phone?: string | null
  email?: string | null
  website?: string | null
  address?: VCardAddress | null
}): string {
  const name = escapeVCard(input.name.trim())
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${name};;;;`, `FN:${name}`, `ORG:${name}`]
  const tel = toTelHref(input.phone)
  if (tel) lines.push(`TEL;TYPE=WORK,VOICE:${tel.slice("tel:".length)}`)
  if (filled(input.email)) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(input.email.trim())}`)
  if (filled(input.website)) lines.push(`URL:${escapeVCard(input.website.trim())}`)
  const a = input.address
  if (a && filled(a.street)) {
    lines.push(`ADR;TYPE=WORK:;;${escapeVCard(a.street.trim())};${escapeVCard(a.city.trim())};;${escapeVCard(a.postalCode.trim())};`)
  }
  lines.push("END:VCARD")
  return `${lines.join("\r\n")}\r\n`
}
