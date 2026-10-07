// Glue between the renderer and the stacked actor kit: which kinds are stacked, their flat baked corpses, shared
// helpers. Keeping this out of render2d.js lets non-converted kinds keep drawing the legacy way.
import {STACK_CONFIG, STACK_TILT, tintVariant} from './stack2d.js';
import {floorLook} from './floor-palette.js';
import {kitFor} from './models2d.js';
import {humanoidPose, newRigOut, drawRig, DEAD_VARIANT, RIG} from './rig2d.js';
import {corpseOverrides, makeCanvas} from './sprites2d.js';

export {STACK_CONFIG, RIG, STACK_TILT};
/** True when this actor kind should be drawn from stacks (the single switch: STACK_CONFIG.enabled / ?stack=0). */
export const isStacked = (kind) => STACK_CONFIG.enabled && STACK_CONFIG.kinds.has(kind);
/** Pixels the stacked body hangs below the simulation position (the feet are below the aim plane). */
export const feetDrop = () => RIG.anchorZ * STACK_TILT;

const bakeOut = newRigOut();
for (const kind of ['player', 'gunner']) {
  // The flat corpse decal: the dead pose baked at yaw 0 falling towards -x; decals rotate it by the body angle.
  corpseOverrides[kind] = (px) => {
    const half = 26, side = half * 2, c = makeCanvas(side * px, side * px), g = c.getContext('2d');
    g.scale(px, px); g.translate(half, half);
    humanoidPose(kitFor(kind), {id: 5, bodyYaw: 0, aimYaw: 0, moveYaw: 0, dead: 1, fallYaw: Math.PI, spin: 0}, bakeOut);
    drawRig(g, bakeOut, 0, 0, {variant: DEAD_VARIANT, anchorZ: 0, shadow: false});
    return {half, img: c};
  };
}

const floorVariants = new Map();
/** A subtle palette variant that leans every stacked part towards the floor's accent (null = untinted). Cached per floor. */
export function floorStackVariant(floor, amount = 0.1) {
  const look = floorLook(floor);
  let v = floorVariants.get(look.id);
  if (!v) floorVariants.set(look.id, v = tintVariant('floor-' + look.id, look.accent, amount));
  return v;
}
