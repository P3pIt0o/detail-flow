/**
 * Découpage « une phrase par ligne » des textes ÉDITORIAUX de Spirit ACS.
 *
 * Module PUR (aucune dépendance React / serveur) : testable unitairement et
 * importable par les composants serveur comme client.
 *
 * Pourquoi : les textes du tenant (heroSubtitle, siteContent.about.text,
 * gallery.intro, reviews.intro, customRequests.description…) sont saisis dans
 * l'admin comme de simples paragraphes. La maquette Spirit veut que chaque
 * phrase commence sur sa propre ligne. C'est une règle de PRÉSENTATION : on ne
 * réécrit JAMAIS la donnée en base, on la segmente à l'affichage. Le rendu
 * continue donc de fonctionner quand le client modifie ses textes.
 *
 * Garanties :
 *  - le texte et sa ponctuation sont conservés à l'identique (on ne fait que
 *    couper entre deux phrases et retirer les espaces de bordure) ;
 *  - les retours à la ligne déjà présents sont conservés (un « \n » saisi par
 *    le client reste une coupure) ; les lignes vides sont ignorées → jamais de
 *    double saut de ligne ;
 *  - on ne coupe PAS à l'intérieur d'un e-mail, d'une URL, d'un nombre décimal
 *    (« 5,0 », « 3.5 ») ni après une abréviation courante (« M. », « etc. »,
 *    « ex. », « tél. », initiale « J. ») : une fin de phrase exige une
 *    ponctuation finale SUIVIE d'un espace puis d'un nouveau mot.
 */

/**
 * Abréviations françaises courantes (sans le point final, en minuscules).
 * Un point qui suit l'un de ces mots n'est PAS une fin de phrase.
 */
const ABBREVIATIONS = new Set([
  "m",
  "mm",
  "mme",
  "mlle",
  "mr",
  "mrs",
  "dr",
  "pr",
  "me",
  "etc",
  "ex",
  "cf",
  "env",
  "tel",
  "tél",
  "art",
  "st",
  "ste",
  "av",
  "bd",
  "réf",
  "ref",
  "p",
  "pp",
  "vol",
  "no",
  "n°",
  "max",
  "min",
  "approx",
  "nb",
  "ps",
  "sté",
  "sarl",
  "sas",
  "inc",
  "ltd",
  "co",
  "www",
])

/** Ponctuations qui terminent une phrase (éventuellement répétées : « ?! », « … »). */
const TERMINATORS = new Set([".", "!", "?", "…"])

/**
 * Le « mot » qui précède la ponctuation (sans espace) : sert à détecter les
 * abréviations, les initiales et les tokens techniques (e-mail / URL).
 */
function wordBefore(text: string, punctIndex: number): string {
  let i = punctIndex - 1
  while (i >= 0 && !/\s/.test(text[i])) i--
  return text.slice(i + 1, punctIndex)
}

/** Segmente UNE ligne (sans « \n ») en phrases, texte conservé à l'identique. */
function splitLine(line: string): string[] {
  const out: string[] = []
  let start = 0
  const n = line.length

  for (let i = 0; i < n; i++) {
    const ch = line[i]
    if (!TERMINATORS.has(ch)) continue

    // Étend sur une séquence de ponctuations (« ... », « ?! », « ». »).
    let j = i
    while (j + 1 < n && (TERMINATORS.has(line[j + 1]) || line[j + 1] === "»" || line[j + 1] === '"' || line[j + 1] === "'" || line[j + 1] === ")")) {
      j++
    }

    // Une fin de phrase exige : espace(s) APRÈS, puis un vrai caractère de mot.
    let k = j + 1
    if (k >= n || !/\s/.test(line[k])) {
      i = j
      continue
    }
    while (k < n && /\s/.test(line[k])) k++
    if (k >= n) {
      i = j
      continue // fin de ligne : rien à couper
    }
    const next = line[k]
    // Suite en minuscule ou ponctuation → très probablement PAS une nouvelle phrase
    // (ex. « env. 2 h » est géré par les abréviations ; « ... et » reste soudé).
    const startsSentence = /[\p{Lu}\d«"“(]/u.test(next)
    if (!startsSentence) {
      i = j
      continue
    }

    // Garde-fous pour le point « . ». Les points INTERNES d'un e-mail, d'une
    // URL ou d'un nombre décimal (« contact@site.fr », « site.fr/avis »,
    // « 5.0 ») ne déclenchent jamais de coupure car ils ne sont pas suivis d'un
    // espace + majuscule : la règle générale ci-dessus les protège déjà. Il
    // reste à protéger les cas où le point EST suivi d'un espace + majuscule
    // sans pour autant finir une phrase : les abréviations et les initiales.
    if (ch === ".") {
      const raw = wordBefore(line, i)
      const word = raw.replace(/^[«"“(]+/, "").toLowerCase()
      if (ABBREVIATIONS.has(word)) {
        i = j
        continue
      }
      // Initiale d'un prénom (« J. Martin ») ou lettre seule (« a. b. »).
      if (/^[\p{L}]$/u.test(word)) {
        i = j
        continue
      }
    }

    out.push(line.slice(start, j + 1).trim())
    start = k
    i = k - 1
  }

  const tail = line.slice(start).trim()
  if (tail) out.push(tail)
  return out.filter((s) => s.length > 0)
}

/**
 * Découpe un texte éditorial en lignes « une phrase par ligne ».
 *
 * - `\r\n` / `\n` déjà présents = coupures conservées ;
 * - lignes vides supprimées (aucun double saut) ;
 * - texte vide / null → [].
 */
export function splitSentences(text: string | null | undefined): string[] {
  const src = (text ?? "").replace(/\r\n?/g, "\n")
  if (!src.trim()) return []
  const lines: string[] = []
  for (const rawLine of src.split("\n")) {
    const line = rawLine.trim()
    if (!line) continue
    lines.push(...splitLine(line))
  }
  return lines
}
