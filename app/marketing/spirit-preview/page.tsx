// APERÇU TEMPORAIRE (non destiné à la prod) — rend le site Spirit ACS avec un
// contrat public MOCK afin de vérifier visuellement la mise en page. Aucune
// donnée réelle, aucun accès DB. À supprimer après validation.

import { SpiritAcsHome } from "@/components/custom-sites/spirit-acs/home-page"
import type { CustomSitePublicData } from "@/lib/custom-sites/types"

export const dynamic = "force-dynamic"

const img = (seed: string) => `/placeholder.svg?height=800&width=1000&query=${seed}`

const mock: CustomSitePublicData = {
  tenant: {
    id: 1,
    slug: "spirit",
    name: "Spirit Detailing",
    logoUrl: null,
    brandPrimary: null,
    brandSecondary: null,
  },
  getContact: async () => ({
    name: "Spirit Detailing",
    email: "contact@spirit-detailing.fr",
    phone: "06 12 34 56 78",
    phoneRaw: "0612345678",
    address: "12 rue des Ateliers, 69000 Lyon",
    website: null,
    hero: {
      title: "La différence se voit dans les détails",
      highlight: "détails",
      subtitle:
        "Detailing automobile haut de gamme : nettoyage, polissage, protection céramique. Réservez votre créneau ou demandez un devis personnalisé.",
      ctaPrimary: "Réserver en ligne",
      ctaSecondary: "Nos prestations",
    },
  }),
  getHours: async () => [],
  getServices: async () => [
    { id: 1, name: "Nettoyage intérieur", description: "Aspiration, plastiques, vitres", image: img("car interior detailing"), basePriceCents: 12000 },
    { id: 2, name: "Polissage carrosserie", description: "Correction des micro-rayures", image: img("car paint polishing"), basePriceCents: 25000 },
    { id: 3, name: "Protection céramique", description: "Brillance et protection longue durée", image: img("ceramic coating car"), basePriceCents: 0 },
    { id: 4, name: "Lavage premium", description: "Extérieur main + séchage", image: img("premium car wash"), basePriceCents: 6000 },
  ],
  getReviews: async () => [
    { id: "1", author: "Julien M.", vehicle: "Audi A4", rating: 5, text: "Travail impeccable, rendu bluffant.", date: "2025-06-01" },
    { id: "2", author: "Sophie L.", vehicle: "BMW Série 1", rating: 5, text: "Voiture comme neuve, service top.", date: "2025-05-12" },
    { id: "3", author: "Karim B.", vehicle: "Mercedes C", rating: 5, text: "Protection céramique parfaite.", date: "2025-04-20" },
  ],
  getGallery: async () => [
    { id: 1, beforeImageUrl: img("dirty car before"), afterImageUrl: img("clean shiny car after"), title: "Berline noire", description: "Correction + céramique" },
    { id: 2, beforeImageUrl: img("dull car paint"), afterImageUrl: img("glossy car paint"), title: "SUV blanc", description: "Polissage complet" },
    { id: 3, beforeImageUrl: img("stained seats"), afterImageUrl: img("clean car seats"), title: "Intérieur cuir", description: "Rénovation sellerie" },
  ],
  getContent: async () => ({
    about: { title: "À propos de Spirit", text: "Passionnés de detailing, nous prenons soin de chaque véhicule avec exigence et minutie.", buttonLabel: "Nous contacter", buttonHref: "#contact" },
    services: { eyebrowEnabled: true, eyebrow: "Nos prestations", titleEnabled: true, title: "Un soin adapté à chaque véhicule", intro: "Des formules pensées pour préserver et sublimer votre voiture." },
    gallery: { enabled: true, title: "Nos réalisations", intro: "La différence se voit dans les détails." },
    reviews: { enabled: true, title: "Ils nous font confiance", intro: "Ce que disent nos clients." },
    contact: { enabled: true, title: "Prêt à redonner de l'éclat à votre véhicule ?", text: "", buttonLabel: "Réserver" },
    footer: { text: "", tagline: "Detailing automobile premium à Lyon." },
  }),
  getCustomRequestsConfig: async () => ({
    enabled: true,
    title: "Demander un devis",
    description: "Un besoin sur mesure ? Décrivez votre projet, nous revenons vers vous avec une proposition adaptée.",
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
  return <SpiritAcsHome data={mock} />
}
