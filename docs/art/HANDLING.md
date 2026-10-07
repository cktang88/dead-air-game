# Weapon handling rules

Implemented in `rig2d.js` (`GRIPS`, `humanoidPose`); per-gun grip points live on `GUN_ART` in `sprites2d.js` (`cls`, `trig`, `sup`, `bolt`) and are
turned into gun-space points by `gunGeometry()` in `models2d.js`. Sheets: `tools/stack-sheet.html?gun=<id>&rows=gun&zoom=4&cols=4&h=56&W=1800&H=2300`.
Images: `handling-<class>.png` (aim angles, recoil, walk/sprint, reload phases) and `handling-fight.png`.

## References and what they say

Real references, not just text: `tools/handling-refs/` poses a CC0 Quaternius man (Animated Men Characters) holding Quaternius guns (Animated FPS Guns,
Gun Pack Vol.1) with Blender IK, per weapon class, and renders 8 yaws through the same 2.5D camera as the game (orthographic, tilted `atan(0.72*5/12)`
and stretched back, light from `LIGHT`). `tools/handling-ref.html` puts the reference row above our rig row; `dots=1` overlays the measured joints.
Sheets: `handling-ref-<class>.png` (8 facings at 4x), `handling-ref-gameplay.png` (all classes at gameplay zoom 2), `handling-ref-phases.png`
(low-ready sprint and reload), `handling-ref-dots.png` (measured shoulders / elbows / hands marked).
Licences: all Quaternius CC0 (see CREDITS.md). Soldier.glb from three.js examples was downloaded but not used (Mixamo-derived, licence unclear).
No CC0 top-down 8-direction soldier sheet could be fetched (see "Gaps"), so the 2D side is marksmanship text plus 2.5D conventions:
* Marksmanship guides (SnipersHide threads on shoulder pocket and rear bag, Crate Club "how to hold an assault rifle / AR-15"): stock sits in the shoulder
  pocket where shoulder meets chest, cheek weld on the stock (head turned to the gun, not the gun to the head), support hand cups the handguard
  with the elbow under the gun, "handshake" grip pressure, traditional stance is bladed (about 45-90 degrees), modern is squarer; pistols use a two-handed
  isosceles (square, arms extended) or Weaver grip, sidearm sprint is one-handed or tucked to the chest.
* Top-down 2D shooter conventions (Hotline Miami, Nuclear Throne, Enter the Gungeon, Door Kickers, Running With Rifles): the gun is a separate layer
  pivoting at the hand/shoulder, the muzzle (not the sprite centre) is the bullet origin, the support hand sits at one consistent point on the forend.

### Measured from the 3D references (aim frame, plan units at 12 per Blender unit; our torso is wider, so use the ratios)

| class | blade | stock offset from the centre line (shoulder) | trigger hand | support hand | trigger elbow flare (out, fwd of shoulder) | support elbow |
| --- | --- | --- | --- | --- | --- | --- |
| pistol | 0 | on the centre line (isosceles) | 0.30 L | 0.36 L (wraps the grip) | +3, +7 | -2.7, +8 (symmetric diamond) |
| smg | 18 | 4.2 (shoulder 5.0) | 0.50 L | 0.80 L | +5, +5 | under the gun, nearly straight |
| rifle | 32 | 3.6 (4.3) | 0.40 L | 0.66 L | +5, +5 | under the gun, nearly straight |
| shotgun | 28 | 3.6 (4.6) | 0.34 L | 0.68 L (pump) | +6, +4 | under the gun |
| sniper | 38 | 3.5 (4.0) | 0.37 L | 0.54 L | +4, +6 | under the gun |
| amr | 42 | 4.0 (3.7) | 0.36 L | 0.50 L | +0, +8 | under the gun |
| launcher | 36 | 3.8 (4.1) | 0.45 L | 0.66 L | +6, +5 | -1, +8 |
| low-ready sprint | 6 | 2.1 (5.3), stock still in the pocket, muzzle dipped and canted toward the SUPPORT side | 0.35 L | 0.60 L | +1, +5 | - |
| reload | 34 | 3.6, gun canted toward the actor's right | 0.39 L | magwell (0.33 L, hanging 0.5 below the receiver) | +6, +3 | - |

Per facing (from the projected joints): each arm stays 91-107% of its true length on screen at every facing, so arms are never foreshortened away;
the hands stay at least 9-10 units (reference head is smaller than ours) from the head centre even aiming straight up; the support hand is the one nearer
the camera (draws over the trigger hand) for long guns aimed 0-180 deg, the trigger hand is nearer for 225-315; for pistols the trigger hand is nearer at 0, 45, 270, 315.
The gun and both arms are in front of the head at every facing (cheek weld: the head is behind the stock, never in front of the arms).

## Rules per class

All angles are relative to the aim. "Right of aim" = the shooter's right. Right-handed everywhere.

| class | guns | torso blade | gun root offset v | lean into gun | trigger hand | support hand |
| --- | --- | --- | --- | --- | --- | --- |
| pistol | MICA 9, TALON .45 | 0 (square, isosceles) | 0 (centred) | -2.2 (body sits back so the arms reach out) | grip | wraps the front of the grip, arms near straight (bones shorten rather than folding elbows) |
| smg | machine pistol, burst | 0.31 rad | 3.0 | 1.0 | grip | front of the receiver |
| rifle | carbines, rifles | 0.56 rad | 4.2 | 1.8 | pistol grip | rear of the handguard |
| shotgun | street sweeper | 0.49 | 4.0 | 1.5 | grip | on the pump, slides back/forward after each shot |
| sniper | lynx, quill | 0.66 | 4.2 | 2.2 | grip, works the bolt on reload | under the forend |
| amr | mule | 0.73 | 4.4 | 2.2 | grip, works the bolt | under the forend |
| launcher | cork | 0.63 | 4.4 | 1.4 | grip | tube, ahead of the grip |

* Torso yaw = body yaw + blade (right shoulder back); the head turns back onto the aim (cheek weld) and shifts toward the gun side.
* The gun root sits `v` to the right of the aim line (the shoulder pocket / chest side); the barrel crosses back by `asin(v / L)` so the muzzle lands exactly
  on `gunMuzzle(gun)` on the aim line (bullets unchanged; `stack2d.test.js` pins it for every gun and 8 angles).
* Long guns sit 1 unit higher (shoulder height). Draw order is a fixed weapon layer over torso AND head: arms (both bones) < gun and its moving pump / bolt < gloves < mag;
  between the two gloves the one lower on screen (nearer the camera) draws on top, as in the references.
* Both arms are two-bone IK (bone = 8.8 units = the arm model's 11 cells, thinner than the torso) from the torso's shoulders (which follow the blade) to the two hand points; elbows flare outward on their own side.
* Recoil: the gun slides back along its own axis into the shoulder, torso rocks back, hands follow because they are defined in gun space.
* Reload (`reloadFrac`, 0..1, same phases as `reloadPose`): 0-0.2 support hand drops from the handguard to the magwell and the mag leaves,
  0.2-0.62 hand goes to the vest pouch (front-left of the torso) and fetches a mag, 0.62-0.82 mag brought up to the magwell, 0.82-1 hand returns to
  the handguard; bolt guns (sniper, amr) work the bolt with the trigger hand. Pump guns also rack on a shot (`kick`).
* Sprint: stance squares up (blade fades out), long guns go to low-ready/port arms with the muzzle dipped (`gunRot`), pistols tuck in and the free hand
  goes to the chest. `oneHand` input (riot baton / shield rigs) does the same chest/hip tuck for the free hand permanently.
* Swap: hands stay glued to the gun while it rolls and shrinks toward the chest (`gunRot`, `gunDx`, `gunScale`).

* Pump and bolt are separate stacks (`gunStack(gun).parts.pump / .bolt`, same grid frame as the gun): the rig slides them by exactly the offset of the hand that works
  them (pump after a shot, bolt at the end of a bolt-gun reload).
* Reload tilt and low-ready cant are actor-relative (reload cants the muzzle toward the actor's right, low-ready toward the support side) at every aim: no screen flip,
  so aiming left mirrors correctly (render2d passes `gunRot` without the old `flip`).
* Gloves are light leather (player) / dark leather (gunner), the gun is lighter metal with warm stock, so hands and gun separate; the antenna is 9.5 units long and thin.

## Known gaps

No CC0 8-direction top-down soldier sheet was reachable (Kenney's Top-down Shooter is not in the mirrored packs; the proxy only serves allow-listed repos), so the 2D comparison
is not done. Reference proportions are real (arms 1.6x the shoulder width, rifle 2.8x) while ours are chibi (arms ~0.9x, rifle 1.4x), so only ratios and layering transfer.
Pistol arms cannot fully extend because the muzzle is pinned at `gunMuzzle` (the body sits back instead). Brute hammer and riot baton are drawn by the legacy path, not the rig.

## Update: procedural limbs, small gloves, long thin guns
* Arms are single smooth tapered limbs drawn by `drawLimb` in `rig2d.js` (sleeve darker than the torso, elbow pad, bend follows the reach); hands are small dark gloves (`drawHand`) wrapped across the gun. Corpses still use the voxel arm/glove models.
* Guns are longer (class factors on `visual.length`) and thinner, held at shoulder height; pistols are held at arm's length (`gunReach` 11, else 5) so the isosceles diamond shows at every facing. `gunMuzzle`, `feel.muzzleDistance`, `enemyMuzzle` (render2d, also enemy bullet spawn) agree; `rig-hold.test.js` pins it.
* The weapon layer sorts over the legs too. Metric: `docs/art/handling-iou.md` (`tools/handling-iou.mjs`).
