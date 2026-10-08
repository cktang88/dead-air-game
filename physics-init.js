// Starts the Rapier WASM compile as soon as the (small) CDN module arrives. index.html imports this file on its own, in parallel with
// the ~100 local game modules, so the physics engine is ready by the time game.js has finished loading. game.js imports the same
// instance (one module record), so RAPIER.init() runs exactly once.
import RAPIER from 'https://esm.sh/@dimforge/rapier2d-compat@0.17.3';

export const rapierReady = RAPIER.init();
