// Rolling recorder of rally frames for slow-mo point replays.
// Pure position playback: no physics re-run, so it can't diverge.

const FPS = 60;
const BUFFER_SECONDS = 2.5;

export class ReplayRecorder {
  constructor() {
    this.frames = [];
    this.max = Math.round(FPS * BUFFER_SECONDS);
  }

  // frame: { bx, by, bz, px, py, cx, cy }
  record(frame) {
    this.frames.push(frame);
    if (this.frames.length > this.max) this.frames.shift();
  }

  clear() {
    this.frames = [];
  }

  // The last `seconds` of frames, oldest first.
  clip(seconds) {
    const n = Math.min(this.frames.length, Math.round(FPS * seconds));
    return this.frames.slice(this.frames.length - n);
  }
}
