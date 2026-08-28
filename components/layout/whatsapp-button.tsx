"use client"

/**
 * Bouton flottant WhatsApp.
 * Apparaît après un léger défilement pour ne pas gêner le hero.
 * Le numéro provient des paramètres du tenant courant (jamais de données
 * statiques) : il est transmis en prop depuis le layout. Sans numéro, le
 * bouton ne s'affiche pas.
 */

import { useState, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { toWhatsAppDigits } from "@/lib/phone"

/** Message pré-rempli par défaut (neutre, aucun nom de tenant). */
const DEFAULT_WHATSAPP_MESSAGE = "Bonjour, je souhaite obtenir des renseignements concernant mon véhicule."

function WhatsAppIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.66.15-.2.3-.76.96-.93 1.16-.17.2-.34.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.34.44-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.66-1.6-.9-2.19-.24-.57-.48-.5-.66-.5h-.57c-.2 0-.52.07-.79.37s-1.04 1.02-1.04 2.48 1.06 2.88 1.21 3.08c.15.2 2.09 3.2 5.07 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.24-.69.24-1.28.17-1.41-.07-.13-.27-.2-.57-.35ZM12.04 21.5h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.56.93.95-3.47-.22-.36a9.38 9.38 0 0 1-1.44-5.02c0-5.19 4.23-9.41 9.43-9.41 2.52 0 4.88.98 6.66 2.76a9.35 9.35 0 0 1 2.76 6.66c0 5.19-4.23 9.42-9.41 9.42Zm8.02-17.44A11.32 11.32 0 0 0 12.04.75C5.8.75.72 5.83.72 12.07c0 1.99.52 3.94 1.51 5.66L.63 23.25l5.65-1.48a11.3 11.3 0 0 0 5.42 1.38h.01c6.24 0 11.32-5.08 11.32-11.32 0-3.02-1.18-5.87-3.32-8.01Z" />
    </svg>
  )
}

type WhatsAppButtonProps = {
  /** Numéro du tenant (format libre) ; nettoyé en digits pour wa.me. */
  phone?: string | null
  /** Message pré-rempli optionnel. */
  message?: string
}

export function WhatsAppButton({ phone, message }: WhatsAppButtonProps = {}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // N'affiche rien si le tenant n'a pas renseigné de numéro valide.
  // Normalisation FR : « 06 99 90 13 03 » → « 33699901303 » (format wa.me).
  const digits = toWhatsAppDigits(phone)
  if (!digits) return null
  const text = (message ?? DEFAULT_WHATSAPP_MESSAGE).trim()
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`

  return (
    <AnimatePresence>
      {visible && (
        <motion.a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contacter sur WhatsApp"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          // Zone tactile 56px (>44px). Respect des safe-areas mobiles (encoche
          // / barre gestuelle) via les insets env(). z-40 : sous les overlays
          // critiques, au-dessus du contenu.
          style={{
            bottom: "calc(1.25rem + env(safe-area-inset-bottom))",
            right: "calc(1.25rem + env(safe-area-inset-right))",
          }}
          className="fixed z-40 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl shadow-black/40"
        >
          <WhatsAppIcon className="size-7" />
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#25D366] opacity-20" />
        </motion.a>
      )}
    </AnimatePresence>
  )
}
