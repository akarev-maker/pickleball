// Temporary stub: renders the court. Replaced by the full game loop in Task 5.
import { setupCanvas, drawCourt } from './court.js';

const canvas = document.getElementById('game');
const view = setupCanvas(canvas);
drawCourt(view.ctx, view);
