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
  AmbientLight,
  type BufferGeometry,
  BoxGeometry,
  Color,
  DirectionalLight,
  DodecahedronGeometry,
  IcosahedronGeometry,
  Mesh,
  MeshPhongMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  type Texture,
  TorusGeometry,
  TorusKnotGeometry,
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

function buildScene(aspect: number) {
  const scene = new Scene()
  scene.background = new Color(0x030014)

  const camera = new PerspectiveCamera(60, aspect, 0.1, 100)
  camera.position.set(0, 2, 6)
  camera.lookAt(0, 0, 0)

  scene.add(new AmbientLight(0xffffff, 0.6))

  const warm = new DirectionalLight(0xff6b35, 2.1)
  warm.position.set(5, 5, 4)
  scene.add(warm)

  const cool = new DirectionalLight(0x45a3ff, 1.8)
  cool.position.set(-5, 2, -3)
  scene.add(cool)

  const pointLight = new PointLight(0xff35ed, 18, 12, 1.5)
  scene.add(pointLight)

  const floorTexture = TextureUtils.createCheckerboard(256, new Color(0x18073d), new Color(0x071b33), 16)
  floorTexture.needsUpdate = true
  const floorGeometry = new PlaneGeometry(13, 12)
  const floorMaterial = new MeshPhongMaterial({ map: floorTexture, color: 0x7060aa, shininess: 55, specular: 0x48ddff })
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, -2.15, -1)
  scene.add(floor)

  const geometries: ArcadeState["geometries"] = [
    new TorusKnotGeometry(0.48, 0.16, 128, 16),
    new DodecahedronGeometry(0.62, 1),
    new TorusGeometry(0.52, 0.18, 24, 48),
    new BoxGeometry(0.85, 0.85, 0.85, 2, 2, 2),
    new IcosahedronGeometry(0.92, 2),
  ]
  const colors = [0xff2bd6, 0x28f7fe, 0xffc857, 0x7cff6b, 0x8a5cff]
  const materials = colors.map(
    (color) =>
      new MeshPhongMaterial({
        color,
        emissive: new Color(color).multiplyScalar(0.08),
        shininess: 110,
        specular: 0xffffff,
      }),
  )

  const placements = [
    [-2.8, 1.45, -1.5],
    [0, 1.55, -2.6],
    [2.8, 1.4, -1.8],
    [-3, 0, -2.5],
    [3, 0, -2.1],
    [-2.7, -1.35, -0.8],
    [0, -1.45, -2.2],
    [2.7, -1.3, -1.2],
  ] as const
  const meshes: Mesh[] = []

  placements.forEach(([x, y, z], index) => {
    const mesh = new Mesh(geometries[index % 4], materials[index % 4])
    mesh.position.set(x, y, z)
    mesh.rotation.set(index * 0.4, index * 0.7, 0)
    scene.add(mesh)
    meshes.push(mesh)
  })

  const hero = new Mesh(geometries[4], materials[4])
  hero.position.set(0, 0, 0.7)
  scene.add(hero)
  meshes.push(hero)

  return {
    scene,
    camera,
    pointLight,
    meshes,
    geometries: [...geometries, floorGeometry],
    materials: [...materials, floorMaterial],
    textures: [floorTexture],
  }
}

function showWebGpuFallback(renderer: CliRenderer): void {
  renderer.setBackgroundColor("#09051A")
  addLabel(renderer, "fallback-title", "3D TERMINAL ARCADE", 3, "#FF4FDE")
  addLabel(renderer, "fallback-message", "WebGPU unavailable - run with Bun and bun-webgpu", 6, "#FFD166")
  addLabel(renderer, "fallback-help", "Requires Bun >= 1.3 and a WebGPU-capable host.", 8, "#9BA7C0")
}

export async function run(renderer: CliRenderer): Promise<void> {
  renderer.start()
  renderer.setBackgroundColor("#030014")

  const title = addLabel(renderer, "arcade-title", "★ 3D TERMINAL ARCADE — Definitely 3D ★", 0, "#FF5CE1")
  const status = addLabel(renderer, "arcade-status", "LIVE  |  9 OBJECTS  |  WEBGPU  |  GPU SUPERSAMPLING", 1, "#55F6FF")
  const controls = addLabel(
    renderer,
    "arcade-controls",
    "WS↑↓ AD/QE←→ ZX zoom | Space pause | P shot | U SS | O algo | Shift+D stats | R reset | Esc quit  — enlarge terminal = sharper",
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

  const engine = new ThreeCliRenderer(renderer, {
    width: framebuffer.width,
    height: framebuffer.height,
    focalLength: 8,
    backgroundColor: RGBA.fromInts(3, 0, 20, 255),
    superSample: SuperSampleType.GPU,
    alpha: false,
    autoResize: false,
  })

  try {
    await engine.init()
    // PRE_SQUEEZED fuses horizontal sub-pixels before quadrant pick — visibly
    // less stair-step on diagonal edges than STANDARD at same 2× cost.
    // Press 'O' to flip back to STANDARD for A/B.
    try {
      engine.setSuperSampleAlgorithm(SuperSampleAlgorithm.PRE_SQUEEZED)
    } catch {}
    // Help diagnose pixelation: small terminals are the #1 cause.
    if (renderer.terminalWidth < 100 || renderer.terminalHeight < 30) {
      status.content = `LIVE | ${renderer.terminalWidth}×${renderer.terminalHeight} — enlarge terminal for sharper 3D (120×40 ideal) | GPU SS PRE_SQUEEZED`
    } else {
      status.content = `LIVE | 9 OBJECTS | ${renderer.terminalWidth}×${renderer.terminalHeight} | GPU SS PRE_SQUEEZED`
    }
  } catch (error) {
    engine.destroy()
    renderer.root.remove(framebuffer)
    title.content = "* 3D TERMINAL ARCADE *"
    status.content = "WEBGPU INITIALIZATION FAILED"
    controls.content = "Esc or Ctrl+C to exit"
    showWebGpuFallback(renderer)
    console.error("WebGPU unavailable:", error)
    return
  }

  const { scene, camera, pointLight, meshes, geometries, materials, textures } = buildScene(engine.aspectRatio)
  engine.setActiveCamera(camera)

  let elapsed = 0
  let paused = false
  let yaw = 0
  let debugStats = false

  const updateCamera = () => {
    const radius = Math.max(2.8, Math.hypot(camera.position.x, camera.position.z))
    camera.position.x = Math.sin(yaw) * radius
    camera.position.z = Math.cos(yaw) * radius
    camera.lookAt(0, 0, 0)
  }

  // Auto-orbit runs every frame (yaw += delta*0.055). Manual left/right must go
  // through yaw, not translateX, otherwise the next updateCamera() overwrites
  // the X/Z you just set — that's why WS (Y) visibly moved but AD didn't.
  const keyHandler = (key: KeyEvent) => {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      destroy(renderer)
      renderer.destroy()
      return
    }
    const n = key.name.toLowerCase()
    if (key.name === "space") {
      paused = !paused
      status.content = `${paused ? "PAUSED" : "LIVE"}  |  9 OBJECTS  |  WEBGPU  |  Space to ${paused ? "resume" : "pause"}`
    } else if (n === "w" || key.name === "up") camera.translateY(0.35)
    else if (n === "s" || key.name === "down") camera.translateY(-0.35)
    // AD and QE are intentionally the same axis (horizontal orbit) so every
    // left/right key does something visible and survives auto-orbit. AD is
    // the primary WASD orbit (bigger step), QE is the fine adjust.
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
    } else if (n === "z") camera.translateZ(0.35)
    else if (n === "x") camera.translateZ(-0.35)
    else if (key.name === "r") {
      yaw = 0
      camera.position.set(0, 2, 6)
      camera.lookAt(0, 0, 0)
    } else if (key.name === "u") {
      engine.toggleSuperSampling()
      const mode = (engine as unknown as { superSample?: string }).superSample ?? "toggled"
      status.content = `LIVE | SS ${String(mode).toUpperCase()} | Press U: GPU→CPU→OFF, O: algo toggle`
    } else if (n === "o") {
      try {
        const cur = engine.getSuperSampleAlgorithm()
        const next =
          cur === SuperSampleAlgorithm.PRE_SQUEEZED
            ? SuperSampleAlgorithm.STANDARD
            : SuperSampleAlgorithm.PRE_SQUEEZED
        engine.setSuperSampleAlgorithm(next)
        status.content = `LIVE | SS ALGO ${next === 0 ? "STANDARD" : "PRE_SQUEEZED"} | O to toggle, U for GPU/CPU/OFF`
      } catch {
        status.content = "LIVE | SS algo toggle unavailable"
      }
    } else if (key.name === "d" && key.shift) {
      debugStats = !debugStats
      engine.toggleDebugStats()
      status.content = `LIVE  |  RENDER STATS ${debugStats ? "ON" : "OFF"}  |  Shift+D to toggle`
    } else if (key.name === "p") {
      const directory = "screenshots"
      void Bun.$`mkdir -p ${directory}`.then(() => engine.saveToFile(`${directory}/arcade-${Date.now()}.png`))
      status.content = "SCREENSHOT SAVED  |  screenshots/arcade-<timestamp>.png"
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
        mesh.rotation.x += delta * (0.18 + index * 0.045)
        mesh.rotation.y += delta * (0.32 + index * 0.06)
        mesh.position.y += Math.sin(elapsed * 1.2 + index) * delta * 0.08
      })
      pointLight.position.set(Math.sin(elapsed * 0.9) * 4, 1.5 + Math.sin(elapsed * 1.7), Math.cos(elapsed * 0.9) * 4)
      yaw += delta * 0.055
      updateCamera()
    }

    framebuffer.frameBuffer.clear(RGBA.fromInts(3, 0, 20, 255))
    await engine.drawScene(scene, framebuffer.frameBuffer, delta)
  })

  arcadeState = { engine, framebuffer, keyHandler, resizeHandler, geometries, materials, textures }
}

export function destroy(renderer: CliRenderer): void {
  if (!arcadeState) return
  renderer.clearFrameCallbacks()
  renderer.keyInput.off("keypress", arcadeState.keyHandler)
  renderer.off("resize", arcadeState.resizeHandler)
  arcadeState.geometries.forEach((geometry) => geometry.dispose())
  arcadeState.materials.forEach((material) => material.dispose())
  arcadeState.textures.forEach((texture) => texture.dispose())
  arcadeState.engine.destroy()
  renderer.root.remove(arcadeState.framebuffer)
  arcadeState = null
}

if (import.meta.main) {
  const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 60 })
  await run(renderer)
}
