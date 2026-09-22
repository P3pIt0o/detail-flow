"use client"

import type React from "react"
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Building2, Check, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { normalizeSlug } from "@/lib/tenant-shared"
import { loadOnboarding, type OnboardingPayload } from "@/lib/onboarding/shared"
import { checkSlugAvailability, createWorkspace, type SlugCheck } from "./actions"

/**
 * Formulaire de création d'espace (post-inscription self-service).
 * - Le nom dérive automatiquement l'adresse (slug), tant que l'utilisateur ne
 *   l'a pas modifiée manuellement.
 * - Disponibilité de l'adresse vérifiée en direct (debounce), sans bloquer.
 * - La soumission délègue au Server Action `createWorkspace` (idempotent).
 */
export function CreateWorkspaceForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(createWorkspace, {} as { error?: string })

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [check, setCheck] = useState<SlugCheck | null>(null)
  const [checking, startCheck] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Réponses de l'onboarding /demarrer (pré-remplissage + champs cachés).
  const [onboarding, setOnboarding] = useState<OnboardingPayload | null>(null)

  // Au montage : reprendre les réponses de l'onboarding si elles existent.
  useEffect(() => {
    const data = loadOnboarding()
    if (!data) return
    setOnboarding(data)
    if (data.companyName) setName(data.companyName)
  }, [])

  // Slug dérivé du nom tant que l'utilisateur ne l'a pas édité manuellement.
  useEffect(() => {
    if (!slugEdited) setSlug(normalizeSlug(name))
  }, [name, slugEdited])

  // Vérification de disponibilité (debounce 400 ms).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const current = slug
    if (!current) {
      setCheck(null)
      return
    }
    debounceRef.current = setTimeout(() => {
      startCheck(async () => {
        const result = await checkSlugAvailability(current)
        // Ignore les réponses obsolètes si le slug a changé entre-temps.
        setCheck((prev) => (result.slug === normalizeSlug(current) ? result : prev))
      })
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [slug])

  const rootHost = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? ""
    const clean = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "").replace(/^www\./, "")
    return clean ? `www.${clean}` : ""
  }, [])

  const feedback = slugFeedback(check, checking, slug)

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="size-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground text-balance">
            Créer mon espace
          </h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Dernière étape : donnez un nom à votre entreprise et choisissez l&apos;adresse de votre
            page de réservation.
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nom de l&apos;entreprise</Label>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Detailing Lyon"
              required
              autoFocus
              autoComplete="organization"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="slug">Adresse de votre page</Label>
            <Input
              id="slug"
              name="slug"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true)
                setSlug(normalizeSlug(e.target.value))
              }}
              placeholder="detailing-lyon"
              required
              minLength={3}
              maxLength={63}
              inputMode="url"
              autoComplete="off"
              aria-describedby="slug-help"
            />
            <p id="slug-help" className="text-xs text-muted-foreground">
              {rootHost ? (
                <>
                  Votre page : <span className="font-mono text-foreground">{rootHost}/?tenant={slug || "…"}</span>
                </>
              ) : (
                <>
                  Votre page : <span className="font-mono text-foreground">/?tenant={slug || "…"}</span>
                </>
              )}
            </p>
            {feedback && (
              <p
                className={`flex items-center gap-1.5 text-xs ${feedback.tone === "ok" ? "text-primary" : feedback.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
                role="status"
              >
                {feedback.icon}
                {feedback.message}
              </p>
            )}
          </div>

          {/* Champs transmis depuis l'onboarding /demarrer (colonnes existantes
              + intention de routage). Absents si l'utilisateur arrive en direct. */}
          {onboarding && (
            <>
              <input type="hidden" name="intent" value={onboarding.intent} />
              {onboarding.city && <input type="hidden" name="city" value={onboarding.city} />}
              {onboarding.country && <input type="hidden" name="country" value={onboarding.country} />}
              {onboarding.phone && <input type="hidden" name="phone" value={onboarding.phone} />}
              {onboarding.websiteUrl && <input type="hidden" name="websiteUrl" value={onboarding.websiteUrl} />}
            </>
          )}

          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={pending || check?.available === false} className="w-full">
            {pending ? "Création en cours..." : "Créer mon espace"}
          </Button>
        </form>
      </div>
    </main>
  )
}

/** Traduit l'état de vérification du slug en message + icône + ton. */
function slugFeedback(
  check: SlugCheck | null,
  checking: boolean,
  slug: string,
): { message: string; tone: "ok" | "error" | "muted"; icon: React.ReactNode } | null {
  if (!slug) return null
  if (checking && (!check || check.slug !== slug)) {
    return {
      message: "Vérification de la disponibilité...",
      tone: "muted",
      icon: <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />,
    }
  }
  if (!check || check.slug !== slug) return null
  switch (check.reason) {
    case "ok":
      return { message: "Adresse disponible.", tone: "ok", icon: <Check className="size-3.5" aria-hidden="true" /> }
    case "taken":
      return { message: "Adresse déjà prise.", tone: "error", icon: <X className="size-3.5" aria-hidden="true" /> }
    case "reserved":
      return { message: "Adresse réservée.", tone: "error", icon: <X className="size-3.5" aria-hidden="true" /> }
    case "invalid":
      return {
        message: "3 à 63 caractères : lettres, chiffres et tirets.",
        tone: "error",
        icon: <X className="size-3.5" aria-hidden="true" />,
      }
    default:
      return null
  }
}
