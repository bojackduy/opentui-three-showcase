# Changelog

## 0.1.0 (2026-09-03) — Initial release

Initial publish of **@bojackduy/opentui-three-showcase** — 3D Terminal Arcade.

- Neon 3×3 arcade wall with real `THREE.PerspectiveCamera` and depth
- 9 `MeshPhongMaterial` meshes (TorusKnot, Dodecahedron, Torus, Box, Icosahedron) + checkerboard floor
- Lighting: Ambient + 2 Directional (warm/cool) + orbiting magenta PointLight
- `ThreeCliRenderer` + `FrameBufferRenderable` at 60 FPS via WebGPU (`bun-webgpu`)
- GPU/CPU/OFF supersampling cycle, orbit/strafe/dolly controls, pause, reset, stats, PNG export
- CLI bins: `opentui-three-showcase` + alias `three-terminal-showcase`
