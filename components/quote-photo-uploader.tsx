"use client"

/**
 * QuotePhotoUploader — champ FACULTATIF d'ajout de photos à une demande de
 * devis, commun à tous les tenants (formulaire générique + Spirit ACS).
 *
 * Le composant est « sans tête » sur la logique : toute l'orchestration (état
 * par fichier, optimisation navigateur, envoi direct vers le Blob privé,
 * nouvelles tentatives) vit dans le hook `usePhotoUploads`, exposé pour que le
 * formulaire parent pilote la soumission en plusieurs phases sans jamais perdre
 * la demande. Le style reprend les jetons de thème → s'adapte au tenant.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import { ImagePlus, X, RefreshCw, CheckCircle2, AlertCircle, Loader2, FileWarning } from "lucide-react"
import {
  MAX_PHOTOS,
  MAX_TOTAL_BYTES,
  EXTENSION_BY_MIME,
  formatBytes,
  screenSelectedFile,
} from "@/lib/quote-photos/config"
import { optimizeImage, mapWithConcurrency } from "@/lib/quote-photos/image"
import { MAX_CONCURRENCY } from "@/lib/quote-photos/config"
import { associateQuotePhoto } from "@/app/(site)/demande/actions"

export type PhotoStatus = "ready" | "optimizing" | "uploading" | "done" | "error"

export interface PhotoItem {
  id: string
  file: File
  name: string
  size: number
  status: PhotoStatus
  /** 0–100, ou -1 pour un état indéterminé honnête (optimisation). */
  progress: number
  error?: string
  previewUrl?: string
  /** HEIC/HEIF : aperçu générique (pas de rendu <img> fiable). */
  isHeic: boolean
  pathname?: string
  width?: number | null
  height?: number | null
  attempts: number
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif"

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `p_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface UsePhotoUploads {
  items: PhotoItem[]
  count: number
  addFiles: (files: FileList | File[]) => void
  removeItem: (id: string) => void
  cancelItem: (id: string) => void
  retryItem: (id: string) => void
  reset: () => void
  /** Envoie les fichiers non encore associés. Renvoie le décompte succès/échec. */
  uploadAll: (grant: string, prefix: string) => Promise<{ ok: number; failed: number }>
  hasFailures: boolean
  liveMessage: string
}

/** Orchestration cliente des photos (état + optimisation + envoi + retries). */
export function usePhotoUploads(): UsePhotoUploads {
  const [items, setItems] = useState<PhotoItem[]>([])
  const [liveMessage, setLiveMessage] = useState("")
  // Miroir synchrone pour lire l'état courant dans les boucles d'envoi.
  const itemsRef = useRef<PhotoItem[]>([])
  itemsRef.current = items
  // AbortController par fichier : permet l'annulation d'un envoi en cours et
  // l'annulation globale au démontage / à la fermeture du formulaire.
  const controllers = useRef<Map<string, AbortController>>(new Map())
  // Coordonnées du dernier envoi (grant + préfixe) pour le bouton « Réessayer ».
  const lastRun = useRef<{ grant: string; prefix: string } | null>(null)

  const patch = useCallback((id: string, next: Partial<PhotoItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)))
  }, [])

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files)
    setItems((prev) => {
      const next = [...prev]
      let currentTotal = prev.reduce((s, it) => s + it.size, 0)
      const messages: string[] = []
      for (const file of incoming) {
        if (next.length >= MAX_PHOTOS) {
          messages.push(`Maximum ${MAX_PHOTOS} photos.`)
          break
        }
        // Doublon simple (même nom + taille) → ignoré silencieusement.
        if (next.some((it) => it.name === file.name && it.size === file.size)) continue

        const screen = screenSelectedFile({ name: file.name, type: file.type, size: file.size })
        if (!screen.ok) {
          next.push({
            id: uid(),
            file,
            name: file.name,
            size: file.size,
            status: "error",
            progress: 0,
            error: screen.reason,
            isHeic: false,
            attempts: 0,
          })
          continue
        }
        if (currentTotal + file.size > MAX_TOTAL_BYTES) {
          messages.push(`Taille totale maximale dépassée (${formatBytes(MAX_TOTAL_BYTES)}).`)
          break
        }
        currentTotal += file.size
        const isHeic = screen.passthrough
        next.push({
          id: uid(),
          file,
          name: file.name,
          size: file.size,
          status: "ready",
          progress: 0,
          isHeic,
          // Aperçu : ObjectURL pour les formats affichables, générique pour HEIC.
          previewUrl: isHeic ? undefined : URL.createObjectURL(file),
          attempts: 0,
        })
      }
      setLiveMessage(messages[0] ?? `${next.filter((i) => i.status !== "error").length} photo(s) prête(s) à l'envoi.`)
      return next
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((it) => it.id !== id)
    })
    setLiveMessage("Photo retirée.")
  }, [])

  const reset = useCallback(() => {
    setItems((prev) => {
      for (const it of prev) if (it.previewUrl) URL.revokeObjectURL(it.previewUrl)
      return []
    })
  }, [])

  // Annule tout envoi en cours + libère les ObjectURL au démontage (fermeture
  // du formulaire pendant l'envoi).
  useEffect(() => {
    const active = controllers.current
    return () => {
      for (const c of active.values()) c.abort()
      active.clear()
      for (const it of itemsRef.current) if (it.previewUrl) URL.revokeObjectURL(it.previewUrl)
    }
  }, [])

  /** Annule l'envoi en cours d'un fichier (sans le retirer de la liste). */
  const cancelItem = useCallback(
    (id: string) => {
      controllers.current.get(id)?.abort()
      controllers.current.delete(id)
      setLiveMessage("Envoi annulé.")
    },
    [],
  )

  /** Envoie UN fichier (optimisation → Blob → association) avec 2 retries. */
  const uploadOne = useCallback(
    async (item: PhotoItem, order: number, grant: string, prefix: string): Promise<boolean> => {
      // 1) Optimisation navigateur (ne lève jamais : renvoie l'original sinon).
      patch(item.id, { status: "optimizing", progress: -1, error: undefined })
      let optimized
      try {
        optimized = await optimizeImage(item.file)
      } catch {
        optimized = null
      }
      const payload = optimized?.blob ?? item.file
      const contentType = optimized?.contentType || item.file.type || "application/octet-stream"
      const ext =
        EXTENSION_BY_MIME[contentType] ?? (item.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "")
      const width = optimized?.width ?? null
      const height = optimized?.height ?? null

      // 2) Envoi direct vers le Blob PRIVÉ + association, avec re-essais.
      const maxAttempts = 3 // 1 essai + 2 nouvelles tentatives
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Un AbortController neuf par tentative ; enregistré pour l'annulation.
        const controller = new AbortController()
        controllers.current.set(item.id, controller)
        patch(item.id, { status: "uploading", progress: 0, attempts: attempt })
        try {
          const pathname = `${prefix}${uid()}.${ext || "jpg"}`
          const blob = await upload(pathname, payload, {
            access: "private",
            handleUploadUrl: "/api/quote-photos/upload",
            clientPayload: grant,
            contentType,
            abortSignal: controller.signal,
            // Multipart pour les gros fichiers : parties parallèles + reprise.
            multipart: payload.size > 6 * 1024 * 1024,
            onUploadProgress: (p) => patch(item.id, { progress: Math.round(p.percentage) }),
          })
          const assoc = await associateQuotePhoto({
            grant,
            pathname: blob.pathname,
            originalName: item.name,
            sortOrder: order,
            width,
            height,
          })
          if (!assoc.ok) {
            // Autorisation expirée : inutile de réessayer sans nouveau grant.
            if (assoc.code === "grant") {
              patch(item.id, { status: "error", error: assoc.error })
              return false
            }
            throw new Error(assoc.error)
          }
          controllers.current.delete(item.id)
          patch(item.id, { status: "done", progress: 100, pathname: blob.pathname, error: undefined })
          return true
        } catch (e) {
          // Annulation explicite par l'utilisateur : on ne réessaie pas.
          if (controller.signal.aborted) {
            controllers.current.delete(item.id)
            patch(item.id, { status: "error", error: "Envoi annulé." })
            return false
          }
          const msg = e instanceof Error ? e.message : "Échec de l'envoi."
          if (attempt < maxAttempts) {
            // Backoff court progressif.
            await delay(600 * attempt)
            continue
          }
          controllers.current.delete(item.id)
          patch(item.id, { status: "error", error: msg })
          return false
        }
      }
      return false
    },
    [patch],
  )

  const uploadAll = useCallback(
    async (grant: string, prefix: string): Promise<{ ok: number; failed: number }> => {
      // On (ré)envoie tout ce qui n'est pas déjà associé ni rejeté à la sélection.
      const pending = itemsRef.current.filter((it) => it.status !== "done" && !(it.status === "error" && !it.previewUrl && it.attempts === 0))
      if (!pending.length) {
        const failed = itemsRef.current.filter((it) => it.status === "error").length
        return { ok: itemsRef.current.filter((i) => i.status === "done").length, failed }
      }
      lastRun.current = { grant, prefix }
      setLiveMessage("Envoi des photos en cours…")
      const startIndex = itemsRef.current.filter((it) => it.status === "done").length
      const results = await mapWithConcurrency(pending, MAX_CONCURRENCY, (it, i) =>
        uploadOne(it, startIndex + i, grant, prefix),
      )
      const ok = results.filter(Boolean).length
      const failed = results.length - ok
      setLiveMessage(
        failed === 0
          ? "Toutes les photos ont été envoyées."
          : `${ok} photo(s) envoyée(s), ${failed} en échec. Vous pouvez réessayer.`,
      )
      return { ok, failed }
    },
    [uploadOne],
  )

  /** Réessaie l'envoi d'UN SEUL fichier en échec (bouton « Réessayer »). */
  const retryItem = useCallback(
    (id: string) => {
      const run = lastRun.current
      const item = itemsRef.current.find((it) => it.id === id)
      if (!run || !item || item.status === "uploading" || item.status === "done") return
      // Un fichier rejeté à la sélection (jamais envoyé) n'est pas ré-essayable.
      if (item.status === "error" && !item.previewUrl && item.attempts === 0) return
      const order = itemsRef.current.findIndex((it) => it.id === id)
      void uploadOne(item, order, run.grant, run.prefix)
    },
    [uploadOne],
  )

  const hasFailures = items.some((it) => it.status === "error")
  const count = items.filter((it) => it.status !== "error" || it.previewUrl).length

  return { items, count, addFiles, removeItem, cancelItem, retryItem, reset, uploadAll, hasFailures, liveMessage }
}

/* -------------------------------------------------------------------------- */
/*  Composant présentiel                                                       */
/* -------------------------------------------------------------------------- */

function StatusBadge({ item }: { item: PhotoItem }) {
  switch (item.status) {
    case "optimizing":
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Optimisation…
        </span>
      )
    case "uploading":
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          {item.progress >= 0 ? `Envoi ${item.progress}%` : "Envoi…"}
        </span>
      )
    case "done":
      return (
        <span className="flex items-center gap-1 text-xs text-primary">
          <CheckCircle2 className="size-3" aria-hidden="true" /> Envoyée
        </span>
      )
    case "error":
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3" aria-hidden="true" /> {item.error ?? "Erreur"}
        </span>
      )
    default:
      return <span className="text-xs text-muted-foreground">Prête</span>
  }
}

export function QuotePhotoUploader({
  uploader,
  disabled = false,
}: {
  uploader: UsePhotoUploads
  disabled?: boolean
}) {
  const { items, addFiles, removeItem, cancelItem, retryItem, liveMessage } = uploader
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-3">
      <div>
        <span id="quote-photos-label" className="text-sm font-medium text-foreground">
          Photos du véhicule — facultatif
        </span>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajoutez quelques photos pour nous aider à mieux évaluer l&apos;état du véhicule et votre demande.
        </p>
      </div>

      {/* Zone de dépôt / sélection — activable au clavier. */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby="quote-photos-label"
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-input bg-muted/30"
        } ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-primary/60"}`}
      >
        <ImagePlus className="size-6 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">Ajouter des photos</span>
        <span className="text-xs text-muted-foreground">
          Prendre une photo, choisir dans la galerie ou glisser-déposer • JPEG, PNG, WebP, AVIF, HEIC • max {MAX_PHOTOS}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          // `capture` laissé au navigateur : sur mobile il propose photo/galerie.
          className="sr-only"
          aria-label="Ajouter des photos du véhicule"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files)
            // Réinitialise pour permettre de re-sélectionner le même fichier.
            e.target.value = ""
          }}
        />
      </div>

      {/* Annonces d'état pour les lecteurs d'écran. */}
      <p aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="relative flex flex-col overflow-hidden rounded-lg border border-border bg-card"
            >
              <div className="relative flex aspect-square items-center justify-center bg-muted">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl || "/placeholder.svg"}
                    alt={`Aperçu de ${item.name}`}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 p-2 text-center text-muted-foreground">
                    <FileWarning className="size-6" aria-hidden="true" />
                    <span className="text-[10px] leading-tight">Aperçu indisponible (HEIC)</span>
                  </div>
                )}
                {/* Barre de progression réelle pendant l'envoi. */}
                {item.status === "uploading" && item.progress >= 0 && (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-background/40">
                    <div className="h-full bg-primary transition-[width]" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
                {!disabled && item.status !== "uploading" && item.status !== "optimizing" && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Retirer la photo ${item.name}`}
                    className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
                {/* Annulation d'un envoi en cours. */}
                {!disabled && item.status === "uploading" && (
                  <button
                    type="button"
                    onClick={() => cancelItem(item.id)}
                    aria-label={`Annuler l'envoi de la photo ${item.name}`}
                    className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-0.5 p-2">
                <span className="truncate text-xs font-medium text-foreground" title={item.name}>
                  {item.name}
                </span>
                <span className="text-[10px] text-muted-foreground">{formatBytes(item.size)}</span>
                <StatusBadge item={item} />
                {/* Réessai ciblé d'un fichier en échec (jamais un rejet de sélection). */}
                {!disabled && item.status === "error" && item.previewUrl && (
                  <button
                    type="button"
                    onClick={() => retryItem(item.id)}
                    aria-label={`Réessayer l'envoi de la photo ${item.name}`}
                    className="mt-1 inline-flex items-center gap-1 self-start rounded-md border border-input px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                  >
                    <RefreshCw className="size-3" aria-hidden="true" /> Réessayer
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Les photos sont utilisées uniquement pour étudier votre demande de devis et ne sont pas publiées sur le site.
      </p>
    </div>
  )
}
