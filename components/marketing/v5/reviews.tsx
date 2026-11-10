import { TRUSTPILOT } from "@/components/marketing/v4/trustpilot"
import { REVIEWS, UI } from "./data"

export function Reviews() {
  const [featured, ...others] = REVIEWS
  return (
    <section className="bg-[#16181d] py-[72px] text-[#f7f5f0]">
      <div className={UI.wrap}>
        <figure className="m-0 max-w-[900px]">
          <blockquote className="m-0 text-[clamp(24px,3vw,34px)] font-medium leading-[1.3] tracking-[-0.01em]">
            {featured.quote}
          </blockquote>
          <figcaption className="mt-5 text-[15px] text-[#b7b2a7]">
            <strong className="text-[#f7f5f0]">{featured.author}</strong>
            {featured.context}
          </figcaption>
        </figure>
        <div className="mt-14 grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-x-14 gap-y-8">
          {others.map((r) => (
            <figure key={r.author} className="m-0 border-t border-[#3a3d44] pt-5">
              <blockquote className="m-0 text-[17px] leading-[1.6]">{r.quote}</blockquote>
              <figcaption className="mt-3 text-sm text-[#b7b2a7]">
                <strong className="text-[#f7f5f0]">{r.author}</strong>
                {r.context}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="m-0 mt-10 text-[15px]">
          <a
            href={TRUSTPILOT.reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#f7f5f0] underline underline-offset-[3px]"
          >
            Lire tous les avis sur Trustpilot
          </a>
        </p>
      </div>
    </section>
  )
}
