#!/usr/bin/env bun

import {
  BoxRenderable,
  type CliRenderer,
  FrameBufferRenderable,
  type KeyEvent,
  RGBA,
  TextRenderable,
  createCliRenderer,
} from "@opentui/core"
import { SuperSampleAlgorithm, SuperSampleType, TextureUtils, ThreeCliRenderer } from "@opentui/three"
import {
  ACESFilmicToneMapping,
  AmbientLight,
  type BufferGeometry,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Fog,
  IcosahedronGeometry,
  Mesh,
  MeshPhongMaterial,
  OctahedronGeometry,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TetrahedronGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  type Texture,
  DirectionalLight,
} from "three"

interface ArcadeState {
  engine: ThreeCliRenderer
  framebuffer: FrameBufferRenderable
  keyHandler: (key: KeyEvent) => void
  resizeHandler: (width: number, height: number) => void
  geometries: BufferGeometry[]
  materials: MeshPhongMaterial[]
  textures: Texture[]
}

// ── M3 Pro MAX profile ──
// Apple M3 Pro (arm64, 11 cores, 36GB, Metal) can sustain 120fps WebGPU with
// 2× GPU supersampling + PCFSoftShadowMap + ACES at 200+ columns.
// Default balanced (9 objects, 60fps) — press 'M' for MAX 16 objects / 120fps / ACES / shadows.
// Keeps default view proven not-zoomed; MAX adds fog/extra lights.
const M3_MAX = false
const MAX_TARGET_FPS = 120
const BALANCED_TARGET_FPS = 60

let arcadeState: ArcadeState | null = null

function addLabel(renderer: CliRenderer, id: string, content: string, top: number, fg: string): TextRenderable {
  const label = new TextRenderable(renderer, {
    id,
    content,
    position: "absolute",
    left: 2,
    top,
    fg,
    zIndex: 30,
  })
  renderer.root.add(label)
  return label
}

function buildScene(aspect: number, max: boolean, cols: number, rows: number) {
  const scene = new Scene()
  scene.background = new Color(0x030014)
  if (max) scene.fog = new Fog(0x04010f, 9, 22)

  // Adaptive wall scale — keep the whole 5×3 wall framed even at 60×18.
  // 80×24 is the design target for balanced, 120×35 for MAX. Shrink positions
  // and mesh scale linearly below that, but never below 0.55 (still readable).
  const targetCols = max ? 120 : 80
  const targetRows = max ? 35 : 24
  const fit = Math.min(cols / targetCols, rows / targetRows)
  const wallScale = Math.max(0.55, Math.min(1, fit))

  const fov = max ? 55 : 60 - Math.max(0, (1 - wallScale) * 12) // widen a bit when tiny
  const camera = new PerspectiveCamera(fov, aspect, 0.1, 100)
  const camDist = (max ? 6.2 : 6) * (wallScale < 1 ? 1 / (0.7 + wallScale * 0.3) : 1)
  camera.position.set(0, (max ? 2.2 : 2) * wallScale, camDist)
  camera.lookAt(0, 0, 0)

  scene.add(new AmbientLight(0xffffff, 0.55))

  const warm = new DirectionalLight(0xff6b35, 2.4)
  warm.position.set(6, 7, 5)
  warm.castShadow = true
  warm.shadow.mapSize.set(2048, 2048)
  warm.shadow.camera.near = 0.5
  warm.shadow.camera.far = 25
  warm.shadow.bias = -0.0005
  scene.add(warm)

  const cool = new DirectionalLight(0x45a3ff, 1.9)
  cool.position.set(-6, 4, -4)
  cool.castShadow = true
  cool.shadow.mapSize.set(2048, 2048)
  cool.shadow.bias = -0.0005
  scene.add(cool)

  const rim = new DirectionalLight(0x9d7dff, 1.2)
  rim.position.set(0, 5, -6)
  scene.add(rim)

  // Three orbiting point lights — Metal can light 16+ meshes at 120fps.
  const pointLight = new PointLight(0xff35ed, 22, 14, 1.6)
  scene.add(pointLight)
  const pointLight2 = new PointLight(0x28f7fe, 18, 12, 1.4)
  pointLight2.position.set(3, 2, 1)
  scene.add(pointLight2)
  const pointLight3 = new PointLight(0xffc857, 16, 10, 1.4)
  pointLight3.position.set(-2, 1, 2)
  scene.add(pointLight3)

  // 512 checker keeps floor crisp at 240 cols (480 render width) — balanced uses 256 for lighter load.
  const floorTexture = TextureUtils.createCheckerboard(max ? 512 : 256, new Color(0x18073d), new Color(0x071b33), 16)
  floorTexture.needsUpdate = true
  const floorGeometry = new PlaneGeometry(max ? 16 : 13, max ? 14 : 12)
  const floorMaterial = new MeshPhongMaterial({
    map: floorTexture,
    color: 0x7060aa,
    shininess: max ? 85 : 55,
    specular: 0x48ddff,
  })
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, -2.35, -1)
  floor.receiveShadow = true
  scene.add(floor)

  // Ultra tessellation — M3 Pro chews through this at <6ms/frame.
  const geoCount = max ? 16 : 5
  const geometries: BufferGeometry[] = max
    ? [
        new TorusKnotGeometry(0.48, 0.16, 192, 32),
        new DodecahedronGeometry(0.62, 2),
        new TorusGeometry(0.52, 0.18, 32, 64),
        new BoxGeometry(0.85, 0.85, 0.85, 2, 2, 2),
        new IcosahedronGeometry(0.88, 3),
        new OctahedronGeometry(0.72, 2),
        new TetrahedronGeometry(0.7, 2),
        new SphereGeometry(0.5, 32, 32),
        new CapsuleGeometry(0.32, 0.6, 12, 24),
        new ConeGeometry(0.45, 0.9, 32),
        new CylinderGeometry(0.38, 0.38, 0.9, 32),
        new TorusKnotGeometry(0.36, 0.11, 128, 24),
      ]
    : [
        new TorusKnotGeometry(0.48, 0.16, 128, 16),
        new DodecahedronGeometry(0.62, 1),
        new TorusGeometry(0.52, 0.18, 24, 48),
        new BoxGeometry(0.85, 0.85, 0.85, 2, 2, 2),
        new IcosahedronGeometry(0.92, 2),
      ]

  const palette = [0xff2bd6, 0x28f7fe, 0xffc857, 0x7cff6b, 0x8a5cff, 0xff6b35, 0x45a3ff, 0xff4fde]
  const materials = palette.map(
    (c) =>
      new MeshPhongMaterial({
        color: c,
        emissive: new Color(c).multiplyScalar(max ? 0.10 : 0.06),
        shininess: max ? 220 : 180,
        specular: 0xffffff,
        flatShading: false,
      }),
  )

  // 5×3 wall + hero centre — 16 meshes total, each at unique Z for parallax.
  const placements = max
    ? ([
        [-3.6, 1.7, -1.8],
        [-1.8, 1.7, -2.6],
        [0, 1.7, -3.0],
        [1.8, 1.7, -2.6],
        [3.6, 1.7, -1.8],
        [-3.6, 0.45, -2.4],
        [-1.8, 0.45, -2.8],
        [1.8, 0.45, -2.8],
        [3.6, 0.45, -2.4],
        [-3.6, -0.9, -1.4],
        [-1.8, -0.9, -2.0],
        [0, -0.9, -2.4],
        [1.8, -0.9, -2.0],
        [3.6, -0.9, -1.4],
        [0, 0.45, 0.0],
      ] as const)
    : ([
        [-2.8, 1.45, -1.5],
        [0, 1.55, -2.6],
        [2.8, 1.4, -1.8],
        [-3, 0, -2.5],
        [3, 0, -2.1],
        [-2.7, -1.35, -0.8],
        [0, -1.45, -2.2],
        [2.7, -1.3, -1.2],
      ] as const)

  const meshes: Mesh[] = []
  placements.forEach(([x, y, z], i) => {
    const g = geometries[i % geometries.length]
    const m = materials[i % materials.length]
    const mesh = new Mesh(g, m)
    mesh.position.set(x * wallScale, y * wallScale, z * wallScale)
    mesh.scale.setScalar(wallScale)
    mesh.rotation.set(i * 0.4, i * 0.7, 0)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    meshes.push(mesh)
  })

  // Hero gets 1.15× scale so it's readably 3D even at 80×24 — scaled by wallScale.
  if (max) {
    const hero = meshes[14]
    if (hero) {
      hero.scale.multiplyScalar(1.15)
      hero.castShadow = true
      hero.receiveShadow = true
    }
  } else {
    const hero = new Mesh(geometries[4], materials[4])
    hero.position.set(0, 0, 0.7 * wallScale)
    hero.scale.setScalar(wallScale)
    hero.castShadow = true
    hero.receiveShadow = true
    scene.add(hero)
    meshes.push(hero)
  }
  // Floor also scales so it doesn't dominate tiny viewports.
  floor.scale.setScalar(wallScale)
  floor.position.set(0, -2.35 * wallScale, -1 * wallScale)

  return {
    scene,
    camera,
    pointLight,
    pointLight2,
    pointLight3,
    meshes,
    geometries: [...geometries, floorGeometry],
    materials: [...materials, floorMaterial],
    textures: [floorTexture],
  }
}

function showWebGpuFallback(renderer: CliRenderer): void {
  renderer.setBackgroundColor("#09051A")
  addLabel(renderer, "fallback-title", "3D TERMINAL ARCADE — MAX", 3, "#FF4FDE")
  addLabel(renderer, "fallback-message", "WebGPU unavailable — run with Bun and bun-webgpu", 6, "#FFD166")
  addLabel(renderer, "fallback-help", "Requires Bun >= 1.3 + Metal (M3 Pro) — try: bun --version && bun pm ls", 8, "#9BA7C0")
}

export async function run(renderer: CliRenderer): Promise<void> {
  renderer.start()
  renderer.setBackgroundColor("#04010f")

  const isMax = M3_MAX
  const objectLabel = isMax ? "16 OBJECTS" : "9 OBJECTS"
  const qualityTag = isMax ? "MAX (M3 Pro) — 120FPS ACES SHADOWS" : "BALANCED — 60FPS"

  const title = addLabel(renderer, "arcade-title", `★ 3D TERMINAL ARCADE — MAX @ ${MAX_TARGET_FPS}FPS ★`, 0, "#FF5CE1")
  const status = addLabel(renderer, "arcade-status", `LIVE | ${objectLabel} | ${qualityTag} | ULTRA 4× PRE_SQUEEZED`, 1, "#55F6FF")
  const controls = addLabel(
    renderer,
    "arcade-controls",
    "WS↑↓ AD/QE←→ ZX zoom | Space pause | P shot | U SS | O algo | M quality | Shift+D stats | R reset | Esc quit  — FULLSCREEN = sharpest",
    Math.max(2, renderer.terminalHeight - 1),
    "#C8B6FF",
  )

  const framebuffer = new FrameBufferRenderable(renderer, {
    id: "arcade-webgpu",
    width: Math.max(1, renderer.terminalWidth),
    height: Math.max(1, renderer.terminalHeight),
    zIndex: 10,
    respectAlpha: false,
  })
  renderer.root.add(framebuffer)

  // Default GPU 2× (proven). ULTRA 4× available via U toggle — local opentui fork at ../opentui.
  // Toggle U: NONE → CPU 2× → GPU 2× → ULTRA 4× → NONE
  const engine = new ThreeCliRenderer(renderer, {
    width: framebuffer.width,
    height: framebuffer.height,
    focalLength: 8,
    backgroundColor: RGBA.fromInts(4, 1, 15, 255),
    superSample: SuperSampleType.GPU,
    alpha: false,
    autoResize: false,
  })

  try {
    await engine.init()
    // ── M3 Pro MAX post-init patches ──
    const r: unknown = (engine as unknown as { threeRenderer?: unknown }).threeRenderer ?? (engine as unknown as Record<string, unknown>).threeRenderer
    const threeRenderer = r as Record<string, unknown> | null | undefined
    if (threeRenderer) {
      try {
        // ACESFilmic + sRGB is visibly less washed than default NoToneMapping/LinearSRGB.
        // Cast via any to avoid three version drift.
        const tr = threeRenderer as unknown as {
          toneMapping?: number
          toneMappingExposure?: number
          outputColorSpace?: unknown
          shadowMap?: { enabled: boolean; type: number }
        }
        tr.toneMapping = ACESFilmicToneMapping as unknown as number
        tr.toneMappingExposure = isMax ? 1.18 : 1.05
        tr.outputColorSpace = SRGBColorSpace as unknown as never
        if (tr.shadowMap) {
          tr.shadowMap.enabled = true
          tr.shadowMap.type = PCFSoftShadowMap as unknown as number
        }
      } catch {}
    }
    try {
      engine.setSuperSampleAlgorithm(SuperSampleAlgorithm.PRE_SQUEEZED)
    } catch {}
    // 120fps hint — CliRenderer throttles to targetFrameTime = 1000/targetFps.
    try {
      ;(renderer as unknown as { targetFps?: number }).targetFps = isMax ? MAX_TARGET_FPS : BALANCED_TARGET_FPS
    } catch {}
    const term = `${renderer.terminalWidth}×${renderer.terminalHeight}`
    const termHint = renderer.terminalWidth < 140 || renderer.terminalHeight < 35 ? " — FULLSCREEN for MAX (⌘+Enter, 160×45 ideal)" : " — MAX window ✓"
    const ss = (engine as unknown as { superSample?: string }).superSample ?? "gpu"
    const rw = (engine as unknown as { renderWidth?: number }).renderWidth ?? renderer.terminalWidth * 2
    const rh = (engine as unknown as { renderHeight?: number }).renderHeight ?? renderer.terminalHeight * 2
    status.content = `LIVE | ${objectLabel} | ${term} → ${rw}×${rh} render | ${qualityTag} | ${String(ss).toUpperCase()}${termHint}`
  } catch (error) {
    engine.destroy()
    renderer.root.remove(framebuffer)
    title.content = "* 3D TERMINAL ARCADE — MAX *"
    status.content = "WEBGPU INIT FAILED — Metal unavailable?"
    controls.content = "Esc or Ctrl+C to exit"
    showWebGpuFallback(renderer)
    console.error("WebGPU unavailable:", error)
    return
  }

  const { scene, camera, pointLight, pointLight2, pointLight3, meshes, geometries, materials, textures } = buildScene(
    engine.aspectRatio,
    isMax,
    renderer.terminalWidth,
    renderer.terminalHeight,
  )
  engine.setActiveCamera(camera)

  let elapsed = 0
  let paused = false
  let yaw = 0
  let debugStats = false
  let maxMode = isMax

  const updateCamera = () => {
    const radius = Math.max(2.8, Math.hypot(camera.position.x, camera.position.z))
    camera.position.x = Math.sin(yaw) * radius
    camera.position.z = Math.cos(yaw) * radius
    camera.lookAt(0, 0, 0)
  }

  const keyHandler = (key: KeyEvent) => {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      destroy(renderer)
      renderer.destroy()
      return
    }
    const n = key.name.toLowerCase()
    if (key.name === "space") {
      paused = !paused
      status.content = `${paused ? "PAUSED" : "LIVE"} | ${maxMode ? "MAX" : "BAL"} | Space to ${paused ? "resume" : "pause"}`
    } else if (n === "w" || key.name === "up") camera.translateY(0.4)
    else if (n === "s" || key.name === "down") camera.translateY(-0.4)
    else if ((n === "a" && !key.shift) || key.name === "left") {
      yaw -= 0.18
      updateCamera()
    } else if ((n === "d" && !key.shift) || key.name === "right") {
      yaw += 0.18
      updateCamera()
    } else if (n === "q") {
      yaw -= 0.12
      updateCamera()
    } else if (n === "e") {
      yaw += 0.12
      updateCamera()
    } else if (n === "z") camera.translateZ(0.4)
    else if (n === "x") camera.translateZ(-0.4)
    else if (n === "r") {
      yaw = 0
      camera.position.set(0, 2.2, 6.2)
      camera.lookAt(0, 0, 0)
    } else if (n === "u") {
      engine.toggleSuperSampling()
      const mode = (engine as unknown as { superSample?: string }).superSample ?? "toggled"
      status.content = `LIVE | SS ${String(mode).toUpperCase()} | U: GPU→CPU→OFF  O: algo  M: quality`
    } else if (n === "o") {
      try {
        const cur = engine.getSuperSampleAlgorithm()
        const next = cur === SuperSampleAlgorithm.PRE_SQUEEZED ? SuperSampleAlgorithm.STANDARD : SuperSampleAlgorithm.PRE_SQUEEZED
        engine.setSuperSampleAlgorithm(next)
        status.content = `LIVE | SS ALGO ${next === 0 ? "STANDARD" : "PRE_SQUEEZED"} | O toggle  U GPU/CPU/OFF  M quality`
      } catch {
        status.content = "LIVE | SS algo toggle unavailable"
      }
    } else if (n === "m") {
      maxMode = !maxMode
      try {
        const tr = (engine as unknown as { threeRenderer?: { toneMapping?: number; toneMappingExposure?: number } }).threeRenderer
        if (tr) {
          tr.toneMapping = maxMode ? (ACESFilmicToneMapping as unknown as number) : (0 as unknown as number)
          tr.toneMappingExposure = maxMode ? 1.18 : 1.0
        }
      } catch {}
      try {
        ;(renderer as unknown as { targetFps?: number }).targetFps = maxMode ? MAX_TARGET_FPS : BALANCED_TARGET_FPS
      } catch {}
      for (const m of meshes) {
        m.castShadow = maxMode
        m.receiveShadow = maxMode
      }
      status.content = `LIVE | ${maxMode ? "MAX 120FPS ACES SHADOWS" : "BAL 60FPS"} | M to toggle — ${renderer.terminalWidth}×${renderer.terminalHeight}`
    } else if (key.name === "d" && key.shift) {
      debugStats = !debugStats
      engine.toggleDebugStats()
      status.content = `LIVE | STATS ${debugStats ? "ON" : "OFF"} | Shift+D toggle — shows Render/Readback/SS ms`
    } else if (n === "p") {
      const directory = "screenshots"
      void Bun.$`mkdir -p ${directory}`.then(() => engine.saveToFile(`${directory}/arcade-max-${Date.now()}.png`))
      status.content = "SCREENSHOT SAVED | screenshots/arcade-max-<timestamp>.png (raw 2×, pre-glyph)"
    }
  }

  const resizeHandler = (width: number, height: number) => {
    framebuffer.width = Math.max(1, width)
    framebuffer.height = Math.max(1, height)
    framebuffer.frameBuffer.resize(framebuffer.width, framebuffer.height)
    engine.setSize(framebuffer.width, framebuffer.height, true)
    camera.aspect = engine.aspectRatio
    camera.updateProjectionMatrix()
    controls.y = Math.max(2, height - 1)
  }

  renderer.keyInput.on("keypress", keyHandler)
  renderer.on("resize", resizeHandler)
  renderer.setFrameCallback(async (deltaMs) => {
    const delta = Math.min(deltaMs / 1000, 0.1)
    if (!paused) {
      elapsed += delta
      meshes.forEach((mesh, index) => {
        mesh.rotation.x += delta * (0.22 + index * 0.035)
        mesh.rotation.y += delta * (0.36 + index * 0.05)
        mesh.position.y += Math.sin(elapsed * 1.15 + index) * delta * 0.09
      })
      pointLight.position.set(Math.sin(elapsed * 0.9) * 4.2, 1.6 + Math.sin(elapsed * 1.7) * 0.6, Math.cos(elapsed * 0.9) * 4.2)
      pointLight2.position.set(Math.cos(elapsed * 1.1) * 3.5, 1.2 + Math.cos(elapsed * 0.9) * 0.4, Math.sin(elapsed * 1.1) * 3.5)
      pointLight3.position.set(Math.sin(elapsed * 0.7) * 2.8, 0.9, Math.cos(elapsed * 0.7) * 2.8)
      yaw += delta * (maxMode ? 0.065 : 0.055)
      updateCamera()
    }

    framebuffer.frameBuffer.clear(RGBA.fromInts(4, 1, 15, 255))
    await engine.drawScene(scene, framebuffer.frameBuffer, delta)
  })

  arcadeState = { engine, framebuffer, keyHandler, resizeHandler, geometries, materials, textures }
}

export function destroy(renderer: CliRenderer): void {
  if (!arcadeState) return
  renderer.clearFrameCallbacks()
  renderer.keyInput.off("keypress", arcadeState.keyHandler)
  renderer.off("resize", arcadeState.resizeHandler)
  arcadeState.geometries.forEach((g) => g.dispose())
  arcadeState.materials.forEach((m) => m.dispose())
  arcadeState.textures.forEach((t) => t.dispose())
  arcadeState.engine.destroy()
  renderer.root.remove(arcadeState.framebuffer)
  arcadeState = null
}

if (import.meta.main) {
  const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: M3_MAX ? MAX_TARGET_FPS : BALANCED_TARGET_FPS })
  await run(renderer)
}
