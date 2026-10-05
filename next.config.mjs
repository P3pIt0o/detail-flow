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
}

export default nextConfig
