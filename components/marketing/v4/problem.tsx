import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Globe,
  MessageCircle,
  Receipt,
  UserRound,
  type LucideIcon,
} from "lucide-react"
import { Reveal, StaggerGroup, StaggerItem } from "@/components/ui/reveal"
import { cn } from "@/lib/utils"
import { Container, DetailFlowMark, Eyebrow } from "./primitives"

const TOOLS: { name: string; use: string; icon: LucideIcon; offset: string }[] = [
  { name: "WhatsApp", use: "Demandes et confirmations", icon: MessageCircle, offset: "lg:-translate-x-6" },
  { name: "Google Agenda", use: "Rendez-vous notés à la main", icon: CalendarDays, offset: "lg:-translate-x-1" },
  { name: "Excel", use: "Fichier clients", icon: FileSpreadsheet, offset: "lg:-translate-x-8" },
  { name: "Stripe", use: "Liens de paiement isolés", icon: CreditCard, offset: "lg:-translate-x-2" },
  { name: "Site web", use: "Tarifs pas à jour", icon: Globe, offset: "lg:-translate-x-5" },
  { name: "Facturation", use: "Tout ressaisir", icon: FileText, offset: "lg:translate-x-0" },
]

const CHAIN: { label: string; event: string; icon: LucideIcon }[] = [
  { label: "Site", event: "Prestations à jour", icon: Globe },
  { label: "Réservation", event: "Nouvelle réservation", icon: CalendarPlus },
  { label: "Planning", event: "Planning mis à jour", icon: CalendarDays },
  { label: "Client", event: "Client ajouté", icon: UserRound },
  { label: "Paiement", event: "Acompte payé", icon: CreditCard },
  { label: "Facture", event: "Facture créée", icon: Receipt },
]

function Connectors() {
  const ys = [31, 105, 179, 253, 327, 401]
  return (
    <svg viewBox="0 0 200 432" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="df-conn" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.12" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {ys.map((y) => (
        <path
          key={y}
          d={`M0 ${y} C 110 ${y}, 90 216, 200 216`}
          fill="none"
          stroke="url(#df-conn)"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

export function Problem() {
  return (
    <section id="produit" aria-labelledby="problem-title" className="df-ink scroll-mt-24 bg-background text-foreground">
      <Container className="py-24 sm:py-32">
        <div className="flex max-w-2xl flex-col gap-4">
          <Eyebrow>Le problème</Eyebrow>
          <h2
            id="problem-title"
            className="text-balance text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl"
          >
            Votre activité ne devrait pas être répartie entre six outils.
          </h2>
          <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Un message WhatsApp, un créneau noté dans l&apos;agenda, un client dans un tableur, un paiement à part, une
            facture à refaire. Chaque réservation vous demande de tout recopier.
          </p>
        </div>

        <div className="mt-16 grid items-center gap-6 lg:grid-cols-[300px_minmax(120px,1fr)_minmax(0,420px)] lg:gap-0">
          <StaggerGroup className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-1 lg:gap-3">
            {TOOLS.map((t) => (
              <StaggerItem key={t.name}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-border bg-card/60 px-3.5 py-3 lg:h-[62px]",
                    t.offset,
                  )}
                >
                  <t.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.use}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>

          <div className="hidden h-[432px] text-primary lg:block">
            <Connectors />
          </div>
          <div className="flex justify-center text-primary lg:hidden" aria-hidden="true">
            <ArrowDown className="size-5" />
          </div>

          <Reveal>
            <div className="df-product relative rounded-3xl border border-primary/30 bg-card p-6 shadow-[0_0_0_6px_oklch(0.62_0.2_255/0.06),0_30px_80px_-30px_oklch(0.62_0.2_255/0.45)] sm:p-8">
              <div className="flex items-center gap-3">
                <DetailFlowMark className="size-10" />
                <div>
                  <p className="text-lg font-semibold tracking-tight">DetailFlow</p>
                  <p className="text-sm text-muted-foreground">Un seul endroit pour gérer votre activité.</p>
                </div>
              </div>
              <ul className="mt-6 grid grid-cols-2 gap-2 text-sm">
                {["Site internet", "Réservations", "Planning", "Clients & véhicules", "Paiements", "Factures & avoirs"].map(
                  (m) => (
                    <li key={m} className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
                      <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      <span className="truncate">{m}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </Reveal>
        </div>

        <div className="mt-28">
          <Reveal>
            <p className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              Du premier clic jusqu&apos;à la facture.
              <span className="text-muted-foreground"> Chaque étape alimente la suivante.</span>
            </p>
          </Reveal>

          <StaggerGroup className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:gap-0">
            {CHAIN.map((step, i) => (
              <StaggerItem key={step.label} className="relative">
                <div className="flex h-full items-center gap-3 rounded-2xl border border-border bg-card/60 p-4 lg:mr-3 lg:flex-col lg:items-start lg:gap-5 lg:p-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <step.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold">{step.label}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                      {step.event}
                    </p>
                  </div>
                </div>
                {i < CHAIN.length - 1 && (
                  <ArrowRight
                    className="absolute -right-1 top-1/2 hidden size-4 -translate-y-1/2 text-muted-foreground lg:block"
                    aria-hidden="true"
                  />
                )}
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Container>
    </section>
  )
}
