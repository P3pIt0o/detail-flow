/**
 * Normalisation de numéros de téléphone (pur, sans dépendance).
 *
 * Utilisé par le bouton WhatsApp partagé (wa.me exige des chiffres au format
 * international, sans « + ») et par les liens `tel:` des sites publics.
 *
 * Règle FR : un numéro local à 10 chiffres commençant par « 0 » (ex.
 * « 06 99 90 13 03 ») est converti au format international « 33 » →
 * « 33699901303 ». Un numéro déjà international (préfixe « + » ou « 33… »)
 * est conservé. Aucune valeur n'est inventée : une entrée vide renvoie `null`.
 */

/** Chiffres internationaux pour wa.me (sans « + »). `null` si aucun numéro. */
export function toWhatsAppDigits(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Numéro déjà international explicite (« +33… ») : on garde les chiffres.
  if (trimmed.startsWith("+")) {
    const d = trimmed.replace(/\D/g, "")
    return d || null
  }

  const digits = trimmed.replace(/\D/g, "")
  if (!digits) return null

  // FR local : 0X XX XX XX XX (10 chiffres, préfixe 0) → 33 + reste.
  if (digits.length === 10 && digits.startsWith("0")) return `33${digits.slice(1)}`

  return digits
}

/** Lien `tel:` normalisé (E.164 « +33… » pour un numéro FR local reconnu). */
export function toTelHref(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("+")) {
    const d = trimmed.replace(/[^\d]/g, "")
    return d ? `tel:+${d}` : null
  }

  const digits = trimmed.replace(/\D/g, "")
  if (!digits) return null

  if (digits.length === 10 && digits.startsWith("0")) return `tel:+33${digits.slice(1)}`

  return `tel:${digits}`
}
