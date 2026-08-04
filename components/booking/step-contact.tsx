"use client"

import { useState } from "react"
import { Loader2, MapPin, AlertCircle, CheckCircle2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatKm, formatPrice } from "@/lib/format"
import { computeTravelAction } from "@/app/(site)/reservation/actions"
import type { TravelResult } from "@/lib/booking/types"

export type ContactData = {
  name: string
  email: string
  phone: string
  address: string
  notes: string
}

type Props = {
  contact: ContactData
  onChange: (data: ContactData) => void
  travel: TravelResult | null
  onTravel: (t: TravelResult | null) => void
  roundTrip: boolean
  freeDistanceKm: number
}

const TRAVEL_ERRORS: Record<string, string> = {
  address_not_found:
    "Adresse introuvable. Vérifiez l’orthographe. Pour une adresse en zone frontalière ou à l’étranger, indiquez également le code postal et le pays (France, Suisse, Belgique…).",
  out_of_range: "Cette adresse est en dehors de notre zone d’intervention.",
  route_failed: "Impossible de calculer l’itinéraire pour le moment. Réessayez.",
}

export function StepContact({
  contact,
  onChange,
  travel,
  onTravel,
  roundTrip,
  freeDistanceKm,
}: Props) {
  const [calculating, setCalculating] = useState(false)

  function set<K extends keyof ContactData>(key: K, value: ContactData[K]) {
    onChange({ ...contact, [key]: value })

    // Toute modification d’adresse invalide le calcul précédent.
    if (key === "address") {
      onTravel(null)
    }
  }

  async function calculateTravel() {
    if (contact.address.trim().length < 5) return

    setCalculating(true)

    try {
      const result = await computeTravelAction(contact.address)
      onTravel(result)
    } catch {
      onTravel({
        ok: false,
        error: "route_failed",
        address: contact.address,
        lat: null,
        lng: null,
        distanceKm: 0,
        billedDistanceKm: 0,
        feeCents: 0,
      })
    } finally {
      setCalculating(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Coordonnées */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-serif text-base font-semibold text-card-foreground">
          Vos coordonnées
        </h3>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="name">Nom complet</Label>
            <Input
              id="name"
              value={contact.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Jean Dupont"
              autoComplete="name"
              required
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={contact.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="jean@exemple.fr"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <Label htmlFor="phone">Téléphone</Label>
            <Input
              id="phone"
              type="tel"
              value={contact.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+33 6 12 34 56 78"
              autoComplete="tel"
              required
            />
          </div>

          <div>
            <Label htmlFor="notes">Précisions (facultatif)</Label>
            <Textarea
              id="notes"
              value={contact.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Étage, code, instructions d’accès…"
              rows={3}
            />
          </div>
        </div>
      </div>

      {/* Adresse et déplacement */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-serif text-base font-semibold text-card-foreground">
          Adresse d’intervention
        </h3>

        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="address">Adresse complète</Label>

            <Textarea
              id="address"
              value={contact.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Rte Suisse 35, 1196 Gland, Suisse"
              rows={2}
              autoComplete="street-address"
              required
            />

            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Pour un calcul précis des frais de déplacement, renseignez votre
              adresse complète. Si l’intervention est située en zone frontalière
              ou dans un autre pays, indiquez également le code postal et le pays
              (France, Suisse, Belgique…).
            </p>
          </div>

          <button
            type="button"
            onClick={calculateTravel}
            disabled={calculating || contact.address.trim().length < 5}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {calculating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
            Calculer les frais de déplacement
          </button>

          {/* Résultat en erreur */}
          {travel && !travel.ok && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {travel.error
                  ? TRAVEL_ERRORS[travel.error]
                  : "Calcul impossible."}
              </span>
            </div>
          )}

          {/* Résultat valide */}
          {travel?.ok && (
            <div className="rounded-lg border border-border bg-background p-3 text-sm">
              <div className="mb-2 flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">Zone couverte</span>
              </div>

              <dl className="space-y-1 text-muted-foreground">
                <div className="flex justify-between">
                  <dt>Distance {roundTrip ? "(aller simple)" : ""}</dt>
                  <dd className="text-card-foreground">
                    {formatKm(travel.distanceKm)}
                  </dd>
                </div>

                <div className="flex justify-between">
                  <dt>Distance gratuite</dt>
                  <dd className="text-card-foreground">
                    {formatKm(freeDistanceKm)}
                  </dd>
                </div>

                <div className="flex justify-between">
                  <dt>
                    Distance facturée {roundTrip ? "(aller-retour)" : ""}
                  </dt>
                  <dd className="text-card-foreground">
                    {formatKm(travel.billedDistanceKm)}
                  </dd>
                </div>

                <div className="flex justify-between border-t border-border pt-1 font-medium">
                  <dt className="text-card-foreground">
                    Frais de déplacement
                  </dt>
                  <dd className="text-primary">
                    {travel.feeCents === 0
                      ? "Offert"
                      : formatPrice(travel.feeCents)}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
