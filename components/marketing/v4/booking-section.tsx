import { Container, SectionIntro } from "./primitives"
import { BookingDemo } from "./booking-demo"

export function BookingSection() {
  return (
    <section id="reservation" aria-labelledby="booking-title" className="scroll-mt-24 py-24 sm:py-32 lg:pb-44">
      <Container>
        <SectionIntro
          titleId="booking-title"
          eyebrow="Réservation en ligne"
          title="Vos clients choisissent. DetailFlow organise."
          lead="Véhicule, prestation, options : le prix et la durée se calculent seuls, et seuls les créneaux réellement libres sont proposés. Essayez le parcours."
        />
        <div className="mt-14 sm:mt-16">
          <BookingDemo />
        </div>
      </Container>
    </section>
  )
}
