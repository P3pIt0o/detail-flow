import { ArrowRight, CalendarCheck, CreditCard, Download, FileText, RotateCcw, Wrench, type LucideIcon } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { Container, EventToast, SectionIntro } from "./primitives"

const FLOW: { label: string; icon: LucideIcon }[] = [
  { label: "Réservation", icon: CalendarCheck },
  { label: "Prestation réalisée", icon: Wrench },
  { label: "Paiement", icon: CreditCard },
  { label: "Facture", icon: FileText },
]

const POINTS = [
  { t: "Numérotation continue", d: "Factures et avoirs ont chacun leur propre séquence annuelle." },
  { t: "TVA ou franchise", d: "Taux appliqués ou mention d'exonération selon votre statut." },
  { t: "Coordonnées complètes", d: "Votre entreprise et votre client, repris automatiquement." },
  { t: "PDF et suivi", d: "Téléchargez, envoyez, suivez les paiements reçus." },
]

function InvoiceDocument() {
  const lines = [
    { l: "Nettoyage intérieur complet — Berline", q: 1, ht: 74.17 },
    { l: "Option · Poils d'animaux", q: 1, ht: 20.83 },
  ]
  const ht = lines.reduce((s, x) => s + x.ht, 0)
  const tva = ht * 0.2
  const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n)

  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-foreground shadow-[0_40px_100px_-40px_oklch(0.25_0.06_260/0.4)] sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Atelier Lumière Detailing</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            12 rue de l&apos;Exemple, 69007 Lyon
            <br />
            SIRET 000 000 000 00000
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xs font-semibold tracking-wider text-primary">FACTURE</p>
          <p className="mt-1 font-mono text-sm font-semibold">FAC-2026-0042</p>
          <p className="text-xs text-muted-foreground">24/09/2026</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-muted/70 px-4 py-3 text-xs">
        <p className="text-muted-foreground">Facturé à</p>
        <p className="mt-0.5 font-medium">Thomas Martin · Audi A3 · AB-123-CD</p>
      </div>

      <table className="mt-6 w-full text-left text-xs">
        <caption className="sr-only">Détail de la facture de démonstration</caption>
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th scope="col" className="pb-2 font-medium">Désignation</th>
            <th scope="col" className="pb-2 text-right font-medium">Qté</th>
            <th scope="col" className="pb-2 text-right font-medium">Total HT</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((x) => (
            <tr key={x.l} className="border-b border-border">
              <td className="py-2.5 pr-3">{x.l}</td>
              <td className="py-2.5 text-right font-mono">{x.q}</td>
              <td className="py-2.5 text-right font-mono">{fmt(x.ht)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-4 flex max-w-60 flex-col gap-1.5 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Total HT</dt>
          <dd className="font-mono">{fmt(ht)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">TVA 20 %</dt>
          <dd className="font-mono">{fmt(tva)}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>Total TTC</dt>
          <dd className="font-mono">{fmt(ht + tva)}</dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>Acompte versé</dt>
          <dd className="font-mono">−{fmt(34.2)}</dd>
        </div>
        <div className="mt-1 flex justify-between border-t border-border pt-2 font-semibold">
          <dt>Solde réglé le 24/09</dt>
          <dd className="font-mono">{fmt(ht + tva - 34.2)}</dd>
        </div>
      </dl>

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
        <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">Payée</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Download className="size-3.5" aria-hidden="true" />
          Télécharger le PDF
        </span>
      </div>
    </div>
  )
}

export function Invoicing() {
  return (
    <section aria-labelledby="invoicing-title" className="border-t border-border py-24 sm:py-32">
      <Container>
        <SectionIntro
          titleId="invoicing-title"
          eyebrow="Facturation"
          title="Du rendez-vous à la facture."
          lead="La facture reprend la réservation, le client, le véhicule et l'acompte déjà versé. Rien à ressaisir."
        />

        <ol className="mt-12 flex flex-wrap items-center gap-2 sm:gap-3">
          {FLOW.map((f, i) => (
            <li key={f.label} className="flex items-center gap-2 sm:gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground">
                <f.icon className="size-4 text-primary" aria-hidden="true" />
                {f.label}
              </span>
              {i < FLOW.length - 1 && <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />}
            </li>
          ))}
        </ol>

        <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14">
          <Reveal className="relative">
            <InvoiceDocument />
            <div className="pointer-events-none absolute -bottom-6 -right-4 hidden w-64 sm:block lg:-right-10">
              <EventToast icon={RotateCcw} tone="warning" title="Avoir disponible" meta="AVO-2026-0001 · annule tout ou partie" />
            </div>
          </Reveal>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {POINTS.map((p) => (
              <li key={p.t} className="py-5">
                <p className="text-base font-semibold text-foreground">{p.t}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.d}</p>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  )
}
