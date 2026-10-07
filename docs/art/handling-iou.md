# Handling silhouette similarity (ours vs Blender reference)

Run: `node tools/handling-iou.mjs <refs/out> docs/art/handling-iou.md`. Both rigs at zoom 4 (same 2.5D camera), alpha>60 silhouettes, IoU per class over 8 facings. Gun length = principal-axis extent of the gun alone (ours) vs measured rear-to-muzzle (ref), compared after dividing by shoulder width. A chibi body vs a real man caps IoU well below 1.

## Before

| class | mean IoU | gun len ours (units) | gun len ref | gun/shoulder ratio, ours vs ref | IoU per facing (0..315) |
| --- | --- | --- | --- | --- | --- |
| pistol | 0.487 | 13.6 | 7.0 | 146% | 0.40 0.54 0.68 0.56 0.40 0.46 0.39 0.46 |
| smg | 0.541 | 16.3 | 18.0 | 68% | 0.56 0.58 0.55 0.51 0.49 0.52 0.55 0.56 |
| rifle | 0.512 | 26.4 | 31.2 | 63% | 0.46 0.51 0.51 0.46 0.48 0.50 0.59 0.58 |
| shotgun | 0.511 | 26.0 | 32.4 | 60% | 0.47 0.52 0.50 0.47 0.46 0.49 0.60 0.59 |
| sniper | 0.496 | 31.3 | 38.4 | 61% | 0.44 0.45 0.51 0.45 0.48 0.49 0.62 0.52 |
| amr | 0.476 | 33.0 | 45.6 | 54% | 0.48 0.45 0.45 0.45 0.45 0.46 0.56 0.50 |
| launcher | 0.519 | 25.5 | 31.2 | 61% | 0.46 0.51 0.51 0.50 0.49 0.52 0.61 0.56 |
| **all** | **0.506** | | | | |

(before: raw IoU only; its gun-length column was measured on a clipped canvas and is not comparable; first run had raw mean 0.506)

## After

| class | mean IoU | IoU after best shift (units) | gun len ours (units) | gun len ref | gun/shoulder ratio, ours vs ref | IoU per facing (0..315) |
| --- | --- | --- | --- | --- | --- | --- |
| pistol | 0.519 | 0.538 (0.0, -2.0) | 10.7 | 7.0 | 114% | 0.46 0.54 0.76 0.54 0.44 0.50 0.42 0.49 |
| smg | 0.571 | 0.613 (0.0, -2.0) | 20.9 | 18.0 | 87% | 0.57 0.65 0.62 0.54 0.51 0.55 0.52 0.61 |
| rifle | 0.535 | 0.564 (0.0, -3.0) | 36.9 | 31.2 | 88% | 0.51 0.53 0.56 0.50 0.52 0.50 0.57 0.58 |
| shotgun | 0.542 | 0.585 (0.0, -3.0) | 35.9 | 32.4 | 83% | 0.52 0.52 0.57 0.51 0.51 0.50 0.60 0.61 |
| sniper | 0.526 | 0.552 (0.0, -2.0) | 48.4 | 38.4 | 94% | 0.50 0.50 0.56 0.50 0.52 0.51 0.58 0.55 |
| amr | 0.501 | 0.529 (0.0, -2.0) | 53.9 | 45.6 | 88% | 0.50 0.50 0.50 0.48 0.49 0.47 0.55 0.52 |
| launcher | 0.542 | 0.594 (0.0, -3.0) | 34.8 | 31.2 | 83% | 0.52 0.56 0.58 0.49 0.49 0.48 0.62 0.60 |
| **all** | **0.534** | **0.568** | | | | |
