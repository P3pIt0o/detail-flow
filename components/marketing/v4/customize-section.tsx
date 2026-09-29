import { Reveal } from "@/components/ui/reveal"
import { Container, SectionIntro } from "./primitives"
import { CustomizeDemo } from "./customize"

const EDITABLE = [
  "Logo et couleurs",
  "Texte d'accueil",
  "Présentation",
  "Prestations et images",
  "Galerie avant / après",
  "Avis clients",
  "Coordonnées",
  "Adresse de l'atelier",
  "Zone de déplacement",
]

export function CustomizeSection() {
  return (
    <section aria-labelledby="customize-title" className="border-t border-border bg-muted/40 py-24 sm:py-32">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:items-center lg:gap-14">
          <div className="flex flex-col gap-8">
            <SectionIntro
              titleId="customize-title"
              eyebrow="Administration"
              title="Vous gérez votre activité. Pas votre code."
              lead="Des réglages en français, des champs simples, un aperçu immédiat. Aucune compétence technique n'est nécessaire."
            />
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm text-foreground">
              {EDITABLE.map((e) => (
                <li key={e} className="flex items-center gap-2">
                  <span className="size-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  {e}
                </li>
              ))}
            </ul>
          </div>
          <Reveal>
            <CustomizeDemo />
          </Reveal>
        </div>
      </Container>
    </section>
  )
}
