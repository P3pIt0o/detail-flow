import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { SceneContent, type Scene } from "./scenes"

/**
 * Banc de capture (interne, non indexé) : rend les VRAIS composants produit
 * avec des données de démonstration, pour générer les images fidèles du site
 * vitrine. Aucune donnée client réelle, aucune authentification, aucune écriture
 * en base. La page se superpose en plein écran pour exclure l'en-tête/pied de
 * la vitrine des captures.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

const SCENES: Scene[] = ["booking", "quote", "calendar", "invoice", "dashboard"]

export function generateStaticParams() {
  return SCENES.map((scene) => ({ scene }))
}

export default async function CapturePage({
  params,
}: {
  params: Promise<{ scene: string }>
}) {
  const { scene } = await params
  if (!SCENES.includes(scene as Scene)) notFound()

  return (
    <div className="fixed inset-0 z-[999] overflow-auto bg-background">
      {/* Masque le panneau de navigation dev pour des captures propres. */}
      <style>{`button[aria-label="Ouvrir le panneau de navigation dev"]{display:none!important}`}</style>
      <div data-capture-root className="mx-auto w-full max-w-5xl px-8 py-10">
        {/* Suspense requis : certaines scènes rendent des composants produit
            qui lisent useSearchParams (ex. tenant), ce qui exige une frontière
            de suspense lors du prérendu statique de cette page. */}
        <Suspense fallback={null}>
          <SceneContent scene={scene as Scene} />
        </Suspense>
      </div>
    </div>
  )
}
