import Image from "next/image"
import { CLIENT_LOGOS, UI } from "./data"

export function ClientLogos() {
  return (
    <section className="pb-6 pt-14">
      <div className={`${UI.wrap} flex flex-wrap items-center gap-x-12 gap-y-5`}>
        <p className={`m-0 text-[15px] font-semibold ${UI.muted}`}>Ils l&apos;utilisent tous les jours</p>
        {CLIENT_LOGOS.map((logo) => (
          <span key={logo.name} className="flex items-center gap-2.5 text-[15px] font-semibold">
            <Image src={logo.src} alt={logo.alt} width={36} height={36} className="size-9 rounded-md object-cover" />
            {logo.name}
          </span>
        ))}
      </div>
    </section>
  )
}
