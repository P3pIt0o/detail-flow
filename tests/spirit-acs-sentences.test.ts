import { describe, expect, it } from "vitest"

import { splitSentences } from "@/components/custom-sites/spirit-acs/sentences"

describe("splitSentences — segmentation éditoriale Spirit ACS", () => {
  it("découpe le hero attendu (retour \\n conservé + coupure après « exigence. »)", () => {
    const hero =
      "Nettoyage, polissage, protection céramique :\nun detailing réalisé avec exigence. Demandez votre devis personnalisé en quelques instants."
    expect(splitSentences(hero)).toEqual([
      "Nettoyage, polissage, protection céramique :",
      "un detailing réalisé avec exigence.",
      "Demandez votre devis personnalisé en quelques instants.",
    ])
  })

  it("coupe après . ! ?", () => {
    expect(splitSentences("Un. Deux! Trois? Quatre.")).toEqual(["Un.", "Deux!", "Trois?", "Quatre."])
  })

  it("préserve le texte et la ponctuation à l'identique", () => {
    const src = "Bonjour ! Comment ça va ?"
    expect(splitSentences(src).join(" ")).toBe(src)
  })

  it("ne coupe pas les e-mails, URL et domaines", () => {
    expect(splitSentences("Écrivez à contact@detailflow.fr. Merci.")).toEqual([
      "Écrivez à contact@detailflow.fr.",
      "Merci.",
    ])
    expect(splitSentences("Voir https://detailflow.fr/avis pour en savoir plus.")).toEqual([
      "Voir https://detailflow.fr/avis pour en savoir plus.",
    ])
    expect(splitSentences("Rendez-vous sur detailflow.fr. À bientôt.")).toEqual([
      "Rendez-vous sur detailflow.fr.",
      "À bientôt.",
    ])
  })

  it("ne coupe pas les nombres décimaux ni les notes", () => {
    expect(splitSentences("Une note de 5.0 sur 5. Excellent.")).toEqual(["Une note de 5.0 sur 5.", "Excellent."])
    expect(splitSentences("Compter env. 3.5 heures de travail.")).toEqual(["Compter env. 3.5 heures de travail."])
  })

  it("ne coupe pas après les abréviations courantes ni les initiales", () => {
    expect(splitSentences("Suivi par M. Dupont pour l'atelier.")).toEqual(["Suivi par M. Dupont pour l'atelier."])
    // « etc. » est une abréviation : on ne coupe pas juste après (pas de « etc. » isolé).
    expect(splitSentences("Polissage, céramique, etc. et bien plus encore.")).toEqual([
      "Polissage, céramique, etc. et bien plus encore.",
    ])
    expect(splitSentences("Confié à J. Martin ce matin.")).toEqual(["Confié à J. Martin ce matin."])
  })

  it("conserve les \\n existants sans créer de double saut", () => {
    expect(splitSentences("Ligne une.\n\n\nLigne deux.")).toEqual(["Ligne une.", "Ligne deux."])
    expect(splitSentences("Titre :\nPremière phrase. Deuxième phrase.")).toEqual([
      "Titre :",
      "Première phrase.",
      "Deuxième phrase.",
    ])
  })

  it("gère les valeurs vides", () => {
    expect(splitSentences("")).toEqual([])
    expect(splitSentences(null)).toEqual([])
    expect(splitSentences(undefined)).toEqual([])
    expect(splitSentences("   \n  ")).toEqual([])
  })

  it("ne coupe pas quand la phrase suivante commence en minuscule", () => {
    expect(splitSentences("Ouvert de 9h à 18h. tous les jours ouvrés.")).toEqual([
      "Ouvert de 9h à 18h. tous les jours ouvrés.",
    ])
  })

  it("gère une ponctuation multiple (?!) et les points de suspension", () => {
    expect(splitSentences("Vraiment ?! Oui.")).toEqual(["Vraiment ?!", "Oui."])
    expect(splitSentences("Attendez… Voilà.")).toEqual(["Attendez…", "Voilà."])
  })
})
