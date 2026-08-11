import type { Metadata } from "next"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { getPublicContact } from "@/lib/public-contact"

export const metadata: Metadata = {
  title: "Demande envoyée",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function DemandeConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams
  const contact = await getPublicContact()

  return (
    <section className="min-h-[70vh] bg-background py-16">
      <div className="mx-auto max-w-2xl px-4">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 text-balance font-serif text-3xl font-bold text-foreground">Demande envoyée</h1>
          <p className="mt-3 max-w-md text-pretty text-muted-foreground">
            Merci ! Votre demande personnalisée a bien été transmise. Nous l&apos;étudions et vous ferons parvenir une
            proposition sur mesure
            {email ? (
              <>
                {" "}
                à <span className="text-foreground">{email}</span>
              </>
            ) : (
              " par email"
            )}
            .
          </p>
        </div>

        <div className="mt-8 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>
            Vous recevrez un email dès que votre proposition sera prête. Elle contiendra le détail de la prestation et
            son tarif, ainsi qu&apos;un lien pour l&apos;accepter ou la refuser en un clic.
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Retour à l&apos;accueil
          </Link>
          {contact.phone && (
            <a
              href={`tel:${contact.phoneRaw ?? contact.phone}`}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Une question ? Appelez-nous
            </a>
          )}
        </div>
      </div>
    </section>
  )
}
