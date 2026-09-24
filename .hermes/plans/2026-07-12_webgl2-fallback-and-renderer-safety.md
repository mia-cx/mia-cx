# WebGL2 Fallback and Renderer Safety Implementation Plan

> **For Hermes:** implement task-by-task with TDD and verify each backend independently.

**Goal:** Keep WebGPU as the preferred renderer, add a Safari/older-browser WebGL2 fallback with the same artwork and settings, and prevent either backend from freezing a browser under excessive GPU load.

**Architecture:** Extract the renderer-facing lifecycle into a small backend interface, retain the existing WebGPU implementation, and add a WebGL2 multipass implementation using GLSL ES 3.00. Shared settings, pipeline planning, persistence, animation time, dynamic resolution policy, and telemetry remain backend-agnostic. Backend selection tries WebGPU first, falls back to WebGL2 on unavailability or initialization failure, and never silently retries a renderer in a crash loop.

**Tech Stack:** SvelteKit, TypeScript, WebGPU/WGSL, WebGL2/GLSL ES 3.00, Vitest, Playwright/manual Safari + Zen testing.

---

## Safety and scope decisions

- Treat the Zen freeze as a release-blocking workload-safety bug, not merely a Firefox quirk.
- Add safety controls before attempting full WebGL visual parity.
- WebGL2 fallback target is visual parity for the current canonical default pipeline first—not every dormant experimental effect on day one.
- Unsupported WebGL effects bypass explicitly and report their names; they must not silently render incorrect output.
- WebGPU remains primary. WebGL2 activates only when WebGPU is unavailable or initialization fails.
- Never use WebGL `finish()` or synchronous readbacks in the animation loop.
- Cap submission to one in-flight frame. If the previous frame has not completed, skip rather than queue more work.
- Start unknown devices conservatively, then raise quality only after proving headroom.

---

### Task 1: Add renderer backend contract and selection tests

**Files:**
- Create: `apps/shaderdemo/src/lib/render-backend.ts`
- Create: `apps/shaderdemo/src/lib/render-backend.test.ts`
- Modify: `apps/shaderdemo/src/routes/+page.svelte`
- Modify: `apps/shaderdemo/src/lib/renderer.ts`

**Steps:**
1. Define a shared backend interface covering `setOptions`, `setPaused`, `invalidate`, `destroy`, stats callbacks, device-loss callback, and backend identity.
2. Rename/export the existing renderer as the WebGPU backend without changing its behavior.
3. Add a selector that attempts WebGPU once, catches initialization/adapter/device errors, then attempts WebGL2.
4. Add tests for WebGPU success, WebGPU unavailable → WebGL2, WebGPU initialization failure → WebGL2, and both unavailable → readable unsupported message.
5. Ensure errors identify which backend failed without dumping opaque browser exceptions into the UI.
6. Run: `pnpm --filter @mia-cx/shaderdemo test`.

### Task 2: Put hard workload circuit breakers in WebGPU first

**Files:**
- Modify: `apps/shaderdemo/src/lib/renderer.ts`
- Modify: `apps/shaderdemo/src/lib/adaptive-resolution.ts`
- Modify: `apps/shaderdemo/src/lib/renderer.test.ts`
- Modify: `apps/shaderdemo/src/lib/adaptive-resolution.test.ts`

**Steps:**
1. Add a conservative startup scale for unknown hardware rather than submitting the full native-resolution canonical pipeline as the first workload.
2. Keep the 60 FPS presentation cap and 90 FPS/11.11ms processing target.
3. Track frame completion asynchronously with `queue.onSubmittedWorkDone()` and allow at most one unresolved submission; skip frames instead of building an unbounded GPU queue.
4. Add an emergency overload path: repeated GPU times above a severe threshold jump immediately toward the `0.125×` floor instead of waiting for long p99 windows.
5. Add a watchdog for repeated device-loss/out-of-memory/validation failures. Stop animation and show a recovery action; never auto-recreate in a loop.
6. Reset pending timing evidence safely after skipped frames, visibility changes, resize, pause, and backend recovery.
7. Add regressions proving overload lowers scale, a blocked submission skips work, recovery raises quality again, and no fallback uses vsync-contaminated rAF timing as GPU time.

### Task 3: Build minimal WebGL2 multipass infrastructure

**Files:**
- Create: `apps/shaderdemo/src/lib/webgl2-renderer.ts`
- Create: `apps/shaderdemo/src/lib/webgl2-renderer.test.ts`
- Create: `apps/shaderdemo/src/lib/glsl/shared.glsl.ts`
- Create: `apps/shaderdemo/src/lib/glsl/field.glsl.ts`
- Create: `apps/shaderdemo/src/lib/glsl/copy.glsl.ts`
- Create: `apps/shaderdemo/src/lib/glsl/present.glsl.ts`

**Steps:**
1. Acquire `webgl2` with `alpha: false`, `antialias: false`, and a conservative power preference.
2. Probe required extensions and render-target support (`EXT_color_buffer_float`, timer queries when available).
3. Build shader compile/link helpers that return complete GLSL diagnostics.
4. Implement fullscreen-triangle VAO, framebuffer/texture allocation, ping-pong targets, resize, cleanup, context-loss, and context-restoration handling.
5. Port the base field and present/AA passes to GLSL ES 3.00.
6. Start WebGL2 at a conservative internal scale and verify one frame renders before starting animation.
7. Test allocation cleanup, context loss, unsupported float target fallback, shader errors, and resize behavior.

### Task 4: Port canonical Colour pipeline

**Files:**
- Create: `apps/shaderdemo/src/lib/glsl/colour.glsl.ts`
- Create: `apps/shaderdemo/src/lib/glsl/lut.glsl.ts`
- Modify: `apps/shaderdemo/src/lib/webgl2-renderer.ts`
- Modify: `apps/shaderdemo/src/lib/colour-effects.test.ts`
- Modify/Create: WebGL renderer tests and golden fixtures

**Steps:**
1. Reuse existing CPU-composed high-depth adjustment LUT data.
2. Upload LUTs in the highest supported representation; document and test the fallback representation.
3. Port canonical RGB/HSL curve, levels, HSL, and colour-grade behavior.
4. Preserve literal order and neutral bypasses.
5. Compare deterministic WebGPU and WebGL2 frame captures within an explicit tolerance using the canonical settings and fixed seed/time.

### Task 5: Port canonical Post effects in literal order

**Files:**
- Create: `apps/shaderdemo/src/lib/glsl/post.glsl.ts`
- Create: `apps/shaderdemo/src/lib/glsl/god-rays.glsl.ts`
- Modify: `apps/shaderdemo/src/lib/webgl2-renderer.ts`
- Modify: `apps/shaderdemo/src/lib/pipeline.ts`
- Add: WebGL pipeline tests

**Steps:**
1. Port the effects enabled in the canonical preset first: God Rays, Bloom, Glow, Halation, and Chromatic Aberration.
2. Preserve source RGB, all 15 blend modes, signed God Rays direction, longitudinal falloff, threshold behavior, and effect-specific God Rays render scale.
3. Keep reduced-resolution God Rays and shared/reduced highlight blur where semantics permit.
4. Add an explicit WebGL support table for every Post effect.
5. Unsupported dormant effects bypass and surface `Unavailable in WebGL2`; do not map them to approximate unrelated math.
6. Add deterministic pixel comparisons for each canonical effect and blend mode.

### Task 6: Port the five Octaves

**Files:**
- Create: `apps/shaderdemo/src/lib/glsl/octave.glsl.ts`
- Create: `apps/shaderdemo/src/lib/glsl/blur.glsl.ts`
- Modify: `apps/shaderdemo/src/lib/webgl2-renderer.ts`
- Add: octave parity tests

**Steps:**
1. Port the five literal passes at `16, 8, 4, 2, 1px`.
2. Preserve pre-blur, optional pixelation, frame-varying electrical noise, Paint.NET-style Frosted Glass displacement, thresholding, exact zero bypass, and pause-freeze semantics.
3. Keep random fields deterministic for a fixed seed/frame while differing between rendered frames.
4. Compare fixed-frame WebGL2 output against the WebGPU reference within format-appropriate tolerance.

### Task 7: Add WebGL2 adaptive resolution without blocking

**Files:**
- Modify: `apps/shaderdemo/src/lib/webgl2-renderer.ts`
- Modify: `apps/shaderdemo/src/lib/adaptive-resolution.ts`
- Add: `apps/shaderdemo/src/lib/webgl2-timing.test.ts`

**Steps:**
1. Use `EXT_disjoint_timer_query_webgl2` when available, polling asynchronously and rejecting disjoint samples.
2. Feed valid GPU processing times into the same `1→2→…→512`, p99, bidirectional controller targeting 11.11ms.
3. If timer queries are unavailable, use only a conservative startup scale plus asynchronous submission/backpressure evidence; do not call CPU rAF duration “GPU time.”
4. Retain the 60 FPS presentation cap and one-in-flight-frame limit.
5. Label telemetry `WEBGL2` and distinguish measured GPU time from unavailable timing.

### Task 8: Backend-aware UI and export behavior

**Files:**
- Modify: `apps/shaderdemo/src/routes/+page.svelte`
- Modify: `apps/shaderdemo/src/lib/settings.ts`
- Modify: relevant Svelte/component tests

**Steps:**
1. Display active backend in telemetry, not as decorative page copy.
2. Disable unsupported WebGL2 effect controls with a plain `Unavailable in WebGL2` indication while preserving their settings/export data.
3. Keep import/export backend-neutral.
4. Add a manual retry/switch action after context/device loss.
5. Ensure WebGPU settings remain untouched after visiting through WebGL2.

### Task 9: Real-browser freeze and parity verification

**Files:**
- Update: `apps/shaderdemo/PERF.md`
- Update/create: browser QA notes under `apps/shaderdemo/`

**Steps:**
1. Run unit tests, lint, production build, and `git diff --check`.
2. Test WebGPU Chrome/Chromium on the MacBook internal display, external display, battery, and low-power mode.
3. Test Zen/Firefox with WebGPU enabled: verify no browser freeze, bounded queueing, emergency downscale, and device-loss recovery.
4. Test Safari without WebGPU: verify automatic WebGL2 fallback and canonical scene output.
5. Test Safari with WebGPU where available: verify WebGPU remains preferred.
6. Test context/device loss and restoration on both backends.
7. Record screenshots plus 30-second telemetry captures for each environment.
8. Keep PR #51 draft; deploy to `shaderdemo.mia.cx` only after local validation, then ask Mia and her friend to verify their actual devices.

## Acceptance criteria

- Safari lacking WebGPU renders the canonical scene through WebGL2 rather than showing the unsupported message.
- Zen/Firefox cannot accumulate an unbounded GPU workload; overload skips submissions and downscales instead of freezing the browser.
- Canonical output is recognizably equivalent across backends, with documented precision differences only.
- Current settings/export files work unchanged across both backends.
- Presentation never exceeds 60 FPS; adaptive quality targets an 11.11ms p99 GPU workload when measurable.
- WebGPU remains primary and loses no existing effects or controls.
- All automated tests, lint, build, pixel comparisons, and real-browser checks pass before deployment.
