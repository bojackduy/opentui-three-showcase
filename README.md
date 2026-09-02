# 3D Terminal Arcade

A neon 3x3 arcade wall rendered with real Three.js geometry, perspective, a checkerboard depth plane, and WebGPU lighting inside an OpenTUI terminal framebuffer.

## Run

Requirements: Bun 1.3 or newer, a WebGPU-capable system, and a true-color terminal.

```sh
bun install
bun run dev
```

The showcase is designed to remain usable at 80x24 and adapts to terminal resizes.

## Controls

- `W/A/S/D`: move the camera
- `Q/E`: orbit the camera
- `Z/X`: zoom
- `Space`: pause or resume animation
- `P`: save a PNG under `screenshots/`
- `U`: cycle GPU, CPU, and disabled supersampling
- `Shift+D`: toggle WebGPU render stats
- `R`: reset the camera
- `Esc` or `Ctrl+C`: exit

## Screenshot

Press `P` while the arcade is running. Screenshots are written to the local `screenshots/` directory. The output captures the WebGPU scene before terminal glyph conversion, making the Phong highlights, depth, and orbiting neon lights easy to inspect.

## Implementation

The app uses `ThreeCliRenderer` with a full-terminal `FrameBufferRenderable`. This explicit engine path allows WebGPU initialization to be awaited and failures to be replaced with a normal `TextRenderable` message instead of leaving a black screen.
