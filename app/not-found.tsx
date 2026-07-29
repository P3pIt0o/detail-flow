import { CtaButton } from "@/components/ui/cta-button"

export default function NotFound() {
  return (
    <div className="flex min-h-[70svh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-primary">Erreur 404</p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Page introuvable</h1>
      <p className="mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
        Désolé, la page que vous recherchez n&apos;existe pas ou a été déplacée.
      </p>
      <div className="mt-8">
        <CtaButton href="/" size="lg" showArrow>
          Retour à l&apos;accueil
        </CtaButton>
      </div>
    </div>
  )
}
