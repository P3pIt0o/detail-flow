"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  buildDraftKey,
  serializeDraft,
  parseDraft,
  isDraftMeaningful,
  DRAFT_MAX_AGE_MS,
  type BookingDraft,
} from "@/lib/booking/draft"

type DraftState = Omit<BookingDraft, "v" | "savedAt">

/**
 * Détection non bloquante de la disponibilité d'un Storage. Certains
 * navigateurs (mode privé, quotas, réglages) lèvent une exception : on ne doit
 * jamais casser le tunnel pour autant (fonctionnement dégradé en mémoire).
 */
function storageAvailable(kind: "sessionStorage" | "localStorage"): boolean {
  try {
    const s = window[kind]
    const k = "__df_test__"
    s.setItem(k, "1")
    s.removeItem(k)
    return true
  } catch {
    return false
  }
}

function readRaw(kind: "sessionStorage" | "localStorage", key: string): string | null {
  try {
    return window[kind].getItem(key)
  } catch {
    return null
  }
}

function writeRaw(kind: "sessionStorage" | "localStorage", key: string, value: string): void {
  try {
    window[kind].setItem(key, value)
  } catch {
    /* quota / indisponible : on ignore silencieusement */
  }
}

function removeRaw(kind: "sessionStorage" | "localStorage", key: string): void {
  try {
    window[kind].removeItem(key)
  } catch {
    /* ignore */
  }
}

const REMEMBER_SUFFIX = ":remember"

export type UseBookingDraft = {
  /** Brouillon restauré au montage (proposition de reprise), sinon null. */
  restored: BookingDraft | null
  /** Vrai tant que la restauration initiale n'a pas eu lieu (garde anti-écrasement). */
  hydrated: boolean
  /** Consentement « mémoriser 24 h sur cet appareil » (persistant). */
  remember: boolean
  setRemember: (value: boolean) => void
  /** Enregistre l'état courant (appelé à chaque changement, après hydratation). */
  save: (state: DraftState) => void
  /** Efface le brouillon (confirmation réelle, abandon explicite, expiration). */
  clear: () => void
}

/**
 * Sauvegarde/reprise du brouillon de réservation (LOT B, point 3).
 * - sessionStorage par défaut (auto-save, vidé à la fermeture de l'onglet).
 * - localStorage avec TTL 24 h UNIQUEMENT sur consentement explicite.
 * - clés isolées par tenant + version de formulaire.
 * - jamais d'écrasement du brouillon restauré par les valeurs vides du montage
 *   (le hook expose `hydrated` ; l'appelant ne sauvegarde qu'ensuite).
 */
export function useBookingDraft(tenant: string | null): UseBookingDraft {
  const key = buildDraftKey(tenant)
  const rememberKey = key + REMEMBER_SUFFIX

  const [restored, setRestored] = useState<BookingDraft | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [remember, setRememberState] = useState(false)

  // Miroir mémoire : garantit un fonctionnement même sans Storage.
  const memoryRef = useRef<string | null>(null)
  const canSession = useRef(false)
  const canLocal = useRef(false)

  // Restauration initiale (une seule fois, côté client).
  useEffect(() => {
    canSession.current = storageAvailable("sessionStorage")
    canLocal.current = storageAvailable("localStorage")

    // Consentement 24 h mémorisé précédemment ?
    const rememberRaw = canLocal.current ? readRaw("localStorage", rememberKey) : null
    const rememberedConsent = rememberRaw === "1"
    setRememberState(rememberedConsent)

    // On lit d'abord le local (24 h, TTL appliqué), sinon la session.
    let draft: BookingDraft | null = null
    if (rememberedConsent && canLocal.current) {
      draft = parseDraft(readRaw("localStorage", key), { maxAgeMs: DRAFT_MAX_AGE_MS })
      // Brouillon expiré : nettoyage.
      if (!draft) removeRaw("localStorage", key)
    }
    if (!draft && canSession.current) {
      draft = parseDraft(readRaw("sessionStorage", key))
    }

    if (isDraftMeaningful(draft)) {
      setRestored(draft)
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rememberKey])

  const save = useCallback(
    (state: DraftState) => {
      const raw = serializeDraft(state)
      memoryRef.current = raw
      if (remember && canLocal.current) {
        writeRaw("localStorage", key, raw)
        // On évite le doublon session pour ne pas ressusciter un brouillon effacé.
        if (canSession.current) removeRaw("sessionStorage", key)
      } else if (canSession.current) {
        writeRaw("sessionStorage", key, raw)
      }
    },
    [key, remember],
  )

  const clear = useCallback(() => {
    memoryRef.current = null
    if (canSession.current) removeRaw("sessionStorage", key)
    if (canLocal.current) removeRaw("localStorage", key)
    setRestored(null)
  }, [key])

  const setRemember = useCallback(
    (value: boolean) => {
      setRememberState(value)
      if (!canLocal.current) return
      if (value) {
        writeRaw("localStorage", rememberKey, "1")
        // Migre le brouillon courant (mémoire ou session) vers le local.
        const current = memoryRef.current ?? (canSession.current ? readRaw("sessionStorage", key) : null)
        if (current) {
          writeRaw("localStorage", key, current)
          if (canSession.current) removeRaw("sessionStorage", key)
        }
      } else {
        // Retrait du consentement : on repasse en session et on purge le local.
        removeRaw("localStorage", rememberKey)
        const current = memoryRef.current ?? readRaw("localStorage", key)
        removeRaw("localStorage", key)
        if (current && canSession.current) writeRaw("sessionStorage", key, current)
      }
    },
    [key, rememberKey],
  )

  return { restored, hydrated, remember, setRemember, save, clear }
}
