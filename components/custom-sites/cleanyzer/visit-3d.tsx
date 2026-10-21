"use client"

/**
 * VISITE 3D CLEANYZER — portage React de la maquette `visit3d.js`.
 * Porsche 911 (n.brizitskaya, CC BY 4.0) parcourue au défilement ; chaque zone
 * renvoie aux formules qui la traitent et à la séquence exacte du film.
 *
 * Three.js r147 est chargé à la demande depuis le CDN (comme la maquette),
 * uniquement quand la section approche de l'écran : aucune dépendance npm,
 * aucun impact sur le chargement initial. Données : `journey.ts`.
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { VEHICLES, type VehicleKey } from "./content"
import {
  CLZ_VISIT_ANCHOR,
  JOURNEY_FORMULAS,
  JOURNEY_ZONES,
  ZONE_KEYS,
  zoneAction,
  zoneFormulas,
  type FormulaRef,
  type ZoneKey,
} from "./journey"
import { goFilm, goVisit, noteZone, registerVisit, useJourney } from "./journey-nav"
import "./visit-3d.css"

const BASE = "/custom-sites/cleanyzer/3d/"
const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.147.0"
// SRI des fichiers publiés de three@0.147.0 : un fichier modifié sur le CDN n'est jamais exécuté.
const CDN_SCRIPTS = [
  { src: `${THREE_CDN}/build/three.min.js`, integrity: "sha384-vV17nr/rMaJqmeZkFUzXLpHdQ+ME5QHKdydaqqN+3Ga39RJlNrTatJxHwGV4ml2C" },
  { src: `${THREE_CDN}/examples/js/loaders/GLTFLoader.js`, integrity: "sha384-FassWWYNEPQsuRQm+59KIMcDetEc30bNyE9yfx16Ok8lvoowyH81LtrPmLWltJMh" },
] as const

/** Ordre des images clés de la caméra (maquette : KEYS après insertion du moteur). */
const KEY_ORDER: (ZoneKey | null)[] = [null, "body", "optics", "rims", "engine", null, "mats", "seats", "vents", "leather", null]
const NK = KEY_ORDER.length
const STEPS = KEY_ORDER.filter((z): z is ZoneKey => z !== null)

const MESH_RE: Record<ZoneKey, RegExp> = {
  body: /^body_|^body__/,
  // Optiques avant : glace (flash) + bague chromée des deux phares.
  optics: /^headlights_flash|^headlights_plastics_headlights_plastic_ring/,
  rims: /^wheel_rim|^discs|^metal_parts/,
  engine: /^$^/,
  mats: /^rugs_all/,
  seats: /^leather_all_leather_perforated/,
  vents: /^plastic_all_interior_grid/,
  // Volant + garnitures INTÉRIEURES des deux portières (cuir, cuir/plastique,
  // plastique intérieur). `plast_leather_all` (montants, planche de bord) en
  // est exclu : c'est lui qui éclairait le montant de pare-brise à tort.
  leather: /^steering_wheel|^leather_door_|^leathplast_door_|^leath_plast_door_|^plastic_door_\d_bl_pl_M_int/,
}
const HIDE = /logo|LOGO|number_plate|invisible_all/
const KEEP =
  /^(leather_all|rugs_all|plastic_all|plast_leather_all|steering_wheel|chrome_int|carbon_all|monitors|belts_all|wheel_rim|discs|brakes|AO_tire|metal_parts|glossy_plastic|dynamics_all)/
const FRONT = /^headlights_flash|^lights_pattern_all/
const BACK = /^red_light_back/

const FORM_GROUPS: { label: string; side: "int" | "ext" | "both" }[] = [
  { label: "Intérieur", side: "int" },
  { label: "Extérieur", side: "ext" },
  { label: "Sur mesure", side: "both" },
]

const scriptCache = new Map<string, Promise<void>>()
function addScript(src: string, integrity?: string) {
  let p = scriptCache.get(src)
  if (!p) {
    p = new Promise<void>((ok, ko) => {
      const s = document.createElement("script")
      if (integrity) {
        s.integrity = integrity
        s.crossOrigin = "anonymous"
      }
      s.src = src
      s.async = false
      s.onload = () => ok()
      s.onerror = () => ko(new Error(src))
      document.head.appendChild(s)
    })
    scriptCache.set(src, p)
  }
  return p
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const sm = (x: number) => x * x * (3 - 2 * x)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

function liteDevice() {
  const n = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number }
  if (n.connection?.saveData) return true
  if (typeof n.deviceMemory === "number" && n.deviceMemory <= 2) return true
  return typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency > 0 && n.hardwareConcurrency <= 2
}

function scrollToKey(section: HTMLElement, zone: ZoneKey | "final") {
  const k = zone === "final" ? NK - 1 : KEY_ORDER.indexOf(zone)
  const f = k < 0 ? 0 : k / (NK - 1)
  window.scrollTo({
    top: section.getBoundingClientRect().top + window.scrollY + (section.offsetHeight - window.innerHeight) * f,
    behavior: reducedMotion() ? "auto" : "smooth",
  })
}

export function Visit3D() {
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const hotRef = useRef<HTMLDivElement>(null)
  const finalRef = useRef<HTMLDivElement>(null)
  const ringArcRef = useRef<SVGCircleElement>(null)
  const ringValRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLElement>(null)
  const cardRef = useRef<HTMLElement>(null)
  const formRef = useRef<FormulaRef>("excellence")

  const [status, setStatus] = useState<string | null>("Chargement de la voiture…")
  const [step, setStep] = useState(-1)
  const [finalOn, setFinalOn] = useState(false)
  const [form, setForm] = useState<FormulaRef>("excellence")
  const [veh, setVeh] = useState<VehicleKey>("citadine")
  // Appareil peu puissant / économie de données : alternative légère tant que
  // le visiteur n'a pas demandé la 3D (Three.js + modèle non téléchargés).
  const [lite, setLite] = useState(false)
  // Échec définitif (hash, réseau, modèle) : version légère sans relance possible.
  const [failed, setFailed] = useState(false)
  const launchRef = useRef<(() => void) | null>(null)
  const journey = useJourney()

  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("clz-veh")
      if (saved === "citadine" || saved === "berline" || saved === "suv") setVeh(saved)
    } catch {
      /* valeur par défaut */
    }
  }, [])

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    return registerVisit((zone) => scrollToKey(section, zone))
  }, [])

  useEffect(() => {
    const section = sectionRef.current
    const cv = canvasRef.current
    if (!section || !cv) return
    let disposed = false
    let raf = 0
    let cleanupScene: (() => void) | null = null

    const fail3d = () => {
      if (disposed) return
      setFailed(true)
      setLite(true)
    }

    const boot = () => {
      addScript(CDN_SCRIPTS[0].src, CDN_SCRIPTS[0].integrity)
        .then(() => addScript(CDN_SCRIPTS[1].src, CDN_SCRIPTS[1].integrity))
        .then(() => addScript(`${BASE}meshopt_decoder.js`))
        .then(() => {
          if (!disposed) cleanupScene = start()
        })
        .catch(() => fail3d())
    }

    const start = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      const THREE = w.THREE
      if (!THREE?.GLTFLoader) {
        fail3d()
        return null
      }
      const reduce = reducedMotion()
      const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true })
      R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
      R.outputEncoding = THREE.sRGBEncoding
      R.toneMapping = THREE.ACESFilmicToneMapping
      R.toneMappingExposure = 1
      const scene = new THREE.Scene()
      scene.background = new THREE.Color("#070b14")
      scene.fog = new THREE.Fog("#070b14", 10, 26)
      const cam = new THREE.PerspectiveCamera(40, 1, 0.02, 80)
      {
        const es = new THREE.Scene()
        es.background = new THREE.Color("#06080d")
        const W = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
        const B = new THREE.MeshBasicMaterial({ color: 0x5d9cff, side: THREE.DoubleSide })
        ;[-3, 0, 3].forEach((x) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 8), W)
          m.position.set(x, 6, 0)
          m.rotation.x = Math.PI / 2
          es.add(m)
        })
        const s1 = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.4), W)
        s1.position.set(0, 2.5, -7)
        es.add(s1)
        const s2 = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.8), B)
        s2.position.set(0, 1.4, 7)
        s2.rotation.y = Math.PI
        es.add(s2)
        const s3 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 5), W)
        s3.position.set(7, 2.5, 0)
        s3.rotation.y = -Math.PI / 2
        es.add(s3)
        const s4 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 5), W)
        s4.position.set(-7, 2.5, 0)
        s4.rotation.y = Math.PI / 2
        es.add(s4)
        scene.environment = new THREE.PMREMGenerator(R).fromScene(es, 0.03).texture
      }
      scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x0a0f1a, 0.5))
      const keyL = new THREE.DirectionalLight(0xffffff, 1.3)
      keyL.position.set(3, 8, 4)
      scene.add(keyL)
      const cabin = new THREE.PointLight(0xffffff, 0, 4)
      scene.add(cabin)
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(16, 64),
        new THREE.MeshStandardMaterial({ color: "#080d18", roughness: 0.55, metalness: 0, envMapIntensity: 0.12 }),
      )
      ground.rotation.x = -Math.PI / 2
      ground.position.y = -0.002
      scene.add(ground)
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(3.05, 3.08, 128),
        new THREE.MeshBasicMaterial({ color: "#0a84ff", transparent: true, opacity: 0.25 }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.003
      scene.add(ring)
      const car = new THREE.Group()
      scene.add(car)

      const size = () => {
        const wd = cv.clientWidth
        const h = cv.clientHeight
        R.setSize(wd, h, false)
        cam.aspect = wd / h
        cam.fov = wd < 700 ? 60 : 40
        cam.updateProjectionMatrix()
      }
      window.addEventListener("resize", size)
      size()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type Any = any
      let holo: Any = null
      let KEYS: Any[] = []
      let curP: Any
      let curT: Any
      const zoneMats: Record<string, Any[]> = {}
      const shell: Any[] = []
      const anchors: Record<string, Any> = {}
      const zoneAnchor: Partial<Record<ZoneKey, Any>> = {}
      let ready = false

      const loader = new THREE.GLTFLoader()
      const tryLoad = (url: string, useMeshopt: boolean) => {
        if (useMeshopt) loader.setMeshoptDecoder(w.MeshoptDecoder)
        loader.load(
          url,
          setup,
          (e: ProgressEvent) => {
            if (e.total) setStatus(`Chargement de la voiture ${Math.round((e.loaded / e.total) * 100)} %`)
          },
          () => {
            if (useMeshopt) tryLoad(`${BASE}porsche-911-raw-glb.wasm`, false)
            else fail3d()
          },
        )
      }
      const md = w.MeshoptDecoder
      if (md?.supported)
        md.ready.then(
          () => tryLoad(`${BASE}porsche-911-glb.wasm`, true),
          () => tryLoad(`${BASE}porsche-911-raw-glb.wasm`, false),
        )
      else tryLoad(`${BASE}porsche-911-raw-glb.wasm`, false)

      function setup(g: Any) {
        if (disposed) return
        const root = g.scene
        root.updateMatrixWorld(true)
        const bounds = () => {
          const b = new THREE.Box3()
          root.traverse((o: Any) => {
            if (o.isMesh && !/Sombra/.test(o.name)) b.expandByObject(o)
          })
          return b
        }
        let box = bounds()
        let sz = box.getSize(new THREE.Vector3())
        const piv = new THREE.Group()
        piv.add(root)
        if (sz.z > sz.x) piv.rotation.y = Math.PI / 2
        piv.updateMatrixWorld(true)
        const fb = new THREE.Box3()
        const bk = new THREE.Box3()
        root.traverse((o: Any) => {
          if (o.isMesh) {
            if (FRONT.test(o.name)) fb.expandByObject(o)
            if (BACK.test(o.name)) bk.expandByObject(o)
          }
        })
        if (!fb.isEmpty() && !bk.isEmpty() && fb.getCenter(new THREE.Vector3()).x < bk.getCenter(new THREE.Vector3()).x)
          piv.rotation.y += Math.PI
        piv.updateMatrixWorld(true)
        box = bounds()
        sz = box.getSize(new THREE.Vector3())
        const s = 3.9 / sz.x
        piv.scale.setScalar(s)
        const c = box.getCenter(new THREE.Vector3())
        piv.position.set(-c.x * s, -box.min.y * s, -c.z * s)
        car.add(piv)
        car.updateMatrixWorld(true)

        ZONE_KEYS.forEach((k) => {
          zoneMats[k] = []
          anchors[k] = new THREE.Box3()
        })
        const steer = new THREE.Box3()
        root.traverse((o: Any) => {
          if (!o.isMesh) return
          if (HIDE.test(o.name)) {
            o.visible = false
            return
          }
          const zk = ZONE_KEYS.find((k) => MESH_RE[k].test(o.name)) ?? null
          if (zk) {
            const m = o.material.clone()
            m.emissiveMap = null
            m.emissive = new THREE.Color("#0a84ff")
            m.emissiveIntensity = 0
            o.material = m
            zoneMats[zk].push(m)
            anchors[zk].expandByObject(o)
          }
          if (/^steering_wheel/.test(o.name)) steer.expandByObject(o)
          if (!KEEP.test(o.name)) {
            const m = o.material.clone()
            m.userData.op = m.opacity
            m.userData.tr = m.transparent
            o.material = m
            shell.push(m)
            if (zk) {
              zoneMats[zk][zoneMats[zk].length - 1] = m
              // Pièce de zone située dans la coque (ex. portières) : elle reste
              // visible quand sa zone est active, au lieu d'être fantôme.
              m.userData.zone = zk
              m.emissiveMap = null
              m.emissive = new THREE.Color("#0a84ff")
              m.emissiveIntensity = 0
            }
          }
        })
        const A: Record<string, Any> = {}
        for (const k in anchors) A[k] = anchors[k].isEmpty() ? new THREE.Vector3() : anchors[k].getCenter(new THREE.Vector3())
        const bb = new THREE.Box3().setFromObject(piv)
        const hl = bb.max.x
        const hw = bb.max.z
        const H = bb.max.y
        const fw = new THREE.Vector3(0, 0, 0)
        {
          const b = new THREE.Box3()
          root.traverse((o: Any) => {
            if (o.isMesh && /^wheel_rim/.test(o.name)) b.expandByObject(o)
          })
          if (!b.isEmpty()) {
            const r = (b.max.y - b.min.y) / 2
            fw.set(b.max.x - r, (b.min.y + b.max.y) / 2, b.max.z - 0.03)
          }
        }
        if (fw.lengthSq() === 0) fw.set(hl * 0.65, 0.32, hw)
        A.rims = fw.clone()
        A.body = new THREE.Vector3(0, H * 0.55, hw)
        if (!steer.isEmpty()) A.leather = steer.getCenter(new THREE.Vector3())
        // Les deux phares forment un seul maillage : on vise le centre du phare
        // côté caméra (+z), à un rayon de bague du bord extérieur.
        {
          const b = new THREE.Box3()
          root.traverse((o: Any) => {
            if (o.isMesh && /^headlights_plastics_headlights_plastic_ring/.test(o.name)) b.expandByObject(o)
          })
          if (b.isEmpty()) A.optics = new THREE.Vector3(hl * 0.88, H * 0.5, hw * 0.75)
          else {
            const r = (b.max.y - b.min.y) / 2
            A.optics = new THREE.Vector3(lerp((b.min.x + b.max.x) / 2, b.max.x, 0.6), (b.min.y + b.max.y) / 2, b.max.z - r)
          }
        }
        ZONE_KEYS.forEach((k) => {
          if (A[k]) zoneAnchor[k] = A[k]
        })
        const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
        KEYS = [
          { p: v(hl * 1.85, H * 1.7, hw * 4.6), t: v(-hl * 0.15 - 0.75, H * 0.35, 0.75), x: 0 },
          { p: v(hl * 0.1, H * 0.95, hw * 5.3), t: v(-hl * 0.05, H * 0.05, 0), x: 0 },
          // Optiques : trois-quarts avant, à hauteur de phare.
          { p: A.optics.clone().add(v(1.55, 0.3, 1.25)), t: A.optics.clone(), x: 0 },
          { p: fw.clone().add(v(1.4, 0.3, 1.7)), t: fw.clone(), x: 0 },
          { p: v(hl * 1.0, H * 1.35, hw * 3.4), t: v(0, H * 0.45, 0), x: 0.85 },
          { p: A.mats.clone().add(v(-0.25, 1.1, 2.8)), t: A.mats.clone().add(v(-0.45, -0.3, 0)), x: 1 },
          { p: A.seats.clone().add(v(0.55, 0.85, 2.45)), t: A.seats.clone(), x: 1 },
          { p: A.vents.clone().add(v(-1.15, 0.3, 0.12)), t: A.vents.clone(), x: 1 },
          // Cadrage volant + garniture de la portière conducteur (visée décalée vers la portière).
          { p: A.leather.clone().add(v(-0.42, 0.32, 0.68)), t: A.leather.clone().add(v(0, -0.12, -0.2)), x: 1 },
          { p: v(hl * 1.9, H * 3.6, hw * 4.9), t: v(-hl * 0.05, -H * 1.7, 0), x: 0.7 },
        ]
        // Moteur arrière (911) : volume holographique, le modèle n'a pas de moteur modélisé.
        {
          const ex0 = -hl * 0.86
          const ex1 = -hl * 0.42
          const ey0 = H * 0.24
          const ey1 = H * 0.56
          const ez = hw * 0.55
          const gH = new THREE.Group()
          gH.position.set((ex0 + ex1) / 2, (ey0 + ey1) / 2, 0)
          car.add(gH)
          const bx = new THREE.BoxGeometry(ex1 - ex0, ey1 - ey0, ez * 2)
          const fill = new THREE.MeshBasicMaterial({ color: "#0a84ff", transparent: true, opacity: 0, depthWrite: false })
          const line = new THREE.LineBasicMaterial({ color: "#5aaeff", transparent: true, opacity: 0 })
          gH.add(new THREE.Mesh(bx, fill))
          gH.add(new THREE.LineSegments(new THREE.EdgesGeometry(bx), line))
          const cyl = new THREE.CylinderGeometry(0.075, 0.075, 0.22, 20)
          cyl.rotateX(Math.PI / 2)
          for (let i = 0; i < 3; i++)
            for (const sd of [-1, 1]) {
              const cm = new THREE.Mesh(cyl, fill)
              cm.position.set((i - 1) * 0.2, 0, sd * ez * 0.55)
              gH.add(cm)
              const e = new THREE.LineSegments(new THREE.EdgesGeometry(cyl, 30), line)
              e.position.copy(cm.position)
              gH.add(e)
            }
          holo = { fill, line }
          zoneAnchor.engine = new THREE.Vector3((ex0 + ex1) / 2, ey1, 0)
        }
        KEYS.splice(4, 0, { p: v(-hl * 2.15, H * 1.75, hw * 2.9), t: v(-hl * 0.62, H * 0.38, 0), x: 0.8 })
        curP = new THREE.CatmullRomCurve3(KEYS.map((k) => k.p), false, "centripetal")
        curT = new THREE.CatmullRomCurve3(KEYS.map((k) => k.t), false, "centripetal")
        cabin.position.set(0, H * 0.8, 0)
        setStatus(null)
        ready = true
        raf = requestAnimationFrame(loop)
      }

      let cur = 0
      let target = 0
      let lastStep = -2
      let lastFinal = false
      let visible = true
      const measure = () => {
        const r = section.getBoundingClientRect()
        target = clamp(-r.top / (r.height - window.innerHeight))
      }
      window.addEventListener("scroll", measure, { passive: true })
      measure()
      cur = target
      const visIo = new IntersectionObserver((e) => {
        visible = e[0].isIntersecting
      })
      visIo.observe(section)
      const tmp = new THREE.Vector3()

      function loop(ts: number) {
        raf = requestAnimationFrame(loop)
        if (!visible || !ready) return
        const t = ts / 1000
        cur += (target - cur) * (reduce ? 1 : 0.09)
        const kf = cur * (NK - 1)
        const ki = Math.min(NK - 2, Math.floor(kf))
        const fr = kf - ki
        const u = (ki + sm(sm(fr))) / (NK - 1)
        cam.position.copy(curP.getPoint(u))
        cam.lookAt(curT.getPoint(u))
        const xr = lerp(KEYS[ki].x, KEYS[ki + 1].x, sm(fr))
        const op = lerp(1, 0.045, xr)
        const nearK = Math.round(kf)
        const actZone = KEY_ORDER[nearK] ?? null
        const zoneW = actZone ? clamp(1 - Math.abs(kf - nearK) / 0.32) : 0
        for (const m of shell) {
          const ghost = xr > 0.01
          const tr = ghost ? true : m.userData.tr
          if (m.transparent !== tr) {
            m.transparent = tr
            m.needsUpdate = true
          }
          const ghostOp = ghost ? Math.min(m.userData.op, op) : m.userData.op
          const w = m.userData.zone && m.userData.zone === actZone ? zoneW : 0
          m.opacity = lerp(ghostOp, Math.max(ghostOp, 0.85 * m.userData.op), w)
          m.depthWrite = xr < 0.3 || w > 0.5
        }
        cabin.intensity = xr * 0.6
        car.rotation.y = Math.sin(t * 0.25) * 0.35 * (1 - clamp(kf))
        const near = Math.round(kf)
        const act = Math.abs(kf - near) < 0.32 ? (KEY_ORDER[near] ?? null) : null
        const finalK = clamp((kf - (NK - 1.4)) / 0.4)
        const pulse = 0.55 + 0.45 * Math.sin(t * 4)
        const sel = formRef.current
        for (const k in zoneMats) {
          let on = 0
          if (k === act) on = k === "body" ? pulse * 0.25 : pulse
          if (finalK > 0 && zoneFormulas(k as ZoneKey).includes(sel)) on = Math.max(on, finalK * (k === "body" ? 0.12 : 0.7))
          zoneMats[k].forEach((m) => {
            m.emissiveIntensity = on * 0.8
          })
        }
        if (holo) {
          holo.fill.opacity = act === "engine" ? 0.18 + 0.12 * pulse : 0
          holo.line.opacity = act === "engine" ? 0.9 : 0
        }
        ring.material.opacity = 0.15 + 0.4 * finalK
        const si = act && finalK <= 0.3 ? STEPS.indexOf(act) : -1
        if (si !== lastStep) {
          lastStep = si
          setStep(si)
          if (act) noteZone(act)
        }
        const hot = hotRef.current
        if (hot) {
          const anchor = act ? zoneAnchor[act] : null
          if (anchor) {
            tmp.copy(anchor)
            car.localToWorld(tmp)
            tmp.project(cam)
            const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1
            hot.style.opacity = vis ? "1" : "0"
            hot.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * cv!.clientWidth}px,${(-tmp.y * 0.5 + 0.5) * cv!.clientHeight}px)`
          } else hot.style.opacity = "0"
        }
        const hero = heroRef.current
        if (hero) {
          hero.style.opacity = String(1 - clamp(kf / 0.45))
          hero.style.transform = `translateY(${-40 * clamp(kf / 0.45)}px)`
          hero.style.pointerEvents = kf < 0.3 ? "auto" : "none"
        }
        if (finalRef.current) finalRef.current.style.opacity = String(finalK)
        if (finalK > 0.5 !== lastFinal) {
          lastFinal = finalK > 0.5
          setFinalOn(lastFinal)
        }
        if (ringValRef.current) ringValRef.current.textContent = String(Math.round(cur * 100))
        if (ringArcRef.current) ringArcRef.current.style.strokeDashoffset = String(194.8 * (1 - cur))
        if (barRef.current) barRef.current.style.width = `${cur * 100}%`
        const W0 = cv!.clientWidth
        const H0 = cv!.clientHeight
        const lift = W0 < 700 ? 0.13 * (1 - clamp(kf / 0.7)) : 0
        // Mobile : la carte de zone occupe le bas de l'écran. On recentre la vue
        // 3D dans l'espace libre AU-DESSUS de la carte, pour que la zone
        // éclairée reste visible (décalage progressif autour de chaque zone).
        let shift = 0
        const card = cardRef.current
        if (W0 < 700 && card && zoneW > 0) {
          const cardTop = card.getBoundingClientRect().top - cv!.getBoundingClientRect().top
          const freeCenter = (56 + cardTop) / 2
          shift = Math.max(0, H0 / 2 - freeCenter) * zoneW
        }
        const offY = shift - lift * H0
        if (Math.abs(offY) > 0.5) cam.setViewOffset(W0, H0, 0, offY, W0, H0)
        else if (cam.view?.enabled) cam.clearViewOffset()
        R.render(scene, cam)
      }

      return () => {
        window.removeEventListener("resize", size)
        window.removeEventListener("scroll", measure)
        visIo.disconnect()
        R.dispose()
      }
    }

    const isLite = liteDevice()
    setLite(isLite)
    let booted = false
    const bootOnce = () => {
      if (booted) return
      booted = true
      io.disconnect()
      boot()
    }
    launchRef.current = bootOnce
    const io = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting && !isLite) bootOnce()
      },
      { rootMargin: "100% 0px" },
    )
    if (!isLite) io.observe(section)
    return () => {
      disposed = true
      io.disconnect()
      if (raf) cancelAnimationFrame(raf)
      cleanupScene?.()
    }
  }, [])

  const chooseVeh = (v: VehicleKey) => {
    setVeh(v)
    try {
      window.localStorage.setItem("clz-veh", v)
    } catch {
      /* ignoré */
    }
  }

  const zone = step >= 0 ? STEPS[step] : null
  const z = zone ? JOURNEY_ZONES[zone] : null
  const zf = zone ? zoneFormulas(zone) : []
  const best = zf.filter((k) => k !== "diamond").slice(-1)[0] ?? null
  const fromFilm = journey.origin?.kind === "film" ? journey.origin.step : null
  const F = JOURNEY_FORMULAS[form]
  const price = F.formula.prices[veh]
  const formZones = ZONE_KEYS.filter((k) => zoneFormulas(k).includes(form))

  return (
    <section ref={sectionRef} id={CLZ_VISIT_ANCHOR} className={lite ? "v3 v3-is-lite" : "v3"} aria-label="Visite 3D : ce que chaque formule traite, zone par zone">
      <div className="v3-stage">
        <canvas ref={canvasRef} id="v3-gl" aria-hidden="true" />
        <div className="v3-vig" />
        {status && !lite && <div className="v3-load">{status}</div>}
        {lite && (
          <div className="v3-lite">
            <span className="clz-eyebrow">Visite 3D</span>
            <h2 className="clz-display clz-h2">
              Ce qu&apos;on traite, <span className="clz-accent">zone par zone.</span>
            </h2>
            <ul>
              {STEPS.map((k) => (
                <li key={k}>
                  <b>{JOURNEY_ZONES[k].name}</b>
                  {JOURNEY_ZONES[k].film && (
                    <button type="button" className="v3-link" onClick={() => goFilm(JOURNEY_ZONES[k].film!, { kind: "visit", zone: k })}>
                      Voir en vidéo
                    </button>
                  )}
                  <Link className="v3-link" href={zoneAction(k).href}>
                    {zoneAction(k).label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="row">
              {!failed && (
                <button
                  className="clz-btn clz-btn-primary"
                  type="button"
                  onClick={() => {
                    setLite(false)
                    launchRef.current?.()
                  }}
                >
                  Lancer la visite 3D
                </button>
              )}
              <a className="skip" href="#prestations">
                Voir les prestations
              </a>
            </div>
          </div>
        )}
        <div className="v3-intro" ref={heroRef}>
          <span className="clz-eyebrow">Visite 3D</span>
          <h2 className="clz-display clz-h2">
            Ce qu&apos;on traite, <span className="clz-accent">zone par zone.</span>
          </h2>
          <p>Faites défiler : on fait le tour de la voiture, on entre dans l&apos;habitacle, et chaque zone renvoie à la prestation en vidéo.</p>
          <div className="row">
            <button className="clz-btn clz-btn-primary" type="button" onClick={() => goVisit("body", null)}>
              Commencer la visite ↓
            </button>
            <a className="skip" href="#prestations">
              Passer la visite
            </a>
          </div>
        </div>
        <div className="v3-hot" ref={hotRef} aria-hidden="true">
          <i />
          <span>{z?.name}</span>
        </div>
        <div className="v3-ring" aria-hidden="true">
          <svg viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="31" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="2.5" />
            <circle ref={ringArcRef} cx="36" cy="36" r="31" fill="none" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="194.8" strokeDashoffset="194.8" />
          </svg>
          <b ref={ringValRef}>0</b>
          <small>% de la visite</small>
        </div>
        <ol className="v3-rail" aria-label="Zones de la visite">
          {STEPS.map((k, i) => (
            <li key={k} className={i === step ? "on" : undefined}>
              <button type="button" className="v3-link" style={{ color: "inherit" }} onClick={() => goVisit(k, journey.origin)}>
                {JOURNEY_ZONES[k].name}
              </button>
            </li>
          ))}
        </ol>

        <article ref={cardRef} key={zone ?? "none"} className={`v3-card clz-card ${z ? "in" : "off"}`} aria-live="polite">
          {z && zone && (
            <>
              {fromFilm && (
                <button type="button" className="v3-link v3-back" onClick={() => goFilm(fromFilm, null)}>
                  ← Retour à la vidéo
                </button>
              )}
              <span className="clz-rule" />
              <div className="v3-num">
                Zone {String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
              </div>
              <h3 className="clz-display clz-h3">{z.title}</h3>
              {z.description && <p className="v3-desc">{z.description}</p>}
              <ul className="v3-list">
                {zf.map((k) => (
                  <li key={k} className={k === "diamond" ? "dia" : undefined}>
                    <b>{JOURNEY_FORMULAS[k].name}</b>
                    <span>{z.formulas[k]}</span>
                  </li>
                ))}
                {z.options.map((o) => (
                  <li key={o.label}>
                    <b>Option</b>
                    <span>
                      {o.label} · {o.price}
                    </span>
                  </li>
                ))}
              </ul>
              {best && (
                <Link className="v3-more" href={JOURNEY_FORMULAS[best].href}>
                  Voir la formule {JOURNEY_FORMULAS[best].full} →
                </Link>
              )}
              <div className="v3-actions">
                {z.film && (
                  <button type="button" className="clz-btn" onClick={() => goFilm(z.film!, { kind: "visit", zone })}>
                    ▶ Voir la prestation en vidéo
                  </button>
                )}
                <Link className="clz-btn clz-btn-primary" href={zoneAction(zone).href}>
                  {zoneAction(zone).label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </>
          )}
        </article>

        <div className="v3-final" ref={finalRef} style={{ pointerEvents: finalOn ? "auto" : "none" }} aria-hidden={!finalOn}>
          <h2 className="clz-display clz-h2">
            Choisissez <span className="clz-accent">votre formule.</span>
          </h2>
          {FORM_GROUPS.map((g) => (
            <div className="v3-fgroup" key={g.side}>
              <span>{g.label}</span>
              <div className="forms" role="group" aria-label={`Formules ${g.label.toLowerCase()}`}>
                {(Object.keys(JOURNEY_FORMULAS) as FormulaRef[])
                  .filter((k) => JOURNEY_FORMULAS[k].side === g.side)
                  .map((k) => (
                    <button key={k} type="button" aria-pressed={form === k} tabIndex={finalOn ? 0 : -1} onClick={() => setForm(k)}>
                      {JOURNEY_FORMULAS[k].name}
                    </button>
                  ))}
              </div>
            </div>
          ))}
          <div className="v3-veh" role="group" aria-label="Type de véhicule">
            {VEHICLES.map((v) => (
              <button key={v.key} type="button" aria-pressed={veh === v.key} tabIndex={finalOn ? 0 : -1} onClick={() => chooseVeh(v.key)}>
                {v.label}
              </button>
            ))}
          </div>
          <div className="v3-fbox">
            <div className="pr">{price == null ? "Sur devis" : `${price} €`}</div>
            <div className="tx">
              <b>{F.full}</b>
              <div className="v3-zones" aria-label="Zones traitées">
                {formZones.map((k) => (
                  <button key={k} type="button" tabIndex={finalOn ? 0 : -1} onClick={() => goVisit(k, { kind: "visit", zone: "final" })}>
                    {JOURNEY_ZONES[k].name}
                  </button>
                ))}
              </div>
              {F.note && <span className="v3-opt">{F.note}</span>}
            </div>
            <button type="button" className="clz-btn" tabIndex={finalOn ? 0 : -1} onClick={() => goFilm(F.film, { kind: "visit", zone: "final" })}>
              ▶ En vidéo
            </button>
            <Link className="clz-btn clz-btn-primary" href={F.href} tabIndex={finalOn ? 0 : -1}>
              Voir la formule <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="v3-bar">
          <i ref={barRef} />
        </div>
        <div className="v3-credit">
          Modèle 3D :{" "}
          <a href="https://sketchfab.com/3d-models/porsche-911-with-interior-877b1bc1739f4a2bb65d62fd7ffd9f75" target="_blank" rel="noreferrer">
            n.brizitskaya
          </a>
          , CC BY 4.0
        </div>
      </div>
    </section>
  )
}
