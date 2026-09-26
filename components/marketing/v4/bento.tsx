import type { ReactNode } from "react"
import {
  BellRing,
  Camera,
  Car,
  Check,
  Download,
  MapPin,
  MessageSquareText,
  Star,
  Store,
  TicketPercent,
} from "lucide-react"
import { StaggerGroup, StaggerItem } from "@/components/ui/reveal"
import { cn } from "@/lib/utils"
import { Container, SectionIntro } from "./primitives"
import { DEMO_SERVICES, DEMO_VEHICLE_TYPES } from "./demo-data"

function BentoCard({
  title,
  text,
  children,
  className,
  visualClassName,
}: {
  title: string
  text: string
  children: ReactNode
  className?: string
  visualClassName?: string
}) {
  return (
    <StaggerItem className={cn("h-full", className)}>
      <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_1px_2px_oklch(0.2_0.02_262/0.04)] transition-shadow duration-300 hover:shadow-[0_24px_60px_-30px_oklch(0.25_0.06_260/0.35)]">
        <div className="p-6 pb-0 sm:p-7 sm:pb-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-1.5 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">{text}</p>
        </div>
        <div className={cn("mt-6 flex flex-1 flex-col justify-end px-6 pb-6 sm:px-7 sm:pb-7", visualClassName)}>
          <div className="df-product rounded-2xl border border-border bg-background p-4 text-foreground transition-transform duration-500 group-hover:-translate-y-0.5">
            {children}
          </div>
        </div>
      </article>
    </StaggerItem>
  )
}

function ClientVisual() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            TM
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold">Thomas Martin</p>
            <p className="truncate text-[11.5px] text-muted-foreground">06 12 34 56 78 · Client depuis mars</p>
          </div>
        </div>
        <p className="mb-2 mt-4 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Véhicules</p>
        <ul className="flex flex-col gap-1.5">
          {[
            { m: "Audi A3", t: "Berline", p: "AB-123-CD" },
            { m: "Renault Kangoo", t: "Utilitaire", p: "EF-456-GH" },
          ].map((v) => (
            <li key={v.p} className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2">
              <Car className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                {v.m} <span className="text-muted-foreground">· {v.t}</span>
              </span>
              <span className="font-mono text-[10.5px] text-muted-foreground">{v.p}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Historique</p>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {[
            { d: "24 sept.", s: "Nettoyage intérieur complet", st: "Confirmée", c: "text-primary" },
            { d: "12 juin", s: "Polissage 1 étape", st: "Facturée", c: "text-emerald-400" },
            { d: "03 mars", s: "Lavage extérieur premium", st: "Facturée", c: "text-emerald-400" },
          ].map((h) => (
            <li key={h.d} className="flex items-center gap-2 px-2.5 py-2">
              <span className="w-14 shrink-0 whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">{h.d}</span>
              <span className="min-w-0 flex-1 truncate text-[12px]">{h.s}</span>
              <span className={cn("shrink-0 text-[10.5px] font-medium", h.c)}>{h.st}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function RequestVisual() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-semibold">Demande · Rénovation cuir</p>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Nouvelle</span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        « Sièges avant usés côté conducteur, possible de les rénover avant une revente ? »
      </p>
      <div className="mt-3 grid grid-cols-3 gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex aspect-square items-center justify-center rounded-lg border border-border bg-muted">
            <Camera className="size-4 text-muted-foreground" />
          </span>
        ))}
      </div>
      <ol className="mt-4 flex flex-col gap-2.5 border-l border-border pl-4">
        {[
          { t: "Demande reçue", m: "3 photos jointes", done: true },
          { t: "Proposition envoyée", m: "280 € · 5 h", done: true },
          { t: "Acceptée par le client", m: "À planifier", done: false },
        ].map((s) => (
          <li key={s.t} className="relative">
            <span
              className={cn(
                "absolute -left-[21px] top-1 size-2.5 rounded-full ring-4 ring-background",
                s.done ? "bg-emerald-400" : "bg-primary df-pulse-dot",
              )}
              aria-hidden="true"
            />
            <p className="text-[12px] font-medium">{s.t}</p>
            <p className="text-[11px] text-muted-foreground">{s.m}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function PriceMatrixVisual() {
  const services = DEMO_SERVICES.slice(0, 3)
  return (
    <table className="w-full text-left text-[11px]">
      <caption className="sr-only">Exemple de grille de prix par type de véhicule</caption>
      <thead>
        <tr className="text-muted-foreground">
          <th scope="col" className="pb-2 font-medium">Prestation</th>
          {DEMO_VEHICLE_TYPES.slice(0, 3).map((v) => (
            <th key={v.id} scope="col" className="pb-2 text-right font-medium">
              {v.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {services.map((s) => (
          <tr key={s.id}>
            <th scope="row" className="py-2 pr-2 font-medium">
              {s.category}
            </th>
            {s.prices.slice(0, 3).map((p, i) => (
              <td key={i} className="py-2 text-right font-mono">
                {p} €
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PromoVisual() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <TicketPercent className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[14px] font-semibold tracking-wider">BIENVENUE10</p>
        <p className="text-[11px] text-muted-foreground">−10 % · dès 80 € · usage limité</p>
      </div>
      <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-medium text-emerald-400">Actif</span>
    </div>
  )
}

function PaymentsVisual() {
  return (
    <ul className="flex flex-col gap-2">
      {[
        { l: "Acompte 30 %", v: "34,20 €", s: "Payé", c: "bg-emerald-500/12 text-emerald-400" },
        { l: "Solde après prestation", v: "79,80 €", s: "À encaisser", c: "bg-amber-500/12 text-amber-400" },
        { l: "Remboursement", v: "—", s: "Possible", c: "bg-muted text-muted-foreground" },
      ].map((p) => (
        <li key={p.l} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[12px]">{p.l}</span>
          <span className="font-mono text-[12px]">{p.v}</span>
          <span className={cn("w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-medium", p.c)}>{p.s}</span>
        </li>
      ))}
    </ul>
  )
}

function TravelVisual() {
  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted p-1 text-[11.5px] font-medium">
        <span className="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-muted-foreground">
          <Store className="size-3.5" aria-hidden="true" />
          Atelier
        </span>
        <span className="flex items-center justify-center gap-1.5 rounded-md bg-card py-1.5 shadow-sm">
          <MapPin className="size-3.5 text-primary" aria-hidden="true" />
          Déplacement
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { k: "Gratuit", v: "10 km" },
          { k: "Au-delà", v: "0,50 €/km" },
          { k: "Maximum", v: "40 km" },
        ].map((d) => (
          <div key={d.k} className="rounded-lg border border-border bg-card px-2 py-2">
            <dt className="text-[10px] text-muted-foreground">{d.k}</dt>
            <dd className="mt-0.5 font-mono text-[12px] font-semibold">{d.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function RemindersVisual() {
  return (
    <ul className="flex flex-col gap-2">
      <li className="flex items-center gap-2.5 text-[12px]">
        <BellRing className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1">Rappel la veille du rendez-vous</span>
        <Check className="size-3.5 text-emerald-400" aria-label="activé" />
      </li>
      <li className="flex items-center gap-2.5 text-[12px]">
        <MessageSquareText className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1">SMS de rappel</span>
        <Check className="size-3.5 text-emerald-400" aria-label="activé" />
      </li>
      <li className="flex items-center gap-2.5 text-[12px]">
        <Star className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1">Demande d&apos;avis après la prestation</span>
        <Check className="size-3.5 text-emerald-400" aria-label="activé" />
      </li>
    </ul>
  )
}

function StatsVisual() {
  const bars = [38, 52, 44, 70, 58, 82, 66]
  return (
    <div>
      <div className="flex h-20 items-end gap-1.5" aria-hidden="true">
        {bars.map((h, i) => (
          <span
            key={i}
            className={cn("flex-1 rounded-t-md", i === bars.length - 2 ? "bg-primary" : "bg-primary/25")}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <p className="mt-2 font-mono text-[10.5px] text-muted-foreground">Chiffre d&apos;affaires · aperçu illustratif</p>
    </div>
  )
}

function ExportVisual() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
        <Download className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-mono text-[12px] font-medium">export-detailflow.zip</p>
        <p className="text-[11px] text-muted-foreground">Clients, réservations, factures · CSV + JSON</p>
      </div>
    </div>
  )
}

export function Bento() {
  return (
    <section id="fonctionnalites" aria-labelledby="bento-title" className="scroll-mt-24 py-24 sm:py-32">
      <Container>
        <SectionIntro
          titleId="bento-title"
          eyebrow="Fonctionnalités"
          title="Tout ce qui fait tourner l'atelier, au même endroit."
          lead="Chaque module partage les mêmes données : un client, ses véhicules, ses rendez-vous, ses paiements et ses factures."
        />

        <StaggerGroup className="mt-14 grid auto-rows-auto grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
          <BentoCard
            className="md:col-span-2 lg:col-span-4"
            title="Clients et véhicules"
            text="Une fiche par client, ses véhicules, tout son historique. Créée automatiquement à la première réservation."
          >
            <ClientVisual />
          </BentoCard>
          <BentoCard
            className="md:row-span-2 lg:col-span-2"
            visualClassName="justify-start"
            title="Demandes personnalisées"
            text="Pour les travaux hors catalogue : le client décrit son besoin et joint des photos, vous envoyez une proposition."
          >
            <RequestVisual />
          </BentoCard>
          <BentoCard
            className="lg:col-span-2"
            title="Prestations et tarifs"
            text="Un prix et une durée par type de véhicule."
          >
            <PriceMatrixVisual />
          </BentoCard>
          <BentoCard className="lg:col-span-2" title="Codes promo" text="Pourcentage ou montant, minimum de commande, nombre d'utilisations.">
            <PromoVisual />
          </BentoCard>
          <BentoCard
            className="lg:col-span-3"
            title="Paiements et acomptes"
            text="Acompte fixe ou en pourcentage via Stripe, solde suivi, remboursement depuis l'admin."
          >
            <PaymentsVisual />
          </BentoCard>
          <BentoCard
            className="lg:col-span-3"
            title="Atelier et déplacement"
            text="Kilomètres offerts, prix au kilomètre, distance maximale : les frais s'ajoutent au total."
          >
            <TravelVisual />
          </BentoCard>
          <BentoCard className="lg:col-span-2" title="Rappels et avis" text="Moins d'oublis, plus d'avis clients.">
            <RemindersVisual />
          </BentoCard>
          <BentoCard className="lg:col-span-2" title="Suivi de l'activité" text="Votre chiffre d'affaires et vos rendez-vous en un coup d'œil.">
            <StatsVisual />
          </BentoCard>
          <BentoCard className="md:col-span-2 lg:col-span-2" title="Vos données restent à vous" text="Export complet de votre compte à tout moment.">
            <ExportVisual />
          </BentoCard>
        </StaggerGroup>
      </Container>
    </section>
  )
}
