/*
 * DetailFlow — loader d'intégration du moteur de réservation.
 *
 * Usage (le professionnel copie-colle ce bloc, SANS jamais éditer d'identifiant) :
 *
 *   <div data-detailflow-reservation data-detailflow-slug="mon-garage"></div>
 *   <script src="https://www.detailflow.fr/embed.js" async></script>
 *
 * Le loader crée une iframe responsive vers la route canonique
 * /p/<slug>/reservation?embed=1 (UN seul moteur de réservation, jamais dupliqué)
 * et l'auto-redimensionne via postMessage. L'origine est déduite de la balise
 * <script> elle-même : seul le slug transite, l'isolation tenant est garantie.
 */
(function () {
  "use strict"

  // Origine du script courant (ex. https://www.detailflow.fr). Capturée pendant
  // l'exécution initiale, y compris pour un script `async`.
  function scriptOrigin() {
    var current = document.currentScript
    if (current && current.src) {
      try {
        return new URL(current.src).origin
      } catch (e) {
        /* URL invalide : repli ci-dessous. */
      }
    }
    // Repli : dernière balise <script> pointant vers embed.js.
    var scripts = document.getElementsByTagName("script")
    for (var i = scripts.length - 1; i >= 0; i--) {
      var s = scripts[i]
      if (s.src && s.src.indexOf("/embed.js") !== -1) {
        try {
          return new URL(s.src).origin
        } catch (e) {
          /* continue */
        }
      }
    }
    return ""
  }

  var ORIGIN = scriptOrigin()

  function mount(container) {
    if (container.getAttribute("data-detailflow-mounted") === "1") return
    var slug = container.getAttribute("data-detailflow-slug")
    if (!slug) return
    container.setAttribute("data-detailflow-mounted", "1")

    var iframe = document.createElement("iframe")
    iframe.src = ORIGIN + "/p/" + encodeURIComponent(slug) + "/reservation?embed=1"
    iframe.title = "Réservation en ligne"
    iframe.loading = "lazy"
    iframe.setAttribute("allow", "payment")
    iframe.style.width = "100%"
    iframe.style.border = "0"
    iframe.style.minHeight = "900px"
    iframe.style.display = "block"
    container.appendChild(iframe)

    // Auto-resize : n'accepte que les messages de hauteur provenant de l'origine
    // DetailFlow, et uniquement pour CETTE iframe.
    window.addEventListener("message", function (event) {
      if (ORIGIN && event.origin !== ORIGIN) return
      if (event.source !== iframe.contentWindow) return
      var data = event.data
      if (!data || data.type !== "detailflow:height") return
      var h = parseInt(data.height, 10)
      if (h > 0) iframe.style.height = h + "px"
    })
  }

  function init() {
    var containers = document.querySelectorAll("[data-detailflow-reservation]")
    for (var i = 0; i < containers.length; i++) mount(containers[i])
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init)
  } else {
    init()
  }
})()
