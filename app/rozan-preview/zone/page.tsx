import { RozanLocalPage } from "@/components/custom-sites/rozan/local-page"

// Exemple de landing page locale SEO (Phase 2).
export default function RozanPreviewLocalPage() {
  return (
    <RozanLocalPage
      slug="nettoyage-canape"
      city="Genève"
      nearbyCities={["Carouge", "Grand-Saconnex", "Versoix", "Nyon"]}
    />
  )
}
