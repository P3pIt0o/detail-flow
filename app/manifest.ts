import type { MetadataRoute } from "next"

/**
 * Manifest PWA de DetailFlow (V1 : application admin installable).
 *
 * - `start_url: /admin` réutilise l'auth existante : connecté → dashboard,
 *   déconnecté → redirection vers /admin/login (aucune logique dupliquée).
 * - `display: standalone` ouvre l'app sans barre de navigateur.
 * - Couleurs alignées sur l'identité sombre actuelle (#0a0a12).
 * - Icône maskable pour un rendu propre sur Android.
 *
 * Évolutions futures possibles sans refonte : shortcuts (Planning/Clients),
 * manifest par tenant, notifications push.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DetailFlow",
    short_name: "DetailFlow",
    description:
      "Espace professionnel DetailFlow : réservations, planning, clients, devis et factures.",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a12",
    theme_color: "#0a0a12",
    lang: "fr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
