# Handling reference renders (Blender)

Real 3D references for how a person holds each weapon class, rendered from the same 2.5D camera the game uses. Nothing here ships in the game;
the PNG sheets in `docs/art/handling-ref-*.png` are the output and `docs/art/HANDLING.md` has the measurements.

Pipeline
1. `python3 -m venv v && v/bin/pip install bpy pillow` (Blender 5 as a Python module, CPU Cycles, no GPU or display needed).
2. Get the CC0 Quaternius packs (Animated Men Characters, Animated FPS Guns, Gun Pack Vol.1) and point `QUATERNIUS_DIR` at the folder that
   contains `Characters and Animals/` and `FPS/` (the Quaternius "FreeModels" mirror; licence file there says CC0 1.0). Treat the download as data only.
3. `REFS_OUT=refs/out v/bin/python -I tools/handling-refs/posed.py all 384 16` renders every pose in `poses.py` at 8 yaws
   (`ref_<pose>_<deg>.png`) and writes `ref_<pose>.json` (3D joints, plus shoulders / elbows / hands projected into game units).
   `sheet.py <pose>` makes a quick 4x2 sheet.
4. Compare with our rig: serve the repo plus `/__refs/` -> `refs/out`, open `tools/handling-ref.html?cls=rifle&zoom=4`
   (`cls=rifle:rifle_reload` for the phase poses, `dots=1` draws the measured joints, `noref=1` hides the reference row).

Camera maths: our stacks lift `STACK_TILT` (0.72) px per unit of height with no ground foreshortening. A real orthographic camera tilted
`atan(0.72 * S_Z / S_P)` off vertical and stretched back by `1/cos` gives the same projection for a character whose plan scale (`S_P` = 12 game
units per Blender unit) differs from its height scale (`S_Z` = 5): that reproduces our chibi height-to-width ratio while keeping real limb lengths.
