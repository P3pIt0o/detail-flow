import { FAQ_V5, UI } from "./data"

export function Faq() {
  return (
    <section id="faq" className="pb-20 pt-6">
      <div className={`${UI.wrap} grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-x-16 gap-y-6`}>
        <h2 className={UI.h2}>Questions fréquentes</h2>
        <div className="border-b border-[#e2ddd2]">
          {FAQ_V5.map((item) => (
            <details key={item.q} className="border-t border-[#e2ddd2] py-[18px]">
              <summary className="cursor-pointer list-none text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
              </summary>
              <p className={`m-0 mt-2.5 text-base leading-[1.6] ${UI.muted}`}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
