// Shot-tuning math shared by the player and CPU. Pure — no DOM, no state —
// so the risk/reward curves are unit-testable.

// A swing contacting the ball at or above this height becomes an overhead
// smash (see game.js playerShot and cpu.js chooseShot).
export const SMASH_HEIGHT = 5.5; // ft

// Charged serve: power trades a safe high arc for depth and pace, paid for
// with scatter — a fully cooked serve genuinely risks a service fault.
export function serveParams(power) {
  return {
    apexZ: 9 - 2.5 * power,
    timeScale: 1 - 0.25 * power,
    err: 1 + 2.5 * power,
    depth: 6 * power, // unaimed serves bias this much deeper
  };
}

// Lob: charge buys height (always over the 7 ft reach ceiling at the apex)
// and depth; an under-charged lob falls short and sits up for a smash.
export function lobParams(power) {
  return { apexZ: 9 + 4 * power };
}

// Overhead smash: barely rises above the contact point and is punched
// steeply down. From close it's lethal; from deep the flat path can
// find the net.
export function smashParams(z, power) {
  return {
    apexZ: z + 0.5,
    timeScale: 0.55 - 0.15 * power,
  };
}
