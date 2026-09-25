import Image from "next/image"
import { marketing } from "@/config/marketing"
import { Container } from "./primitives"
import { TrustpilotProof } from "./trustpilot"

/**
 * Preuve sociale : uniquement les entreprises ayant CONSENTI (`consent: true`
 * dans `config/marketing.ts`). Aucun chiffre, aucun témoignage inventé.
 */
export function Partners() {
  const { companies, fallbackNote } = marketing.betaPartners
  const citable = companies.filter((c) => c.consent)

  return (
    <section aria-labelledby="partners-title" className="py-20 sm:py-24">
      <Container className="flex flex-col items-center gap-8 text-center">
        <h2 id="partners-title" className="max-w-md text-balance text-sm font-medium text-muted-foreground">
          Pensé et testé avec des professionnels du detailing.
        </h2>
        {citable.length > 0 ? (
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {citable.map((c) => (
              <li key={c.name} className="flex items-center gap-3">
                <Image
                  src={c.logo || "/placeholder.svg"}
                  alt=""
                  width={40}
                  height={40}
                  className="size-10 rounded-full object-cover ring-1 ring-border grayscale transition duration-300 hover:grayscale-0"
                />
                <span className="text-sm font-medium text-foreground/80">{c.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{fallbackNote}</p>
        )}
        <div className="mt-2 flex w-full max-w-md justify-center">
          <TrustpilotProof variant="full" />
        </div>
      </Container>
    </section>
  )
}
