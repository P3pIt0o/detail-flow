/**
 * Zone d'intervention CLEANYZER — données d'AFFICHAGE uniquement.
 *
 * Ces données servent à la carte, à la recherche de commune et au texte SEO.
 * Elles ne constituent PAS une règle métier : aucune commune n'est déclarée
 * « incluse » ou « hors zone » ici. Les frais de déplacement éventuels sont
 * calculés exclusivement côté serveur par DetailFlow (getLocationConfig() +
 * computeTravel()) à partir de l'adresse complète saisie dans BookingV2.
 *
 * Liste non contractuelle (à valider par Tom) : simples exemples de communes
 * du secteur. Le cercle de la carte est purement indicatif.
 */

export type ZoneSectorId = "nord" | "annecy" | "agglo" | "alentours"
export type ZoneStatus = "base" | "secteur"

export type ZoneCommune = {
  slug: string
  name: string
  lat: number
  lng: number
  sector: ZoneSectorId
  status: ZoneStatus
  /** Commune principale : nom toujours visible sur la carte dézoomée. */
  major?: boolean
}

export const ZONE = {
  /** Rayon du cercle INDICATIF dessiné sur la carte (aucun effet sur le prix). */
  visualRadiusKm: 20,
  /** Centre visuel du cercle : Choisy (maquette validée). */
  base: { label: "Choisy", lat: 45.993, lng: 6.056 },
  /** Centre de la VUE (choix esthétique). */
  viewCenter: { lat: 45.93, lng: 6.1 },
} as const

export const ZONE_SECTORS: { id: ZoneSectorId; label: string }[] = [
  { id: "nord", label: "Autour de Choisy" },
  { id: "annecy", label: "Annecy et communes déléguées" },
  { id: "agglo", label: "Agglomération d'Annecy" },
  { id: "alentours", label: "Alentours" },
]

export const ZONE_COMMUNES: ZoneCommune[] = [
  { slug: "choisy", name: "Choisy", lat: 45.993, lng: 6.056, sector: "nord", status: "base", major: true },
  { slug: "la-balme-de-sillingy", name: "La Balme-de-Sillingy", lat: 45.9686, lng: 6.0386, sector: "nord", status: "secteur" },
  { slug: "sillingy", name: "Sillingy", lat: 45.9478, lng: 6.0389, sector: "nord", status: "secteur" },
  { slug: "allonzier-la-caille", name: "Allonzier-la-Caille", lat: 46.001, lng: 6.12, sector: "nord", status: "secteur" },
  { slug: "cruseilles", name: "Cruseilles", lat: 46.033, lng: 6.108, sector: "nord", status: "secteur", major: true },
  { slug: "groisy", name: "Groisy", lat: 46.011, lng: 6.17, sector: "nord", status: "secteur" },
  { slug: "frangy", name: "Frangy", lat: 46.019, lng: 5.931, sector: "nord", status: "secteur", major: true },
  { slug: "annecy", name: "Annecy", lat: 45.8992, lng: 6.1294, sector: "annecy", status: "secteur", major: true },
  { slug: "annecy-le-vieux", name: "Annecy-le-Vieux", lat: 45.9196, lng: 6.143, sector: "annecy", status: "secteur" },
  { slug: "seynod", name: "Seynod", lat: 45.8853, lng: 6.0883, sector: "annecy", status: "secteur" },
  { slug: "cran-gevrier", name: "Cran-Gevrier", lat: 45.9, lng: 6.105, sector: "annecy", status: "secteur" },
  { slug: "meythet", name: "Meythet", lat: 45.918, lng: 6.095, sector: "annecy", status: "secteur" },
  { slug: "pringy", name: "Pringy", lat: 45.946, lng: 6.124, sector: "annecy", status: "secteur" },
  { slug: "epagny-metz-tessy", name: "Épagny Metz-Tessy", lat: 45.937, lng: 6.095, sector: "agglo", status: "secteur" },
  { slug: "poisy", name: "Poisy", lat: 45.9214, lng: 6.0636, sector: "agglo", status: "secteur" },
  { slug: "argonay", name: "Argonay", lat: 45.95, lng: 6.143, sector: "agglo", status: "secteur" },
  { slug: "lovagny", name: "Lovagny", lat: 45.905, lng: 6.03, sector: "agglo", status: "secteur" },
  { slug: "chavanod", name: "Chavanod", lat: 45.89, lng: 6.039, sector: "agglo", status: "secteur" },
  { slug: "rumilly", name: "Rumilly", lat: 45.8667, lng: 5.9431, sector: "alentours", status: "secteur", major: true },
  { slug: "sevrier", name: "Sévrier", lat: 45.8644, lng: 6.1414, sector: "alentours", status: "secteur", major: true },
  { slug: "veyrier-du-lac", name: "Veyrier-du-Lac", lat: 45.882, lng: 6.175, sector: "alentours", status: "secteur" },
  { slug: "saint-jorioz", name: "Saint-Jorioz", lat: 45.8306, lng: 6.1606, sector: "alentours", status: "secteur" },
  { slug: "thorens-glieres", name: "Thorens-Glières", lat: 45.996, lng: 6.245, sector: "alentours", status: "secteur", major: true },
]

/** Raccourcis affichés sous le champ de recherche. */
export const ZONE_QUICK_PICKS = ["annecy", "seynod", "choisy", "cruseilles"] as const

export const ZONE_DEFAULT_SLUG = "annecy"

export function getCommune(slug: string | null | undefined): ZoneCommune | undefined {
  return ZONE_COMMUNES.find((c) => c.slug === slug)
}

export function sectorLabel(id: ZoneSectorId): string {
  return ZONE_SECTORS.find((s) => s.id === id)?.label ?? ""
}

/** Recherche insensible aux accents, tirets et apostrophes. */
export function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[-'\s]+/g, " ").trim()
}

/** Phrase « Nom1, Nom2 et Nom3 » pour le texte SEO. */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`
}
