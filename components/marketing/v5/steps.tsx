import { UI } from "./data"

const STEPS = [
  { title: "Entrez vos prestations", text: "Prix par type de véhicule, durées, horaires, zone de déplacement." },
  { title: "Partagez votre lien", text: "Dans votre bio Instagram, sur Google ou sur votre site." },
  { title: "Recevez des rendez-vous payés", text: "L'acompte est encaissé, le créneau bloqué, le client prévenu." },
]

export function Steps() {
  return (
    <section id="comment" className="py-14">
      <div className={UI.wrap}>
        <h2 className={UI.h2}>Prêt en une soirée</h2>
        <ol className="m-0 mt-8 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-8 p-0">
          {STEPS.map((step, i) => (
            <li key={step.title} className="border-t border-[#16181d] pt-4">
              <span className="text-[15px] font-bold text-[#1d5fd0]">{String(i + 1).padStart(2, "0")}</span>
              <p className="m-0 mt-2 text-[19px] font-bold">{step.title}</p>
              <p className={`m-0 mt-1.5 text-base leading-[1.55] ${UI.muted}`}>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
