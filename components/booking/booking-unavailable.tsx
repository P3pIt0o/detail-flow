export function BookingUnavailable({ embed = false }: { embed?: boolean }) {
  return (
    <section className={embed ? "bg-background py-6" : "bg-background py-16 md:py-24"}>
      <div className="mx-auto max-w-xl px-4">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-xl font-semibold text-card-foreground text-balance">
            Réservation en ligne indisponible
          </h1>
          <p className="mt-3 text-pretty text-muted-foreground leading-relaxed">
            Les réservations en ligne ne sont pas disponibles actuellement pour cet établissement.
          </p>
        </div>
      </div>
    </section>
  )
}
