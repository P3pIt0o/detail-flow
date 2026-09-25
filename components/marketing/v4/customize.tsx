"use client"

import { useState, type CSSProperties } from "react"
import { Check, Eye, ImageIcon, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { DEMO_SERVICES, formatEuro } from "./demo-data"

const SWATCHES = [
  { name: "Bleu", value: "oklch(0.62 0.2 255)", fg: "oklch(0.99 0.005 260)" },
  { name: "Or", value: "oklch(0.8 0.15 85)", fg: "oklch(0.2 0.03 85)" },
  { name: "Rouge", value: "oklch(0.62 0.22 27)", fg: "oklch(0.99 0.005 260)" },
  { name: "Émeraude", value: "oklch(0.7 0.15 165)", fg: "oklch(0.2 0.04 165)" },
]

const SECTIONS = [
  { label: "Présentation", on: true },
  { label: "Prestations", on: true },
  { label: "Déroulement", on: true },
  { label: "Galerie", on: true },
  { label: "Avis", on: true },
  { label: "Demandes personnalisées", on: false },
  { label: "Contact", on: true },
]

export function CustomizeDemo() {
  const [color, setColor] = useState(0)
  const [title, setTitle] = useState("Le soin de votre véhicule, dans les règles de l'art.")
  const [sections, setSections] = useState(SECTIONS)
  const swatch = SWATCHES[color]
  const accentStyle = { "--primary": swatch.value, "--primary-foreground": swatch.fg } as CSSProperties

  return (
    <div className="df-product grid overflow-hidden rounded-3xl border border-border bg-background text-foreground shadow-[0_40px_120px_-40px_oklch(0.25_0.08_260/0.55)] lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="flex flex-col gap-6 border-b border-border bg-card p-5 sm:p-6 lg:border-b-0 lg:border-r">
        <div>
          <p className="text-[15px] font-semibold">Mon site</p>
          <p className="text-[12px] text-muted-foreground">Les modifications sont visibles immédiatement.</p>
        </div>

        <div>
          <p className="mb-2 text-[12px] font-medium text-muted-foreground">Logo</p>
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-3">
            <span
              style={accentStyle}
              className="flex size-9 items-center justify-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground transition-colors"
            >
              AL
            </span>
            <span className="flex-1 text-[12px] text-muted-foreground">logo-atelier.png</span>
            <Upload className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-[12px] font-medium text-muted-foreground">Couleur principale</legend>
          <div className="flex gap-2">
            {SWATCHES.map((s, i) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setColor(i)}
                aria-pressed={color === i}
                aria-label={`Couleur ${s.name}`}
                className={cn(
                  "flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  color === i && "ring-2 ring-foreground",
                )}
                style={{ backgroundColor: s.value, color: s.fg }}
              >
                {color === i && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="df-demo-hero" className="mb-2 block text-[12px] font-medium text-muted-foreground">
            Titre de la page d&apos;accueil
          </label>
          <input
            id="df-demo-hero"
            value={title}
            maxLength={70}
            onChange={(e) => setTitle(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-[12px] font-medium text-muted-foreground">Sections affichées</legend>
          <ul className="flex flex-col gap-1">
            {sections.map((s, i) => (
              <li key={s.label}>
                <label className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-muted">
                  {s.label}
                  <input
                    type="checkbox"
                    checked={s.on}
                    onChange={() => setSections((all) => all.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    style={accentStyle}
                    className={cn(
                      "relative h-5 w-9 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                      s.on ? "bg-primary" : "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-4 rounded-full bg-foreground transition-transform",
                        s.on ? "translate-x-4" : "translate-x-0.5",
                      )}
                    />
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </div>

      <div style={accentStyle} className="flex min-w-0 flex-col p-4 sm:p-6">
        <p className="mb-3 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <Eye className="size-3.5" aria-hidden="true" />
          Aperçu en direct
        </p>
        <div className="flex-1 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="flex items-center gap-2 text-[12px] font-semibold">
              <span className="flex size-5 items-center justify-center rounded bg-primary text-[8px] font-bold text-primary-foreground">
                AL
              </span>
              Atelier Lumière
            </span>
            <span className="rounded-md bg-primary px-2.5 py-1 text-[10.5px] font-semibold text-primary-foreground transition-colors">
              Réserver
            </span>
          </div>
          <div className="px-5 py-8">
            <p className="max-w-md text-balance text-xl font-semibold leading-tight tracking-tight">
              {title.trim() || "Votre titre ici"}
            </p>
            <span className="mt-4 inline-flex rounded-lg bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground transition-colors">
              Réserver en ligne
            </span>
          </div>
          <ul className="flex flex-wrap gap-1.5 border-t border-border px-5 py-4">
            {sections
              .filter((s) => s.on)
              .map((s) => (
                <li
                  key={s.label}
                  className="df-rise inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground"
                >
                  {s.label === "Galerie" && <ImageIcon className="size-3" aria-hidden="true" />}
                  {s.label}
                </li>
              ))}
          </ul>
          {sections.find((s) => s.label === "Prestations")?.on && (
            <div className="grid gap-2 px-5 pb-5 sm:grid-cols-3">
              {DEMO_SERVICES.slice(0, 3).map((s) => (
                <div key={s.id} className="df-rise rounded-xl border border-border bg-background p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-primary">{s.category}</p>
                  <p className="mt-1 text-[12px] font-semibold leading-snug">{s.name}</p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">dès {formatEuro(s.prices[0])}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
