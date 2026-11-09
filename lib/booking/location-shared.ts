/**
 * Lieu d'intervention — logique PURE (aucun accès réseau), partagée entre
 * l'admin, Booking V2 (site + widget) et la création serveur de réservation.
 *
 * Règle clé : le client ne répond jamais à une question inutile.
 *  - déplacement seul → intervention chez le client, adresse demandée ;
 *  - atelier seul     → atelier imposé, aucune adresse client, aucun frais ;
 *  - les deux         → le client choisit.
 */

export type LocationType = "client" | "workshop"

export type LocationConfig = {
  mobileEnabled: boolean
  workshopEnabled: boolean
  workshopAddress: string
  workshopPostalCode: string
  workshopCity: string
}

export const DEFAULT_LOCATION_CONFIG: LocationConfig = {
  mobileEnabled: true,
  workshopEnabled: false,
  workshopAddress: "",
  workshopPostalCode: "",
  workshopCity: "",
}

/** Configuration publique consommée par le tunnel (aucune donnée inutile). */
export type PublicLocation = {
  mobile: boolean
  workshop: boolean
  /** Adresse complète de l'atelier, uniquement si l'atelier est proposé. */
  workshopAddress: string | null
  /** Libellés des cartes de choix (L39), déjà résolus avec repli. */
  labels?: LocationLabels
}

/* --- Libellés personnalisables (L39) : siteContent.locationLabels ---------- */

export type LocationLabel = { title: string; text: string }
export type LocationLabels = Record<LocationType, LocationLabel>
/** Forme stockée : seuls les champs renseignés sont présents. */
export type LocationLabelsInput = Partial<Record<LocationType, Partial<LocationLabel>>>

export const LOCATION_LABEL_MAX = { title: 40, text: 90 } as const

export const DEFAULT_LOCATION_LABELS: LocationLabels = {
  client: { title: "Chez vous", text: "Le professionnel vient à votre adresse." },
  workshop: { title: "À l'atelier", text: "Vous vous rendez directement à l'atelier." },
}

const LABEL_MODES: LocationType[] = ["client", "workshop"]
const LABEL_FIELDS: (keyof LocationLabel)[] = ["title", "text"]

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Texte brut sur une ligne : rogné, sans caractère de contrôle ni `<`/`>`, longueur bornée (jamais tronqué). */
function checkLabel(raw: string, field: keyof LocationLabel): { ok: true; value: string } | { ok: false; error: string } {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(raw)) return { ok: false, error: "Caractères non autorisés dans les libellés." }
  if (raw.includes("<") || raw.includes(">")) return { ok: false, error: "Les symboles < et > ne sont pas acceptés." }
  const value = raw.trim()
  const max = LOCATION_LABEL_MAX[field]
  if (value.length > max) {
    return { ok: false, error: field === "title" ? `Titre trop long (${max} caractères max).` : `Description trop longue (${max} caractères max).` }
  }
  return { ok: true, value }
}

/** Validation serveur des libellés saisis. Clés inconnues et valeurs non-chaîne ignorées, champs vides supprimés. */
export function sanitizeLocationLabels(input: unknown): { ok: true; value: LocationLabelsInput } | { ok: false; error: string } {
  const value: LocationLabelsInput = {}
  if (!isRecord(input)) return { ok: true, value }
  for (const mode of LABEL_MODES) {
    const raw = input[mode]
    if (!isRecord(raw)) continue
    const label: Partial<LocationLabel> = {}
    for (const field of LABEL_FIELDS) {
      if (typeof raw[field] !== "string") continue
      const res = checkLabel(raw[field], field)
      if (!res.ok) return res
      if (res.value) label[field] = res.value
    }
    if (Object.keys(label).length) value[mode] = label
  }
  return { ok: true, value }
}

/** Libellés affichés : valeur stockée valide, sinon texte par défaut (champ par champ). */
export function resolveLocationLabels(stored: unknown): LocationLabels {
  const out: LocationLabels = { client: { ...DEFAULT_LOCATION_LABELS.client }, workshop: { ...DEFAULT_LOCATION_LABELS.workshop } }
  if (!isRecord(stored)) return out
  for (const mode of LABEL_MODES) {
    const raw = stored[mode]
    if (!isRecord(raw)) continue
    for (const field of LABEL_FIELDS) {
      const v = raw[field]
      if (typeof v !== "string") continue
      const res = checkLabel(v, field)
      if (res.ok && res.value) out[mode][field] = res.value
    }
  }
  return out
}

export function isWorkshopAddressComplete(c: Pick<LocationConfig, "workshopAddress" | "workshopPostalCode" | "workshopCity">) {
  return Boolean(c.workshopAddress.trim() && c.workshopPostalCode.trim() && c.workshopCity.trim())
}

export function formatWorkshopAddress(c: Pick<LocationConfig, "workshopAddress" | "workshopPostalCode" | "workshopCity">) {
  const cityLine = [c.workshopPostalCode.trim(), c.workshopCity.trim()].filter(Boolean).join(" ")
  return [c.workshopAddress.trim(), cityLine].filter(Boolean).join(", ")
}

/**
 * Modes EFFECTIVEMENT proposés au client. L'atelier n'est proposé que si son
 * adresse est complète. Si aucun mode n'est exploitable, on retombe sur le
 * déplacement (comportement historique) : la réservation n'est jamais cassée.
 */
export function toPublicLocation(c: LocationConfig): PublicLocation {
  const workshop = c.workshopEnabled && isWorkshopAddressComplete(c)
  const mobile = c.mobileEnabled || !workshop
  return { mobile, workshop, workshopAddress: workshop ? formatWorkshopAddress(c) : null }
}

/** Mode retenu pour une réservation (autorité serveur, jamais le seul choix client). */
export function resolveLocationType(loc: PublicLocation, requested?: LocationType | null): LocationType {
  if (loc.workshop && !loc.mobile) return "workshop"
  if (loc.mobile && !loc.workshop) return "client"
  return requested === "workshop" ? "workshop" : "client"
}

/** Résumé court pour l'admin : « Atelier + déplacement », etc. */
export function describeLocation(c: LocationConfig): string {
  const workshop = c.workshopEnabled
  const mobile = c.mobileEnabled
  if (workshop && mobile) return "Atelier + déplacement"
  if (workshop) return "Atelier uniquement"
  if (mobile) return "Déplacement chez le client"
  return "Aucun lieu choisi"
}
