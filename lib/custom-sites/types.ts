/**
 * Sites publics ENTIÈREMENT personnalisés — types partagés.
 *
 * Ce fichier ne contient QUE des types (aucune dépendance serveur/DB) : il est
 * donc importable partout (registre, adaptateur serveur, super-admin) sans
 * embarquer de code d'accès aux données.
 *
 * Vocabulaire volontaire : « customSiteKey », « CustomSiteDefinition »,
 * « customSiteRegistry ». Ce n'est NI un template, NI un thème, NI un builder :
 * chaque site personnalisé a sa propre identité visuelle et son propre shell.
 */

import type { ComponentType } from "react"
import type { PublicContact, PublicHours } from "@/lib/public-contact"
import type { PublicGalleryItem } from "@/lib/public-gallery"
import type { PublicPhotoGalleryItem } from "@/lib/public-photo-gallery"
import type { Review } from "@/config/content"

/**
 * CONTRAT DE DONNÉES PUBLIC exposé à un site personnalisé.
 *
 * Résolu ENTIÈREMENT côté serveur à partir du tenant de la requête (jamais d'un
 * `companyId` envoyé par le navigateur). Les données lourdes (prestations, avis,
 * galerie, contenu…) sont exposées via des LOADERS paresseux : une route ne
 * charge que ce qu'elle affiche réellement, sans tirer toute la base à chaque
 * rendu.
 *
 * Un site personnalisé NE DOIT JAMAIS : importer `db`, interroger Drizzle,
 * recevoir un `companyId` du client, recalculer un prix, déterminer une
 * disponibilité, créer une réservation ou appeler Stripe. Il consomme
 * uniquement ce contrat et réutilise les routes/modules métier existants.
 */
export interface CustomSitePublicData {
  /** Identité minimale sûre du tenant courant (jamais de champ sensible). */
  tenant: {
    id: number
    slug: string
    name: string
    logoUrl: string | null
    brandPrimary: string | null
    brandSecondary: string | null
  }
  /** Coordonnées publiques (nom, email, téléphone, adresse, site, hero). */
  getContact: () => Promise<PublicContact>
  /** Horaires d'ouverture réels (vide = section masquée par l'appelant). */
  getHours: () => Promise<PublicHours[]>
  /** Prestations visibles du tenant (avec image résolue). */
  getServices: () => Promise<Array<Record<string, unknown> & { image: string }>>
  /** Avis visibles du tenant. */
  getReviews: () => Promise<Review[]>
  /** Réalisations Avant/Après du tenant. */
  getGallery: () => Promise<PublicGalleryItem[]>
  /** Galerie de photos simples (publiées) du tenant. */
  getPhotoGallery: () => Promise<PublicPhotoGalleryItem[]>
  /** Contenu éditable résolu des sections statiques (textes + activation). */
  getContent: () => Promise<unknown>
  /** Configuration résolue des « Demandes personnalisées ». */
  getCustomRequestsConfig: () => Promise<unknown>
}

/**
 * Définition d'un site public personnalisé enregistré dans le registre.
 *
 * `ownShell = true` : le site fournit sa PROPRE structure (navigation, pied de
 * page…). Le dispatch public n'applique alors pas la Navbar/Footer standard,
 * mais conserve le tracking et les gardes communes (licence `website`).
 */
export interface CustomSiteDefinition {
  /** Clé technique stable (ex. "spirit-acs"). */
  key: string
  /** Nom lisible affiché au super-admin (ex. "Spirit ACS"). */
  name: string
  /** true = le site rend son propre shell (pas de Navbar/Footer standard). */
  ownShell: boolean
  /** Composant serveur de la page d'accueil personnalisée. */
  Page: ComponentType<{ data: CustomSitePublicData }>
}
