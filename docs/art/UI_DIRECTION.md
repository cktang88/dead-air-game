# DEAD AIR: UI Direction

The owner's complaint: "a lot of UI is just text in fancy gradient boxes." The old interface was a web design system (cards, pills, rounded rectangles, tinted gradients, hover lifts) wearing a dark theme. This document records what we studied and the rules that replace it.

## The concept

**The interface is the bunker's equipment.** DEAD AIR is a dead broadcast in a sealed signal bunker. Everything the player touches is something that could be bolted to that bunker's wall: a radio tuner with a needle, a guarded lever panel, a crate with a foam insert, a binder of tapes, a station log printed on a till roll, a CRT that powers off. Panels are worn graphite and bakelite with screws, stencilled legends and paper tape labels. Numbers are lamps, nixie windows and split-flap drums. Nothing is a rounded gradient card.

## References studied

Image hosts and the Game UI Database were blocked by the sandbox proxy, so this is a mix of the pages that were reachable (Game Developer's Inscryption interview, cassette-futurism and diegetic-interface write-ups surfaced by search, GDC 2022 "Sacrifices Were Made" coverage, Lucas Pope interview coverage) and close study of how each game's screens work in play.

| Game | What it does | What we take |
|---|---|---|
| **Hades** | A boon choice is a *character moment*: the god is on screen, each boon is a tall framed plate with a big emblem, rarity changes the frame and colour, the hovered plate lifts and the others dim. Icons carry the meaning, text is short. | One big drawn emblem per choice, rarity as a frame change (rank lamps, not a label), hovered/selected choice dominates, the rest dims. |
| **Inscryption** | The UI is the *table*: cards are objects with weight, a candle, a bell, a scale. Mullins removed text from cards and let icons do the work; legibility at low resolution drove every decision. | Items are physical (foam insert, stamped tags, cassettes), text is secondary to a symbol, the interface sits in a room. |
| **Return of the Obra Dinn / Papers, Please** (Lucas Pope) | The UI *is* the tool: a ledger, a stamp, a pocket watch. It must be trustworthy; it never lies about state. Dense but strictly aligned. 1-bit constraints force bold shapes. | Stamps, printed forms, strict alignment, state shown by the object's state (a lever is up or down), not by a label. |
| **Hotline Miami / HM2** | Bold typography, hard colour fields, VHS and neon menu chrome, score as a *performance* (tally, letter grade, combo). | Big stencil type for headlines, a station-log tally for results, hard-edged chrome. |
| **Katana Zero** | The whole game is a VHS tape and a therapist's tape recorder; menus are tape transport controls and dialogue choices are timed. | Tape-label and transport-control language for runs, tapes and pause. |
| **Ruiner** | Aggressive HUD glyphs, glitch and chromatic noise on state change. | State changes glitch; they do not fade politely. |
| **Dead Cells / Enter the Gungeon** | The shop and gun-chest screens show the item as a large sprite with a price tag; the character reads at a glance and the rest is a short tooltip. | Item first, price as a stamped tag, description in a tooltip-sized strip. |
| **Slay the Spire** | Cards are a frame + a big picture + a very short rules box; rarity is frame colour; the whole reward screen is three cards on a table. | Same structure for the tuner plates. |
| **Disco Elysium / Cult of the Lamb** | Thick, hand-made, tactile frames and portraits; the UI has a personality of its own. | Hand-lettered tape labels (marker on tape), uneven stamps. |
| **Signalis / Alien: Isolation** | CRT terminals are the *interface*: phosphor monochrome, scanlines used sparingly, mechanical switches, readouts that flicker and warm up. Alien: Isolation's diegetic motion tracker is read as an object, not a bar. | Minimap as a radar scope, readouts as phosphor/lamp segments, CRT power-off for death. |
| **Fallout Pip-Boy** | A wearable device: one phosphor colour, tabs that are physical, dials and a tuned radio. | Single-hue phosphor readouts, the radio tuner dial as a first-class screen. |

## Principles

1. **Diegesis first.** Every screen answers "what object is this in the bunker?" If the answer is "a web card", redraw it. Chrome that carries no object (pills, rounded boxes, gradient headers) is removed.
2. **Materiality.** Surfaces have a material: graphite steel, bakelite, brass, cream label stock, thermal paper, foam. Show it with noise grain, bevels (a light top edge and dark bottom edge), screws, stencilling and wear, not with gradients and glow. Gradients are reserved for lit things (lamps, phosphor) and one subtle sheen.
3. **State is the object's state.** A guarded switch is shut or open. A needle is on a station or between. A lamp is lit or dark. A drum shows the number. Avoid labels that restate state.
4. **Hierarchy through scale and contrast.** One hero element per screen (the dial, the two levers, the crate). Everything else is a small label. The choice under the cursor is the brightest thing; the rest dims.
5. **Icons and drawings over words.** Each of the 19 frequencies has its own drawn emblem, each station its own waveform. Descriptions sit on a small printed strip and are read second.
6. **Motion has a mechanical cause.** Needles have inertia and overshoot, switches snap, drums tick, lamps warm up and flicker. Every action has a click, a static burst or a thunk. Reduced-motion replaces motion with instant state change; the information is never lost.
7. **Juice is a response, not decoration.** Choosing a frequency: needle snaps, a static burst whites out the dial, the waveform locks into a clean trace. Pulling the lever: the cover flips, the lever travels, the lamp goes on. Nothing animates on its own while the player is deciding, except the live waveforms, which are cheap and pause when hidden.
8. **Readable first.** Nothing under 11px; display type is condensed stencil, data is monospace; contrast against panel stays above 4.5:1. Focus is a hard bright ring (a "selection lamp"), never colour alone.
9. **One vocabulary everywhere.** The title, HUD, pause, supply, safehouse and end screens use the same parts: screws, tape labels, nixie/LED digits, hazard stripe, stamps, lamps. A player who learns what a tape label means on the tuner knows it in the manual.

## Mapping onto the dead broadcast

| Surface | Object | Notes |
|---|---|---|
| Frequency pick | Analog radio tuner | A dial band with five stations; needle sweeps between the three offered stations. Each plate has a live oscilloscope trace (STATIC jagged noise, DEADLINE slow sine with a tick, CARRIER clean carrier with bounces, NIGHT SHIFT near-flat whisper, FEEDBACK clipping square wave), a big emblem, rank as VU lamps, description on a tape strip. Crossfade = two traces merging. |
| Bank or descend | Control panel | EXTRACT is a lever under a flip-up safety cover; DESCEND is a hazard-striped lever. Coin counters are split-flap drums. Risk is a needle gauge swinging into the red. |
| Supply drop | Crate with foam insert | Items sit cut into the foam with stamped price tags; scrap is a mechanical counter. |
| Field manual, tapes | Clipboard and cassettes | Manual as a ruled clipboard sheet; recovered tapes as cassettes with hand-lettered labels. |
| Death | CRT power-off, SIGNAL LOST test card | The picture collapses to a line and a dot. Stats print on a station log (thermal paper). |
| Win | ON AIR lamp | Restored broadcast; same log format. |
| HUD | Wall-mounted instruments | Segmented LED health, nixie ammo window, screws, tape labels; the minimap is a radar scope. |
| Title, settings, safehouse | Equipment faceplates | Same parts. |

## Rules of thumb for implementers

- No `border-radius` above 3px except real lamps and knobs. No `backdrop-filter` blur cards. No `translateY` hover lifts.
- Use `ui-art.js` parts (screws, stencil, lamp, nixie, split-flap, hazard) rather than new one-off decoration.
- Texture is one cached noise tile; do not stack full-screen filters.
- Canvas art (waveforms, dial, gauge) runs only while its dialog is visible and under `prefers-reduced-motion` draws a single static frame.
