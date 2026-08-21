"use client"

import { getCountryProfile, SUPPORTED_COUNTRIES } from "@/lib/billing/country-profiles"

/**
 * Identité client B2C/B2B pilotée par le PAYS DU CLIENT (jamais celui du
 * vendeur). Composant PARTAGÉ entre le formulaire client (create/edit) et
 * l'éditeur de facture — une seule source d'UI, zéro duplication.
 *
 * - customerType "" => « Type à confirmer » (client legacy). JAMAIS déduit B2C.
 * - INDIVIDUAL (Particulier) : aucun identifiant société.
 * - BUSINESS (Entreprise) : identifiant + TVA, libellés selon le profil pays.
 * Les libellés/validations viennent de CountryBillingProfile (FR/BE/CH/GENERIC).
 */
export type CustomerIdentityValue = {
  customerType: string // "" | "individual" | "business"
  country: string // ISO alpha-2 ("" => à préciser, fallback GENERIC)
  legalRegistrationNumber: string
  vatNumber: string
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"

export function CustomerIdentityFields({
  value,
  onChange,
  idPrefix = "cust",
}: {
  value: CustomerIdentityValue
  onChange: (patch: Partial<CustomerIdentityValue>) => void
  idPrefix?: string
}) {
  // Pays client vide => profil GENERIC pour l'affichage (JAMAIS FR implicite).
  // "OTHER" est mappé sur GENERIC par getCountryProfile.
  const profile = getCountryProfile(value.country || "OTHER")
  const isBusiness = value.customerType === "business"

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-type`} className="mb-1 block text-xs text-muted-foreground">
            Type de client
          </label>
          <select
            id={`${idPrefix}-type`}
            value={value.customerType}
            onChange={(e) => onChange({ customerType: e.target.value })}
            className={inputClass}
          >
            <option value="">Type à confirmer</option>
            <option value="individual">Particulier</option>
            <option value="business">Entreprise</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-country`} className="mb-1 block text-xs text-muted-foreground">
            Pays du client
          </label>
          <select
            id={`${idPrefix}-country`}
            value={value.country}
            onChange={(e) => onChange({ country: e.target.value })}
            className={inputClass}
          >
            <option value="">À préciser</option>
            {SUPPORTED_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
            <option value="OTHER">Autre pays</option>
          </select>
        </div>
      </div>

      {isBusiness && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-legal`} className="mb-1 block text-xs text-muted-foreground">
              {profile.customerLegalIdLabel}
            </label>
            <input
              id={`${idPrefix}-legal`}
              type="text"
              value={value.legalRegistrationNumber}
              onChange={(e) => onChange({ legalRegistrationNumber: e.target.value })}
              placeholder={profile.legalIdPlaceholder}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-vat`} className="mb-1 block text-xs text-muted-foreground">
              {profile.vatNumberLabel}
            </label>
            <input
              id={`${idPrefix}-vat`}
              type="text"
              value={value.vatNumber}
              onChange={(e) => onChange({ vatNumber: e.target.value })}
              placeholder={profile.vatNumberPlaceholder}
              className={inputClass}
            />
          </div>
        </div>
      )}
    </div>
  )
}
