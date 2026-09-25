import { Reveal } from "@/components/ui/reveal"
import { Container, SectionIntro } from "./primitives"
import { DEMO_SERVICES, DEMO_VEHICLE_TYPES, formatMinutes } from "./demo-data"

const VOCABULARY = [
  "Catégories de véhicules",
  "Durée variable",
  "Options et suppléments",
  "Polissage",
  "Céramique",
  "Intérieur",
  "Extérieur",
  "Prestations sur devis",
  "Plusieurs véhicules par réservation",
  "Temps de battement",
  "Atelier",
  "Déplacement",
  "Délai de prévenance",
]

export function Detailing() {
  const service = DEMO_SERVICES.find((s) => s.id === "polissage") ?? DEMO_SERVICES[0]
  const max = Math.max(...service.durations)

  return (
    <section aria-labelledby="detailing-title" className="df-ink bg-background py-24 text-foreground sm:py-32">
      <Container>
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="flex flex-col gap-8">
            <SectionIntro
              titleId="detailing-title"
              eyebrow="Conçu pour le detailing"
              title="Un SUV n'est pas une citadine. DetailFlow le sait."
              lead="Un outil de rendez-vous générique réserve un créneau. DetailFlow réserve le bon temps, au bon prix, pour le bon véhicule."
            />
            <ul className="flex flex-wrap gap-2">
              {VOCABULARY.map((v) => (
                <li key={v} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  {v}
                </li>
              ))}
            </ul>
          </div>

          <Reveal>
            <div className="rounded-3xl border border-border bg-card p-6 sm:p-8">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-base font-semibold">{service.name}</p>
                <p className="font-mono text-xs text-muted-foreground">durée · prix</p>
              </div>
              <ul className="mt-8 flex flex-col gap-5">
                {DEMO_VEHICLE_TYPES.map((v, i) => (
                  <li key={v.id}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{v.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatMinutes(service.durations[i])} · {service.prices[i]} €
                      </span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(service.durations[i] / max) * 100}%`, opacity: 0.55 + (i / 3) * 0.45 }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-8 border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">
                Chaque prestation a son prix et sa durée par catégorie. Le planning bloque exactement le temps nécessaire,
                options comprises.
              </p>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  )
}
