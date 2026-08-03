/**
 * Constantes partagées pour les réseaux sociaux.
 *
 * IMPORTANT : ce module N'EST PAS un fichier `"use server"`. Un fichier
 * `"use server"` ne peut exporter que des fonctions async ; y exporter une
 * constante (array/objet) casse le chargement du module et provoque une erreur
 * serveur 500 (E352). On isole donc ici les valeurs non-fonctions afin qu'elles
 * puissent être importées à la fois par les Server Actions et par les composants
 * client.
 */

/** Clés de réseaux sociaux supportées (alignées sur socialIconMap du footer). */
export const SOCIAL_KEYS = ["instagram", "facebook", "youtube", "linkedin", "tiktok"] as const
export type SocialKey = (typeof SOCIAL_KEYS)[number]
