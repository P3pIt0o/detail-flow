"use client"

import { useState, useTransition } from "react"
import { Loader2, Star, Search, Check, AlertTriangle, PencilLine, ListChecks } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ReviewSettings } from "./review-settings"
import type { AdminReview } from "@/app/admin/(dashboard)/parametres/review-actions"
import {
  saveReviewsSource,
  searchGooglePlacesAction,
  type GooglePlacePreview,
} from "@/app/admin/(dashboard)/parametres/review-actions"
import type { ReviewsSource } from "@/lib/reviews/config"
import type { GooglePlaceCandidate } from "@/lib/reviews/google-places"

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
const cardClass = "rounded-2xl border border-border bg-card p-5"

const CONFIRM_MESSAGE = "Les avis de l'autre source seront masqués, mais ils ne seront pas supprimés."

type Props = {
  /** Avis manuels du tenant (gestion inchangée en mode manuel). */
  items: AdminReview[]
  /** Source actuellement enregistrée. */
  initialSource: ReviewsSource
  /** Aperçu de l'établissement Google enregistré (résolu côté serveur). */
  initialPreview: GooglePlacePreview | null
}

/** Étoiles + note numérique (lecture seule). */
function RatingLine({ rating, count }: { rating: number | null; count: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {typeof rating === "number" && <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>}
      <span className="flex items-center gap-0.5" aria-label={rating != null ? `Note : ${rating} sur 5` : undefined}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              "size-4",
              rating != null && i < Math.round(rating) ? "fill-primary text-primary" : "fill-muted text-muted",
            )}
            aria-hidden="true"
          />
        ))}
      </span>
      {typeof count === "number" && (
        <span className="text-sm text-muted-foreground">({count.toLocaleString("fr-FR")} avis)</span>
      )}
    </div>
  )
}

export function ReviewsSourceSettings({ items, initialSource, initialPreview }: Props) {
  // SOURCE ENREGISTRÉE (persistée en base).
  const [savedSource, setSavedSource] = useState<ReviewsSource>(initialSource)
  const [preview, setPreview] = useState<GooglePlacePreview | null>(initialPreview)

  // Transition en cours choisie par l'utilisateur (avant confirmation/sauvegarde).
  //  - "to-manual" : demande de retour en manuel (confirmation requise).
  //  - "to-google" : outil de recherche Google ouvert (passage OU modification).
  const [pendingSwitch, setPendingSwitch] = useState<null | "to-manual" | "to-google">(null)

  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Outil de recherche Google.
  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<GooglePlaceCandidate[]>([])
  const [selected, setSelected] = useState<GooglePlaceCandidate | null>(null)
  const [searched, setSearched] = useState(false)

  const googleActive = savedSource === "google"

  function resetTransient() {
    setPendingSwitch(null)
    setQuery("")
    setCandidates([])
    setSelected(null)
    setSearched(false)
    setError(null)
  }

  function chooseManual() {
    if (googleActive) {
      // Quitter Google → confirmation.
      setNotice(null)
      setError(null)
      setPendingSwitch("to-manual")
    }
  }

  function chooseGoogle() {
    // Ouvre l'outil (passage vers Google, ou modification si déjà Google).
    setNotice(null)
    setError(null)
    setSelected(null)
    setCandidates([])
    setSearched(false)
    setPendingSwitch("to-google")
  }

  function runSearch() {
    setError(null)
    const q = query.trim()
    if (!q) return
    startTransition(async () => {
      const res = await searchGooglePlacesAction(q)
      setSearched(true)
      if (!res.ok) {
        setError(res.error)
        setCandidates([])
        return
      }
      setCandidates(res.candidates)
    })
  }

  function confirmGoogle() {
    if (!selected) return
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const res = await saveReviewsSource("google", selected.placeId)
      if (!res.ok) {
        setError(res.error || "Erreur lors de l'enregistrement.")
        return
      }
      setSavedSource("google")
      setPreview({
        placeId: selected.placeId,
        name: selected.name,
        rating: selected.rating,
        userRatingCount: selected.userRatingCount,
        googleMapsUri: null,
      })
      resetTransient()
      setNotice("Source enregistrée : avis Google. Vos avis manuels sont conservés et masqués.")
    })
  }

  function confirmManual() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const res = await saveReviewsSource("manual", null)
      if (!res.ok) {
        setError(res.error || "Erreur lors de l'enregistrement.")
        return
      }
      setSavedSource("manual")
      resetTransient()
      setNotice("Source enregistrée : avis ajoutés manuellement. Vos avis manuels sont de nouveau affichés.")
    })
  }

  // Le sélecteur reflète la source enregistrée ; un "pending" ne change pas
  // l'état actif tant qu'il n'est pas confirmé.
  const manualSelected = !googleActive
  const showGoogleConfig = googleActive || pendingSwitch === "to-google"
  const showManualManagement = !googleActive && pendingSwitch !== "to-google"

  return (
    <div className="space-y-6">
      {/* -------------------- Sélecteur de source (exclusif) -------------------- */}
      <div className={cardClass}>
        <h2 className="mb-1 text-base font-semibold text-foreground">Source des avis</h2>
        <p className="mb-4 text-sm text-muted-foreground text-pretty">
          Choisissez la source affichée sur votre site. Une seule source est active à la fois ; l&apos;autre est
          masquée sans être supprimée.
        </p>

        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Source des avis">
          <button
            type="button"
            role="radio"
            aria-checked={manualSelected}
            disabled={pending}
            onClick={chooseManual}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors",
              manualSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-2 font-medium text-foreground">
              <ListChecks className="size-4" aria-hidden="true" /> Avis ajoutés manuellement
            </span>
            <span className="text-xs text-muted-foreground text-pretty">
              Gérez vous-même vos avis dans DetailFlow.
            </span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={googleActive}
            disabled={pending}
            onClick={chooseGoogle}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors",
              googleActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-2 font-medium text-foreground">
              <Star className="size-4" aria-hidden="true" /> Avis Google
            </span>
            <span className="text-xs text-muted-foreground text-pretty">
              Affichez les avis Google de votre établissement.
            </span>
          </button>
        </div>

        {notice && (
          <div
            className="mt-4 flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground"
            role="status"
          >
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-pretty">{notice}</span>
          </div>
        )}
        {error && (
          <div
            className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="text-pretty">{error}</span>
          </div>
        )}

        {/* Confirmation : retour aux avis manuels */}
        {pendingSwitch === "to-manual" && (
          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-sm text-foreground text-pretty">{CONFIRM_MESSAGE}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={confirmManual} disabled={pending}>
                {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Revenir aux avis manuels
              </Button>
              <Button type="button" variant="outline" onClick={resetTransient} disabled={pending}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* -------------------- Configuration Google -------------------- */}
      {showGoogleConfig && (
        <div className={cardClass}>
          {/* Aperçu de l'établissement enregistré (pas d'outil ouvert) */}
          {googleActive && preview && pendingSwitch !== "to-google" && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Établissement Google connecté</h3>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="font-medium text-foreground text-pretty">{preview.name}</p>
                <div className="mt-1">
                  <RatingLine rating={preview.rating} count={preview.userRatingCount} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={chooseGoogle} disabled={pending}>
                  <PencilLine className="mr-2 size-4" aria-hidden="true" /> Modifier l&apos;établissement
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPendingSwitch("to-manual")}
                  disabled={pending}
                >
                  Revenir aux avis manuels
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-pretty">
                Seul l&apos;identifiant de l&apos;établissement est enregistré. Les avis (texte, auteur, note) ne sont
                pas stockés : ils sont récupérés en direct depuis Google.
              </p>
            </div>
          )}

          {/* Outil de recherche / sélection */}
          {pendingSwitch === "to-google" && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Rechercher votre établissement</h3>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                      e.preventDefault()
                      runSearch()
                    }
                  }}
                  className={inputClass}
                  placeholder="Nom de l'établissement + ville (ex. Spirit ACS Lyon)"
                />
                <Button type="button" onClick={runSearch} disabled={pending || !query.trim()} className="shrink-0">
                  {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}
                  Rechercher
                </Button>
              </div>

              {searched && candidates.length === 0 && !error && (
                <p className="text-sm text-muted-foreground">Aucun établissement trouvé pour cette recherche.</p>
              )}

              {candidates.length > 0 && (
                <ul className="space-y-2">
                  {candidates.map((c) => (
                    <li key={c.placeId}>
                      <button
                        type="button"
                        onClick={() => setSelected(c)}
                        className={cn(
                          "flex w-full flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                          selected?.placeId === c.placeId
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-medium text-foreground">{c.name}</span>
                          {selected?.placeId === c.placeId && (
                            <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                          )}
                        </span>
                        {c.address && <span className="text-xs text-muted-foreground text-pretty">{c.address}</span>}
                        <RatingLine rating={c.rating} count={c.userRatingCount} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Confirmation du changement de source vers Google */}
              {selected && (
                <div className="rounded-xl border border-border bg-muted/40 p-4">
                  <p className="text-sm text-foreground text-pretty">{CONFIRM_MESSAGE}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" onClick={confirmGoogle} disabled={pending}>
                      {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
                      Utiliser cet établissement
                    </Button>
                    <Button type="button" variant="outline" onClick={resetTransient} disabled={pending}>
                      Annuler
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* -------------------- Gestion manuelle (inchangée) -------------------- */}
      {showManualManagement ? (
        <ReviewSettings items={items} />
      ) : (
        <div className={cardClass}>
          <p className="text-sm text-muted-foreground text-pretty">
            La gestion des avis manuels est masquée tant que la source « Avis Google » est active. Vos{" "}
            <strong className="text-foreground">{items.length}</strong> avis manuels sont conservés et réapparaîtront
            si vous revenez à cette source.
          </p>
        </div>
      )}
    </div>
  )
}
