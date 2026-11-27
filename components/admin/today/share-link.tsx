import { MessageCircle } from "lucide-react"
import { CopyLinkButton, QrCodeButton } from "@/components/admin/booking-hub/link-actions"
import { btnOutline } from "@/components/admin/booking-hub/styles"

/** « Partager votre lien » : copier, QR code, WhatsApp. L'URL est résolue côté serveur. */
export function ShareLink({ url }: { url: string }) {
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Réservez en ligne : ${url}`)}`
  return (
    <div className="flex flex-col gap-2">
      <p className="truncate text-sm text-muted-foreground" title={url}>
        {url.replace(/^https?:\/\//, "")}
      </p>
      <CopyLinkButton url={url} label="Copier mon lien" primary />
      <div className="grid grid-cols-2 gap-2">
        <QrCodeButton url={url} />
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={btnOutline}>
          <MessageCircle className="size-5" aria-hidden="true" />
          WhatsApp
        </a>
      </div>
    </div>
  )
}
