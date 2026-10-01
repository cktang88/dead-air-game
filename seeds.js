export const MAX_RUN_SEED = 0x7fffffff;

export function parseRunSeed(value) {
  const seed = Number(value);
  return Number.isInteger(seed) && seed > 0 && seed <= MAX_RUN_SEED ? seed : null;
}
