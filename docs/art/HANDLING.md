# Weapon handling rules

Implemented in `rig2d.js` (`GRIPS`, `humanoidPose`); per-gun grip points live on `GUN_ART` in `sprites2d.js` (`cls`, `trig`, `sup`, `bolt`) and are
turned into gun-space points by `gunGeometry()` in `models2d.js`. Sheets: `tools/stack-sheet.html?gun=<id>&rows=gun&zoom=4&cols=4&h=56&W=1800&H=2300`.
Images: `handling-<class>.png` (aim angles, recoil, walk/sprint, reload phases) and `handling-fight.png`.

## References and what they say

Research was limited: image hosts are blocked from the sandbox, and web search returned mostly marksmanship text. Used:
* Marksmanship guides (SnipersHide threads on shoulder pocket and rear bag, Crate Club "how to hold an assault rifle / AR-15"): stock sits in the shoulder
  pocket where shoulder meets chest, cheek weld on the stock (head turned to the gun, not the gun to the head), support hand cups the handguard
  with the elbow under the gun, "handshake" grip pressure, traditional stance is bladed (about 45-90 degrees), modern is squarer; pistols use a two-handed
  isosceles (square, arms extended) or Weaver grip, sidearm sprint is one-handed or tucked to the chest.
* Top-down 2D shooter conventions (Hotline Miami, Nuclear Throne, Enter the Gungeon, Intravenous, Door Kickers, Running With Rifles, and asset packs
  like the Dyru pixel top-down pack with holding/shooting poses): the gun is a separate layer pivoting at the hand/shoulder, the muzzle (not the sprite
  centre) is the bullet origin, and the support hand sits at one consistent point on the forend at every aim angle. (Forum advice: keep arms and gun
  aimed at the target and fire from the muzzle point.)
* `/home/user/gats-clone` draws a round body with a gun and two circle hands (`sprites.ts` `hands`); it confirms the principle of two hands on fixed gun
  points but has no arm IK, so the rules below are DEAD AIR specific.

## Rules per class

All angles are relative to the aim. "Right of aim" = the shooter's right. Right-handed everywhere.

| class | guns | torso blade | gun root offset v | lean into gun | trigger hand | support hand |
| --- | --- | --- | --- | --- | --- | --- |
| pistol | MICA 9, TALON .45 | 0 (square, isosceles) | 0 (centred) | 0.2 | grip | wraps the front of the grip, arms near straight (bones shorten rather than folding elbows) |
| smg | machine pistol, burst | 0.28 rad | 2.2 | 1.0 | grip | front of the receiver |
| rifle | carbines, rifles | 0.5 rad | 3.2 | 1.8 | pistol grip | rear of the handguard |
| shotgun | street sweeper | 0.45 | 3.0 | 1.5 | grip | on the pump, slides back/forward after each shot |
| sniper | lynx, quill | 0.6 | 3.4 | 2.2 | grip, works the bolt on reload | under the forend |
| amr | mule | 0.7 | 3.6 | 2.2 | grip, works the bolt | under the forend |
| launcher | cork | 0.65 | 4.0 | 1.4 | grip | tube, ahead of the grip |

* Torso yaw = body yaw + blade (right shoulder back); the head turns back onto the aim (cheek weld) and shifts toward the gun side.
* The gun root sits `v` to the right of the aim line (the shoulder pocket / chest side); the barrel crosses back by `asin(v / L)` so the muzzle lands exactly
  on `gunMuzzle(gun)` on the aim line (bullets unchanged; `stack2d.test.js` pins it for every gun and 8 angles).
* Long guns sit 1 unit higher (shoulder height) and always draw over the torso; hands and forearms draw over the gun.
* Both arms are two-bone IK from the torso's shoulders (which follow the blade) to the two hand points; elbows flare outward on their own side.
* Recoil: the gun slides back along its own axis into the shoulder, torso rocks back, hands follow because they are defined in gun space.
* Reload (`reloadFrac`, 0..1, same phases as `reloadPose`): 0-0.2 support hand drops from the handguard to the magwell and the mag leaves,
  0.2-0.62 hand goes to the vest pouch (front-left of the torso) and fetches a mag, 0.62-0.82 mag brought up to the magwell, 0.82-1 hand returns to
  the handguard; bolt guns (sniper, amr) work the bolt with the trigger hand. Pump guns also rack on a shot (`kick`).
* Sprint: stance squares up (blade fades out), long guns go to low-ready/port arms with the muzzle dipped (`gunRot`), pistols tuck in and the free hand
  goes to the chest. `oneHand` input (riot baton / shield rigs) does the same chest/hip tuck for the free hand permanently.
* Swap: hands stay glued to the gun while it rolls and shrinks toward the chest (`gunRot`, `gunDx`, `gunScale`).

## Known gaps

The baked pump / bolt of the gun model do not move (only the hand does). Brute hammer and riot baton are drawn by the legacy path, not the rig.
