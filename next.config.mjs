/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  /**
   * Redirections 301 PERMANENTES — nettoyage SEO du regroupement Spirit ACS en
   * 6 familles. Les prestations « Entretien régulier » et « Moteur & échappement »
   * ne sont plus des pages autonomes : leur contenu a été fusionné dans la page
   * « Nettoyage intérieur & extérieur ». Chaque ancienne URL pointe DIRECTEMENT
   * vers sa destination finale (aucune chaîne de redirections). Next.js conserve
   * automatiquement la query string entrante (`?tenant=spirit-acs` en préversion).
   * Ces slugs n'ont jamais existé pour un autre tenant → redirection globale sûre.
   */
  async redirects() {
    return [
      {
        source: "/prestations/entretien-regulier",
        destination: "/prestations/nettoyage-automobile",
        permanent: true,
      },
      {
        source: "/prestations/nettoyage-moteur",
        destination: "/prestations/nettoyage-automobile",
        permanent: true,
      },
    ]
  },

  /**
   * EN-TÊTES DE SÉCURITÉ (défense en profondeur).
   *
   * Règle d'encadrement (clickjacking / embed) :
   *  - Par DÉFAUT, toute l'application est verrouillée : `frame-ancestors 'self'`
   *    + `X-Frame-Options: SAMEORIGIN`. L'admin, le super-admin et les pages
   *    tenant ne peuvent donc JAMAIS être embarqués dans une iframe tierce.
   *  - EXCEPTION explicite et volontaire : le MODULE DE RÉSERVATION embarquable
   *    (`/embed/*`) et son script (`/widget/*`) doivent pouvoir être intégrés
   *    sur n'importe quel site client. On y AUTORISE donc l'encadrement
   *    (`frame-ancestors *`) et on retire `X-Frame-Options` (héritage bloquant).
   *    Ces routes sont PUBLIQUES et sans donnée sensible ; la sécurité métier
   *    reste côté serveur (tenant résolu serveur, montants recalculés).
   *
   * Note : l'aperçu v0 retire les en-têtes d'encadrement pour pouvoir afficher
   * l'app dans son iframe ; ces règles s'appliquent donc surtout en PRODUCTION.
   */
  async headers() {
    const baseline = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
    ]
    return [
      // Routes embarquables : encadrement autorisé partout. Placées EN PREMIER,
      // mais Next applique tous les blocs correspondants : on ne remet donc pas
      // X-Frame-Options ici (et le bloc par défaut ci-dessous exclut /embed et
      // /widget pour ne pas les reverrouiller).
      {
        source: "/embed/:path*",
        headers: [
          ...baseline,
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
      {
        source: "/widget/:path*",
        headers: [
          ...baseline,
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
      // Tout le reste : verrouillé. `(?!embed|widget)` empêche ce bloc de
      // réappliquer un encadrement restrictif aux deux routes ci-dessus.
      {
        source: "/:path((?!embed|widget).*)",
        headers: [
          ...baseline,
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ]
  },
}

export default nextConfig
