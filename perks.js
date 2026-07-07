// Roguelike perks for The Circuit. A PerkSet is built from a list of owned
// perk ids and answers the queries game.js asks at its existing decision
// points. An empty set returns neutral values, so perks are a no-op in
// every other mode. Pure — no DOM, no game state.

import { SMASH_HEIGHT } from './shots.js';

export const PERKS = [
  { id: 'cannon', name: 'Cannon', rarity: 'common', cost: 0,
    desc: 'Drives and serves hit harder — but scatter more.' },
  { id: 'feather', name: 'Feather', rarity: 'common', cost: 0,
    desc: 'Your dinks and lobs never scatter.' },
  { id: 'quickfeet', name: 'Quick Feet', rarity: 'common', cost: 0,
    desc: 'Move noticeably faster.' },
  { id: 'longreach', name: 'Long Reach', rarity: 'common', cost: 0,
    desc: 'Reach further for every ball.' },
  { id: 'sureserve', name: 'Sure Serve', rarity: 'common', cost: 0,
    desc: 'Your first service fault each game is a let.' },
  { id: 'netmagnet', name: 'Net Magnet', rarity: 'uncommon', cost: 0,
    desc: 'Your net-cord balls always dribble over and stay live.' },
  { id: 'wall', name: 'Wall', rarity: 'uncommon', cost: 30,
    desc: 'Your first mistimed swing each game doesn\'t whiff.' },
  { id: 'kitchenninja', name: 'Kitchen Ninja', rarity: 'uncommon', cost: 40,
    desc: 'Volley a step inside the kitchen without faulting.' },
  { id: 'smashbro', name: 'Smash Bro', rarity: 'uncommon', cost: 40,
    desc: 'Smash balls you take lower, and hit them harder.' },
  { id: 'overdrive', name: 'Overdrive', rarity: 'rare', cost: 60,
    desc: '+50% power and flatten any ball — but you scatter far more.' },
];

export function perkById(id) {
  return PERKS.find((p) => p.id === id);
}

export class PerkSet {
  constructor(ids = []) {
    this.ids = new Set(ids);
    this.resetGame();
  }

  has(id) { return this.ids.has(id); }

  owned() { return [...this.ids]; }

  powerMult() {
    let m = 1;
    if (this.has('cannon')) m *= 1.25;
    if (this.has('overdrive')) m *= 1.5;
    return m;
  }

  throttleFloor() {
    return this.has('overdrive') ? 1 : 0.3;
  }

  scatterMult(shot = {}) {
    if (this.has('feather') && (shot.dink || shot.lob)) return 0;
    let m = 1;
    if (this.has('cannon')) m *= 1.4;
    if (this.has('overdrive')) m *= 1.5;
    return m;
  }

  moveSpeedMult() { return this.has('quickfeet') ? 1.15 : 1; }

  reachBonus() { return this.has('longreach') ? 0.6 : 0; }

  smashHeight() { return this.has('smashbro') ? 4.2 : SMASH_HEIGHT; }

  smashBonus() { return this.has('smashbro') ? 0.15 : 0; }

  netMagnet() { return this.has('netmagnet'); }

  kitchenTolerance() { return this.has('kitchenninja') ? 1 : 0; }

  resetGame() {
    this.serveLet = this.has('sureserve');
    this.whiffGrace = this.has('wall');
  }

  takeServeLet() {
    if (!this.serveLet) return false;
    this.serveLet = false;
    return true;
  }

  takeWhiffGrace() {
    if (!this.whiffGrace) return false;
    this.whiffGrace = false;
    return true;
  }
}
