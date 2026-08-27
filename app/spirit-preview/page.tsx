// TEMPORAIRE — page d'aperçu visuel Spirit ACS (sera supprimée avant commit).
// Rend le site avec des données représentatives sans toucher à la base.
import { SpiritAcsHome } from "@/components/custom-sites/spirit-acs/home-page"
import type { CustomSitePublicData } from "@/lib/custom-sites/types"

export const dynamic = "force-dynamic"

const mock: CustomSitePublicData = {
  tenant: {
    id: 1,
    slug: "spirit-acs",
    name: "Spirit Detailing",
    logoUrl: null,
    brandPrimary: null,
    brandSecondary: null,
  },
  getContact: async () => ({
    name: "Spirit Detailing",
    email: "contact@spirit-detailing.fr",
    phone: "06 99 90 13 03",
    phoneRaw: "0699901303",
    address: "53 rue Pierre Semard, 77400 Lagny-sur-Marne",
    website: null,
    hero: {
      title: "L'art de la perfection automobile",
      highlight: "perfection",
      subtitle:
        "Nettoyage, polissage, céramique et protection PPF à Lagny-sur-Marne ou à votre domicile.",
      ctaPrimary: "Réserver en ligne",
      ctaSecondary: "Découvrir nos prestations",
    },
  }),
  getHours: async () => [],
  getServices: async () => [
    { id: 1, name: "Nettoyage intérieur & extérieur", description: "Un soin complet, intérieur comme extérieur.", image: "/services/lavage-premium.png", basePriceCents: 12000, slug: "n", visible: true, sortOrder: 0 },
    { id: 2, name: "Polissage & céramique", description: "Brillance et protection longue durée.", image: "/services/protection-ceramique.png", basePriceCents: 29000, slug: "p", visible: true, sortOrder: 1 },
    { id: 3, name: "Protection PPF", description: "Film de protection haute résistance.", image: "/services/renovation-carrosserie.png", basePriceCents: 69000, slug: "ppf", visible: true, sortOrder: 2 },
    { id: 4, name: "Moto & personnalisation", description: "Detailing adapté aux deux-roues.", image: "/services/interieur-complet.png", basePriceCents: 0, slug: "moto", visible: true, sortOrder: 3 },
  ],
  getReviews: async () => [
    { id: 1, author: "Julien D.", vehicle: "Lagny-sur-Marne", rating: 5, text: "Travail impeccable du début à la fin. Ma voiture est comme neuve, chaque détail est parfait. Je recommande les yeux fermés !", date: "2025-04-01" },
    { id: 2, author: "Sarah M.", vehicle: "Meaux", rating: 5, text: "Service au top, très professionnel et à l'écoute. Résultat au-delà de mes attentes.", date: "2025-03-18" },
    { id: 3, author: "Karim B.", vehicle: "Chelles", rating: 5, text: "Polissage nickel, intérieur comme neuf. Rien à redire, je reviendrai.", date: "2025-02-27" },
  ],
  getGallery: async () => [
    { id: 1, beforeImageUrl: "/gallery/before-1.png", afterImageUrl: "/gallery/after-1.png", title: "Intérieur cuir", description: "Nettoyage en profondeur." },
    { id: 2, beforeImageUrl: "/gallery/before-2.png", afterImageUrl: "/gallery/after-2.png", title: "Carrosserie", description: "Rénovation complète." },
    { id: 3, beforeImageUrl: "/gallery/before-3.png", afterImageUrl: "/gallery/after-3.png", title: "Jantes", description: "Décontamination." },
  ],
  getContent: async () => ({
    about: { title: "Qui sommes-nous ?", text: "Spirit Detailing met la passion de l'automobile au service de votre véhicule, à l'atelier de Lagny-sur-Marne comme à votre domicile.", buttonLabel: "", buttonHref: "" },
    services: { eyebrowEnabled: true, eyebrow: "Nos prestations", titleEnabled: true, title: "Un soin adapté à chaque véhicule", intro: "" },
    gallery: { enabled: true, title: "La différence se voit dans les détails", intro: "Un intérieur entretenu en profondeur pour retrouver le neuf." },
    reviews: { enabled: true, title: "Ce que disent nos clients", intro: "" },
    contact: { enabled: true, title: "Prêt à redonner de l'éclat à votre véhicule ?", text: "", buttonLabel: "Réserver" },
    footer: { text: "", tagline: "Detailing automobile & moto à Lagny-sur-Marne et à domicile." },
  }),
  getCustomRequestsConfig: async () => ({
    enabled: true,
    types: [{ key: "sur-mesure", label: "Prestation sur mesure", enabled: true, builtin: true }],
  }),
}

export default function SpiritPreviewPage() {
  return <SpiritAcsHome data={mock} />
}
