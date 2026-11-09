import { CalendarCheck, MapPin, MessageCircle, Phone, Star, UserPlus, type LucideIcon } from "lucide-react"
import { contrastText, type CardAction, type CardActionKey, type DigitalCardSettings } from "@/lib/digital-card"
import { TiltCard } from "./tilt-card"

/** Page publique `/carte` (L45) : carte 3D + boutons de contact, plein écran, sans navigation. */

const ICONS: Record<CardActionKey, LucideIcon> = {
  book: CalendarCheck,
  call: Phone,
  whatsapp: MessageCircle,
  directions: MapPin,
  review: Star,
  contact: UserPlus,
}

export function DigitalCardView(props: {
  name: string
  line: string | null
  logoSrc: string | null
  card: DigitalCardSettings
  actions: CardAction[]
}) {
  const { card } = props
  return (
    <main
      className="flex min-h-dvh flex-col items-center gap-4 px-5 py-6 text-slate-100 lg:flex-row lg:justify-center lg:gap-16 lg:p-20"
      style={{ background: "radial-gradient(120% 80% at 50% 0%, #1a2233 0%, #0f1218 60%)" }}
    >
      <h1 className="sr-only">{props.name}</h1>
      <div className="w-full max-w-[346px] lg:max-w-[440px]">
        <TiltCard
          name={props.name}
          line={props.line}
          logoSrc={props.logoSrc}
          background={card.background}
          accent={card.accent}
          cardStyle={card.style}
        />
      </div>
      <nav aria-label="Contact" className="flex w-full max-w-[346px] flex-col gap-2.5">
        {props.actions.map((a, i) => {
          const Icon = ICONS[a.key]
          const primary = i === 0 && a.key === "book"
          return (
            <a
              key={a.key}
              href={a.href}
              {...(a.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className={
                primary
                  ? "flex h-12 items-center justify-center gap-2.5 rounded-xl text-[15px] font-semibold transition-opacity hover:opacity-90"
                  : "flex h-12 items-center justify-center gap-2.5 rounded-xl border border-[#262d3a] bg-[#161b24] text-[15px] font-semibold text-slate-100 transition-colors hover:bg-[#1d2430]"
              }
              style={primary ? { background: card.accent, color: contrastText(card.accent) } : undefined}
            >
              <Icon className="size-5" aria-hidden="true" />
              {a.label}
            </a>
          )
        })}
      </nav>
    </main>
  )
}
