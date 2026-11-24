import { describe, expect, it, vi } from "vitest"

// Le composant importe l'action serveur : on la remplace (aucune BDD ici).
vi.mock("@/app/admin/(dashboard)/parametres/actions", () => ({ saveBusinessHours: vi.fn() }))

import { addFixedStart, fixedStartsToSave } from "@/components/admin/settings/hours-settings"

describe("L75 — écran Horaires : ajout d'une heure fixe (aperçu validé)", () => {
  it("le champ d'ajout part vide : rien n'est ajouté sans saisie (pas de pré-remplissage)", () => {
    expect(addFixedStart([], "")).toEqual({ ok: false, error: "Saisissez une heure valide." })
  })

  it("ajoute l'heure saisie et trie la liste", () => {
    expect(addFixedStart(["13:00"], "08:00")).toEqual({ ok: true, list: ["08:00", "13:00"] })
  })

  it("doublon : refusé avec un message (plus de fusion silencieuse)", () => {
    const r = addFixedStart(["08:00"], "08:00")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/déjà dans la liste/)
  })

  it("heure mal formée refusée ; 12 heures maximum", () => {
    expect(addFixedStart([], "25:00").ok).toBe(false)
    const full = Array.from({ length: 12 }, (_, i) => `${String(i + 8).padStart(2, "0")}:00`)
    const r = addFixedStart(full, "21:30")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/12 heures maximum/)
  })

  it("option désactivée : liste vide envoyée (retour au pas global) ; activée : liste envoyée", () => {
    expect(fixedStartsToSave(false, "08:00,13:00")).toEqual([])
    expect(fixedStartsToSave(true, "08:00,13:00")).toEqual(["08:00", "13:00"])
    expect(fixedStartsToSave(true, null)).toEqual([])
  })
})
