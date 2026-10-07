# Credits

## Icons

All icons in `assets/icons/` and `icons-data.js` are single-colour glyphs from the sets below, unchanged
apart from being cropped to their bounding box and (long guns only) rotated level.

### game-icons.net - CC BY 3.0

Most icons come from [game-icons.net](https://game-icons.net), distributed on npm as
`@iconify-json/game-icons`. They are licensed under
[Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/) (see the
[license text](https://github.com/game-icons/icons/blob/master/license.txt)). Required attribution:

> Icons by [game-icons.net](https://game-icons.net) contributors, including **Lorc**, **Delapouite**,
> **Skoll**, **Caro Asercion**, **Willdabeast**, **John Colburn**, **Felbrigg**, **Sbed**,
> **Carl Olsen**, **Cathelineau** and **Faithtoken**. Each icon's individual author is shown on its
> game-icons.net page.

The Iconify JSON build does not carry per-icon author metadata, so authorship is credited at set level.
The table below gives each icon's original name; look it up on game-icons.net, or in
[github.com/game-icons/icons](https://github.com/game-icons/icons) (`<author>/<category>/<name>.svg`),
for its individual author.

### Material Design Icons - Apache 2.0

A few glyphs (`status-heart`, `status-warning`, `status-search`, `mod-suppressor`, `status-info`, `status-close`, `status-keyboard`) come from
[Material Design Icons](https://pictogrammers.com/library/mdi/) by Pictogrammers (`@iconify-json/mdi`),
licensed under the [Apache License 2.0](https://github.com/Templarian/MaterialDesign/blob/master/LICENSE).

### Icon map

| DEAD AIR id | Source set / original name |
| --- | --- |
| `gun-pistol` | game-icons / pistol-gun |
| `gun-smg` | game-icons / m3-grease-gun |
| `gun-shotgun` | game-icons / sawed-off-shotgun |
| `gun-rifle` | game-icons / ak47 |
| `gun-sniper` | game-icons / winchester-rifle |
| `gun-antimateriel` | game-icons / missile-launcher |
| `throw-smoke` | game-icons / smoke-bomb |
| `throw-flash` | game-icons / stun-grenade |
| `throw-frag` | game-icons / cluster-bomb |
| `throw-incendiary` | game-icons / fire-bottle |
| `pickup-scrap` | game-icons / gears |
| `pickup-ammo` | game-icons / ammo-box |
| `pickup-heal` | game-icons / first-aid-kit |
| `pickup-mod` | game-icons / wrench |
| `pickup-armor` | game-icons / kevlar-vest |
| `pickup-crate` | game-icons / wooden-crate |
| `pickup-coin` | game-icons / crown-coin |
| `pickup-harness` | game-icons / backpack |
| `pickup-scanner` | game-icons / metal-detector |
| `pickup-prototype` | game-icons / silver-bullet |
| `pickup-upgrade` | game-icons / armor-upgrade |
| `station-workbench` | game-icons / toolbox |
| `station-loadout` | game-icons / lockers |
| `station-merchant` | game-icons / shop |
| `station-cache` | game-icons / chest |
| `station-cache-open` | game-icons / open-chest |
| `lock-locked` | game-icons / padlock |
| `lock-unlocked` | game-icons / padlock-open |
| `item-key` | game-icons / key |
| `exit-extraction` | game-icons / exit-door |
| `door` | game-icons / door |
| `settings` | game-icons / cog |
| `enemy-rusher` | game-icons / running-ninja |
| `enemy-gunner` | game-icons / crossed-pistols |
| `enemy-brute` | game-icons / brute |
| `enemy-warden` | game-icons / riot-shield |
| `status-heart` | mdi / heart |
| `status-shield` | game-icons / shield |
| `status-reload` | game-icons / cycle |
| `status-slowmo` | game-icons / hourglass |
| `status-sprint` | game-icons / sprint |
| `status-warning` | mdi / alert |
| `status-search` | mdi / help |
| `status-skull` | game-icons / death-skull |
| `status-trophy` | game-icons / trophy |
| `status-weight` | game-icons / weight |
| `status-clock` | game-icons / stopwatch |
| `status-kills` | game-icons / crosshair |
| `status-seed` | game-icons / dice-fire |
| `status-rarity` | game-icons / star-medal |
| `status-coins` | game-icons / two-coins |
| `status-info` | mdi / information-variant |
| `status-close` | mdi / close |
| `status-keyboard` | mdi / keyboard |
| `mod-extended` | game-icons / machine-gun-magazine |
| `mod-suppressor` | mdi / volume-off |
| `mod-hollow` | game-icons / bullets |
| `mod-stabilizer` | game-icons / gun-stock |
| `mod-longbarrel` | game-icons / musket |

## Music

The score is real electronic music, one track per game state, cut into bar-aligned loops (`assets/music/*.mp3`,
re-encoded at 112 kbps MP3, trimmed to whole bars and cross-faded at the loop point; no other changes). Tempos were
measured from the source audio. The sandbox cannot reach the composers' own sites, so each file was taken from the public
GitHub repo [qompassai/light-show](https://github.com/qompassai/light-show) (`game/assets/music/`), whose README and
`game/assets/music/CREDITS.md` give the composer, title, source and licence for every file; the Eric Skiff licence is also
stated on the composer's page as recorded in the TMHSDigital/Free-Game-Dev-Assets catalogue. That repo's own `LICENSE`
covers its code only; the audio is licensed by its composers as below.

| State | File | Track | Author | Licence | Source |
| --- | --- | --- | --- | --- | --- |
| Title / menu | `title.mp3` | "We're all under the stars" (Resistor Anthems) | Eric Skiff | CC BY 4.0 | http://EricSkiff.com/music |
| Explore / calm | `explore.mp3` | "Searching" (Resistor Anthems) | Eric Skiff | CC BY 4.0 | http://EricSkiff.com/music |
| Tension | `tension.mp3` | "In a Heartbeat" | Kevin MacLeod | CC BY 3.0 | https://incompetech.com/music/royalty-free/ |
| Combat | `combat.mp3` | "Underclocked (underunderclocked mix)" (Resistor Anthems) | Eric Skiff | CC BY 4.0 | http://EricSkiff.com/music |
| Boss | `boss.mp3` | "Exhilarate" | Kevin MacLeod | CC BY 4.0 | https://incompetech.com/music/royalty-free/ |
| Win | `win.mp3` | "We're the Resistors" (Resistor Anthems) | Eric Skiff | CC BY 4.0 | http://EricSkiff.com/music |

Required attribution lines:

> Music: Eric Skiff - We're all under the stars - Resistor Anthems - Available at http://EricSkiff.com/music
> Music: Eric Skiff - Searching - Resistor Anthems - Available at http://EricSkiff.com/music
> Music: Eric Skiff - Underclocked (underunderclocked mix) - Resistor Anthems - Available at http://EricSkiff.com/music
> Music: Eric Skiff - We're the Resistors - Resistor Anthems - Available at http://EricSkiff.com/music
>
> "In a Heartbeat" and "Exhilarate" Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution
> ([3.0](http://creativecommons.org/licenses/by/3.0/) / [4.0](http://creativecommons.org/licenses/by/4.0/) respectively).

The room-clear / exit-open stings and the death tape-stop are synthesised in `music.js` (no samples).
