"use client"

import { useEffect } from "react"
import { embedMessageName, type EmbedMessageType } from "@/lib/embed"

/**
 * Pont de communication iframe → site parent (postMessage).
 *
 * SÉCURITÉ / VIE PRIVÉE :
 *  - On n'émet QUE des signaux d'interface (`ready`, `resize`, `booking-*`,
 *    `close`) et, pour la confirmation, la RÉFÉRENCE publique de réservation
 *    (code aléatoire non nominatif). Jamais de nom/email/téléphone/adresse.
 *  - La cible est `*` : le widget est PUBLIC et destiné à être intégré sur des
 *    domaines clients quelconques. Comme aucune donnée sensible n'est diffusée,
 *    c'est sans risque. À l'inverse, on IGNORE tout message ENTRANT dont on ne
 *    reconnaît pas le format (défense en profondeur, cf. script widget).
 *  - `resize` permet au script parent d'ajuster la hauteur de l'iframe inline
 *    (aucun layout shift, pas d'énorme hauteur fixe).
 */
export function postEmbedMessage(type: EmbedMessageType, payload: Record<string, unknown> = {}): void {
  if (typeof window === "undefined" || window.parent === window) return
  try {
    window.parent.postMessage({ type: embedMessageName(type), ...payload }, "*")
  } catch {
    // Cross-origin/politique du navigateur : non bloquant pour le tunnel.
  }
}

type Props = {
  /** Émet `booking-started` au montage (ex. entrée dans le tunnel). */
  started?: boolean
  /** Émet `booking-completed` au montage (page de confirmation). */
  completed?: boolean
  /** Référence publique jointe à `booking-completed` (jamais de PII). */
  reference?: string | null
}

/**
 * Composant invisible : émet `ready` au montage, suit la hauteur du document
 * (ResizeObserver) pour l'auto-resize inline, et émet éventuellement
 * `booking-started` / `booking-completed`. À monter une fois par page embed.
 */
export function EmbedBridge({ started, completed, reference }: Props) {
  useEffect(() => {
    postEmbedMessage("ready")
    if (started) postEmbedMessage("booking-started")
    if (completed) postEmbedMessage("booking-completed", reference ? { reference } : {})

    // Auto-resize : on observe la hauteur réelle du contenu et on la transmet.
    const emitHeight = () => {
      const height = Math.ceil(
        Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0,
        ),
      )
      if (height > 0) postEmbedMessage("resize", { height })
    }

    emitHeight()
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => emitHeight())
      observer.observe(document.documentElement)
      if (document.body) observer.observe(document.body)
    }
    window.addEventListener("load", emitHeight)
    return () => {
      observer?.disconnect()
      window.removeEventListener("load", emitHeight)
    }
  }, [started, completed, reference])

  return null
}
