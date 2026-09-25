import { ArrowRight, Check } from "lucide-react"
import { Reveal } from "@/components/ui/reveal"
import { Container, DetailFlowMark, SectionIntro } from "./primitives"

const WITHOUT = [
  { tool: "WhatsApp", task: "Répondre à la demande de prix" },
  { tool: "Téléphone", task: "Rappeler pour fixer le jour" },
  { tool: "Agenda", task: "Noter le créneau à la main" },
  { tool: "Excel", task: "Ajouter le client et son véhicule" },
  { tool: "Stripe", task: "Envoyer un lien pour l'acompte" },
  { tool: "Factures", task: "Recopier la prestation et le prix" },
  { tool: "Site séparé", task: "Penser à mettre les tarifs à jour" },
]

const WITH = [
  "Le client réserve seul, prix et durée calculés",
  "Le créneau est bloqué dans le planning",
  "La fiche client et le véhicule sont créés",
  "L'acompte est réglé pendant la réservation",
  "La facture reprend tout, en un clic",
  "Le site affiche toujours vos vrais tarifs",
]

export function Compare() {
  return (
    <section aria-labelledby="compare-title" className="py-24 sm:py-32">
      <Container>
        <SectionIntro
          titleId="compare-title"
          eyebrow="Avant / après"
          title="Une réservation. Sept outils, ou un seul."
          align="center"
        />

        <div className="mt-14 grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-6">
          <div className="rounded-3xl border border-dashed border-border p-5 sm:p-6">
            <p className="mb-4 text-sm font-semibold text-muted-foreground">Sans DetailFlow</p>
            <ul className="flex flex-col gap-2">
              {WITHOUT.map((w) => (
                <li key={w.tool} className="flex items-center gap-3 rounded-xl bg-muted/70 px-3.5 py-2.5 text-sm">
                  <span className="w-24 shrink-0 font-mono text-[11px] text-muted-foreground">{w.tool}</span>
                  <span className="text-foreground/80">{w.task}</span>
                </li>
              ))}
            </ul>
          </div>

          <ArrowRight className="mx-auto size-5 rotate-90 text-muted-foreground lg:rotate-0" aria-hidden="true" />

          <Reveal>
            <div className="df-product rounded-3xl border border-border bg-background p-5 text-foreground shadow-[0_40px_100px_-40px_oklch(0.25_0.08_260/0.55)] sm:p-6">
              <p className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <DetailFlowMark className="size-5" />
                Avec DetailFlow
              </p>
              <ul className="flex flex-col gap-2">
                {WITH.map((w) => (
                  <li key={w} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                      <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                    </span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  )
}
