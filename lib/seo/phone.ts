/**
 * Normalisation LÉGÈRE et PURE d'un numéro de téléphone au format international
 * (E.164) destiné au JSON-LD `telephone`.
 *
 * Aucune dépendance, aucune donnée en base : uniquement une transformation de
 * chaîne, testable unitairement. Ne modifie JAMAIS la valeur enregistrée : sert
 * seulement à produire une valeur propre pour les données structurées.
 *
 * Règles :
 *  - accepte les espaces, points, tirets et parenthèses ;
 *  - conserve un numéro déjà international (« + » ou préfixe « 00 ») ;
 *  - convertit un numéro national commençant par « 0 » en « +<indicatif> »
 *    selon le pays (France par défaut lorsque le pays est absent) ;
 *  - ne force JAMAIS « +33 » sur un pays étranger connu ;
 *  - renvoie `null` si la valeur est absente, vide ou manifestement invalide
 *    (pour que l'appelant OMETTE simplement la propriété).
 */

/** Indicatifs pris en charge pour la conversion d'un numéro NATIONAL. */
const DIAL_CODES: Record<string, string> = {
  FR: "33",
  MC: "377",
  BE: "32",
  CH: "41",
  LU: "352",
}

/** Résout un code pays ISO-2 à partir d'une valeur libre (« FR », « France »). */
function resolveCountry(country?: string | null): string | null {
  const c = (country ?? "").trim().toUpperCase()
  if (!c) return null
  if (c === "FR" || c === "FRANCE") return "FR"
  if (c === "MC" || c === "MONACO") return "MC"
  if (c === "BE" || c === "BELGIQUE" || c === "BELGIUM") return "BE"
  if (c === "CH" || c === "SUISSE" || c === "SWITZERLAND") return "CH"
  if (c === "LU" || c === "LUXEMBOURG") return "LU"
  // Pays non répertorié : on ne devine pas d'indicatif.
  return c.length === 2 ? c : null
}

/**
 * Produit un numéro E.164 (« +33699901303 ») ou `null` si impossible en toute
 * sécurité. `country` est une indication facultative (ISO-2 ou nom courant).
 */
export function normalizePhoneForJsonLd(raw?: string | null, country?: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Retire les séparateurs usuels (espaces, points, tirets, parenthèses).
  const cleaned = trimmed.replace(/[\s.\-()]/g, "")
  if (!cleaned) return null

  // Déjà international : « + » suivi de chiffres.
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1).replace(/\D/g, "")
    // E.164 : 8 à 15 chiffres.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  }

  // Préfixe international « 00 » → « + ».
  if (cleaned.startsWith("00")) {
    const digits = cleaned.slice(2).replace(/\D/g, "")
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  }

  // À ce stade, tout caractère non numérique rend la valeur invalide.
  if (!/^\d+$/.test(cleaned)) return null

  // Numéro NATIONAL : nécessite un indicatif de pays connu.
  const iso = resolveCountry(country) ?? "FR" // France par défaut (contexte de l'app).
  const dial = DIAL_CODES[iso]
  if (!dial) return null // Pays étranger sans indicatif connu : on n'invente rien.

  // Numéro national français/européen : « 0XXXXXXXXX » → « +<dial>XXXXXXXXX ».
  if (cleaned.startsWith("0")) {
    const national = cleaned.slice(1)
    if (national.length < 8 || national.length > 12) return null
    return `+${dial}${national}`
  }

  // Numéro déjà sans « 0 » initial mais purement national : on le préfixe aussi.
  if (cleaned.length >= 8 && cleaned.length <= 12) return `+${dial}${cleaned}`

  return null
}
