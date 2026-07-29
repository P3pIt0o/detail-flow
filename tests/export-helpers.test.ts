import { describe, it, expect } from "vitest"
import { createZip, toCsv } from "@/lib/export/zip"

describe("toCsv", () => {
  it("génère un en-tête + lignes", () => {
    const csv = toCsv([
      { id: 1, name: "Alpha" },
      { id: 2, name: "Beta" },
    ])
    expect(csv).toBe("id,name\r\n1,Alpha\r\n2,Beta")
  })

  it("échappe les valeurs contenant virgules, guillemets et retours ligne", () => {
    const csv = toCsv([{ note: 'a,b "c"\nd' }])
    expect(csv).toBe('note\r\n"a,b ""c""\nd"')
  })

  it("renvoie une chaîne vide pour un tableau vide", () => {
    expect(toCsv([])).toBe("")
  })

  it("sérialise les objets imbriqués en JSON", () => {
    const csv = toCsv([{ meta: { a: 1 } }])
    expect(csv).toContain('"{""a"":1}"')
  })
})

describe("createZip", () => {
  it("produit une archive ZIP valide (signature PK + central directory)", () => {
    const zip = createZip([
      { name: "export.json", content: '{"ok":true}' },
      { name: "csv/data.csv", content: "id\r\n1" },
    ])
    // Signature de local file header : 0x50 0x4b 0x03 0x04 ("PK\x03\x04").
    expect(zip[0]).toBe(0x50)
    expect(zip[1]).toBe(0x4b)
    expect(zip[2]).toBe(0x03)
    expect(zip[3]).toBe(0x04)
    // Le nom du premier fichier apparaît en clair (méthode "store").
    const text = Buffer.from(zip).toString("latin1")
    expect(text).toContain("export.json")
    expect(text).toContain("csv/data.csv")
    // Signature de fin d'archive (End Of Central Directory) : PK\x05\x06.
    expect(text).toContain("PK\x05\x06")
  })

  it("gère une archive vide sans planter", () => {
    const zip = createZip([])
    const text = Buffer.from(zip).toString("latin1")
    expect(text).toContain("PK\x05\x06")
  })
})
