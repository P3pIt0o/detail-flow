"use client"

/**
 * Module interactif « Zone d'intervention » : carte + recherche de commune
 * (combobox accessible) + raccourcis + carte « Commune sélectionnée ».
 * Les textes SEO sont rendus côté serveur dans <ZoneSection /> (zone-section.tsx).
 */

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import dynamic from "next/dynamic"
import { ArrowRight, ChevronDown, MapPin, Search } from "lucide-react"
import {
  ZONE,
  ZONE_COMMUNES,
  ZONE_DEFAULT_SLUG,
  ZONE_QUICK_PICKS,
  ZONE_SECTORS,
  getCommune,
  normalizeName,
  sectorLabel,
} from "./zones"

// Leaflet touche au DOM : chargement client uniquement.
const CleanyzerZoneMap = dynamic(() => import("./zone-map").then((m) => m.CleanyzerZoneMap), {
  ssr: false,
  loading: () => <div className="clz-zone-map clz-zm-skeleton" aria-hidden="true" />,
})

type Props = {
  /** Lien vers BookingV2 du tenant (CLZ_BOOKING_HREF). */
  bookingHref: string
  /** Lien vers la demande personnalisée existante du tenant (CLZ_DEMANDE_HREF). */
  requestHref: string
}

export function CleanyzerZoneModule({ bookingHref, requestHref }: Props) {
  const [selected, setSelected] = useState<string>(ZONE_DEFAULT_SLUG)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const commune = getCommune(selected) ?? ZONE_COMMUNES[0]

  // Résultats groupés par secteur
  const groups = useMemo(() => {
    const n = normalizeName(query)
    return ZONE_SECTORS.map((s) => ({
      ...s,
      items: ZONE_COMMUNES.filter((c) => c.sector === s.id && (!n || normalizeName(c.name).includes(n))),
    })).filter((g) => g.items.length > 0)
  }, [query])
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  const pick = (slug: string) => {
    const c = getCommune(slug)
    if (!c) return
    setSelected(slug)
    setQuery(c.name)
    setOpen(false)
    setActive(-1)
    inputRef.current?.blur()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (flat.length ? (i + 1) % flat.length : -1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : -1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const n = normalizeName(query)
      const best = active >= 0 ? flat[active] : flat.find((c) => normalizeName(c.name).startsWith(n)) ?? flat[0]
      if (best) pick(best.slug)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const activeId = active >= 0 && flat[active] ? `${listId}-${flat[active].slug}` : undefined

  return (
    <div className="clz-zone-grid">
      {/* Carte */}
      <div>
        <CleanyzerZoneMap selected={selected} onSelect={pick} />
        <div className="clz-zm-legend">
          <span><i className="is-base" />CLEANYZER à {ZONE.base.label}</span>
          <span><i className="is-incluse" />Exemples de communes du secteur</span>
        </div>
        <p className="clz-zm-caption">
          Cercle indicatif de {ZONE.visualRadiusKm} km autour de {ZONE.base.label}. Les frais de déplacement éventuels
          sont calculés sur votre adresse réelle lors de la réservation.
        </p>
      </div>

      {/* Sélection */}
      <div>
        <label htmlFor={`${listId}-input`} className="clz-zp-label">Vérifiez votre commune</label>
        <div className="clz-zp-combo">
          <Search className="clz-zp-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            id={`${listId}-input`}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            placeholder="Ex. : Seynod, Cruseilles…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
              setActive(-1)
            }}
            onFocus={(e) => {
              e.currentTarget.select()
              setOpen(true)
            }}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className="clz-zp-toggle"
            aria-label="Afficher toutes les communes"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (open) setOpen(false)
              else {
                setQuery("")
                inputRef.current?.focus()
              }
            }}
          >
            <ChevronDown className="h-4 w-4" />
          </button>

          {open && (
            <ul id={listId} role="listbox" className="clz-zp-list">
              {flat.length === 0 ? (
                <li role="presentation" className="clz-zp-none">
                  Commune non listée : indiquez votre adresse complète lors de la réservation, la faisabilité et les
                  frais de déplacement éventuels sont calculés automatiquement.
                </li>
              ) : (
                groups.map((g) => (
                  <li key={g.id} role="presentation">
                    <p className="clz-zp-group">{g.label}</p>
                    <ul role="presentation">
                      {g.items.map((c) => {
                        const isActive = flat[active]?.slug === c.slug
                        return (
                          <li
                            key={c.slug}
                            id={`${listId}-${c.slug}`}
                            role="option"
                            aria-selected={isActive}
                            className="clz-zp-option"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              pick(c.slug)
                            }}
                          >
                            <span>{c.name}</span>
                            {c.status === "base" && <span className="clz-zp-tag is-incluse">Base</span>}
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        <div className="clz-zp-quick" aria-label="Communes fréquentes">
          {ZONE_QUICK_PICKS.map((slug) => {
            const c = getCommune(slug)
            if (!c) return null
            return (
              <button key={slug} type="button" aria-pressed={selected === slug} onClick={() => pick(slug)}>
                {c.name}
              </button>
            )
          })}
        </div>

        <p className="clz-zp-count">
          <b>Exemples de communes du secteur</b> · liste indicative, non exhaustive
        </p>

        <div className="clz-zp-card" aria-live="polite">
          <p className="clz-zp-kicker">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Commune sélectionnée
          </p>
          <h3 className="clz-zp-name">{commune.name}</h3>
          <p className="clz-zp-sector">{sectorLabel(commune.sector)}</p>
          <p className="clz-zp-text">
            Nettoyage voiture et canapé à domicile à {commune.name} : choisissez le parcours adapté à votre besoin.
          </p>
          <a className="clz-zp-btn is-primary" href={bookingHref}>
            Réserver un nettoyage auto <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <a className="clz-zp-btn is-ghost" href={requestHref}>
            Demander un devis textile <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <p className="clz-zp-note">Votre adresse complète vous sera demandée lors de la réservation.</p>
        </div>

        <p className="clz-zp-fees">
          Les frais de déplacement éventuels sont calculés automatiquement à partir de votre adresse réelle et
          affichés avant toute validation.
        </p>
      </div>
    </div>
  )
}
