# Shader demo performance notes

## Captured baseline

Source: Mia's browser/GPU telemetry screenshot after the Post effects tab was deployed.

### Frame pacing

| Window              |   Value |
| ------------------- | ------: |
| FPS, 0.5 s average  |    31.0 |
| FPS, 2 s average    |    30.7 |
| FPS, 10 s average   |    35.9 |
| Frame-time RMS, 2 s | 33.8 ms |

### GPU timing

| Window            |    Value |
| ----------------- | -------: |
| GPU, 1 s average  | 168.8 ms |
| GPU, 5 s average  | 167.4 ms |
| GPU, 30 s average | 144.1 ms |
| GPU RMS, 5 s      | 170.0 ms |

### Stable 5 s stage breakdown

| Stage           |         Time | Share of measured GPU total |
| --------------- | -----------: | --------------------------: |
| Base field      |       9.2 ms |                        5.5% |
| Pre-blur passes |      58.7 ms |                       35.1% |
| Octave passes   |      77.2 ms |                       46.1% |
| Output/post     |      22.3 ms |                       13.3% |
| **Total**       | **167.4 ms** |                    **100%** |

## Initial observations — no changes made yet

- Stage two is the main cost: blur plus octaves account for 81.2% of measured GPU time.
- Octaves are the single largest bucket at 77.2 ms.
- Blur is close behind at 58.7 ms, so optimizing only the base generator cannot materially fix this profile.
- Output/post is now non-trivial at 22.3 ms and should be split into display, bloom extraction, and bloom blur before changing its implementation.
- Base field is only 9.2 ms and is currently the lowest-priority optimization target.
- Frame-time RMS is 33.8 ms, consistent with roughly 30 FPS and visible frame pacing pressure.
- The reported 167.4 ms summed GPU time does **not** directly match the roughly 33.8 ms frame time. Before treating absolute GPU milliseconds as wall-clock frame cost, verify timestamp units, pass accounting, and whether several submitted frames are concurrently in flight. The relative stage shares are still useful.

## Measurement needed before optimization

1. Record the exact canvas physical resolution, DPR, browser, GPU, active Post settings, and whether profiling itself changes FPS.
2. Split the `blur` bucket by octave.
3. Split the `oct` bucket by octave.
4. Split `out` into:
   - final display/color grade/camera pass
   - bloom extraction
   - bloom blur
5. Capture an A/B baseline with Post entirely neutral/off.
6. Capture an A/B baseline with every octave pre-blur radius set to zero.
7. Capture an A/B baseline with diffusion distance set to zero one octave at a time.
8. Compare timestamp totals against CPU frame intervals and queue submission behavior.

## Optimization priority, pending better measurements

1. Full-resolution octave texture sampling
2. Full-resolution pre-blur passes
3. Output/post breakdown, especially bloom
4. Base field

Do not retry the previously rolled-back combined optimization batch without isolated A/B measurements. Batched uniforms, direct `textureLoad`, and final-pass fusion together reduced Mia's measured performance from roughly 48 FPS to roughly 42 FPS on her GPU.
