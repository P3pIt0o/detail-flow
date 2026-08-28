// HARNESS DE PRÉVISUALISATION TEMPORAIRE (non destiné à la production).
// Rend le site Spirit avec des données mockées conformes au contrat public,
// afin de vérifier visuellement le lot 4. Sera supprimé avant le commit.
import { SpiritAcsHome } from "@/components/custom-sites/spirit-acs/home-page"
import { WhatsAppButton } from "@/components/layout/whatsapp-button"
import type { CustomSitePublicData } from "@/lib/custom-sites/types"

export const dynamic = "force-dynamic"

const HERO = "/custom-sites/spirit-acs/spirit-hero-v2.webp"

const data: CustomSitePublicData = {
  tenant: {
    id: 1,
    slug: "spirit-acs",
    name: "Spirit Detailing",
    logoUrl: null, // force le repli logo officiel embarqué
    brandPrimary: null,
    brandSecondary: null,
  },
  getContact: async () => ({
    name: "Spirit Detailing",
    email: "contact@spirit-detailing.fr",
    phone: "06 99 90 13 03",
    phoneRaw: "0699901303",
    address: "12 rue des Ateliers, 77400 Lagny-sur-Marne", // NE DOIT PAS s'afficher
    city: "Lagny-sur-Marne",
    website: null,
    hero: {
      title: "L'excellence du detailing",
      highlight: "detailing",
      subtitle:
        "Protection céramique, rénovation et soin haut de gamme pour votre véhicule, réalisés à la main avec exigence.",
      ctaPrimary: null,
      ctaSecondary: null,
    },
  }),
  getHours: async () => [],
  getServices: async () => [],
  getReviews: async () => [
    { id: "1", author: "Karim B.", vehicle: "Mercedes Classe C", rating: 5, text: "Travail impeccable, voiture comme neuve.", date: "2026-05-01" },
    { id: "2", author: "Julie R.", vehicle: "Audi A3", rating: 5, text: "Protection céramique parfaite, je recommande.", date: "2026-06-10" },
    { id: "3", author: "Thomas L.", vehicle: "BMW Série 4", rating: 5, text: "Accueil pro et finitions au top.", date: "2026-07-02" },
  ],
  getGallery: async () => [
    { id: 1, beforeImageUrl: HERO, afterImageUrl: HERO, title: "Rénovation carrosserie", description: null },
    { id: 2, beforeImageUrl: HERO, afterImageUrl: HERO, title: "Protection céramique", description: null },
  ],
  getContent: async () => ({
    about: { title: "À propos de Spirit", text: "Passionnés de detailing depuis des années.", buttonLabel: "", buttonHref: "" },
    services: { eyebrowEnabled: false, eyebrow: "", titleEnabled: false, title: "", intro: "" },
    gallery: { enabled: true, title: "Nos réalisations", intro: "" },
    reviews: { enabled: true, title: "Ils nous font confiance", intro: "" },
    contact: { enabled: true, title: "Prêt à sublimer votre véhicule ?", text: "", buttonLabel: "" },
    footer: { text: "", tagline: "Detailing automobile premium à Lagny-sur-Marne." },
  }),
  getCustomRequestsConfig: async () => ({
    enabled: true,
    title: "Demander un devis",
    description: "Décrivez votre besoin, nous revenons vers vous avec une proposition adaptée.",
    ctaLabel: "Envoyer ma demande",
    types: [
      { key: "sur-mesure", label: "Prestation sur mesure", enabled: true, builtin: true },
      { key: "abonnement", label: "Abonnement / entretien régulier", enabled: true, builtin: true },
      { key: "flotte", label: "Flotte / véhicules d'entreprise", enabled: true, builtin: true },
      { key: "autre", label: "Autre demande", enabled: true, builtin: true },
    ],
  }),
}

export default async function SpiritPreviewPage() {
  return (
    <>
      {/* @ts-expect-error composant serveur asynchrone */}
      <SpiritAcsHome data={data} />
      <WhatsAppButton phone="0699901303" />
    </>
  )
}
