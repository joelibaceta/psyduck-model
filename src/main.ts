import { createGL } from './gl/gl';
import { Forest } from './background/forest';
import { Psyduck } from './character/psyduck';
import { Controller, type Intent } from './anim/controller';
import { Brain } from './brain/intent';
import { psy } from './ui/sound';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const statusEl = document.getElementById('status')!;
const bubbleEl = document.getElementById('bubble')!;
const form = document.getElementById('chat') as HTMLFormElement;
const input = document.getElementById('chat-input') as HTMLInputElement;

const gl = createGL(canvas);
const forest = new Forest(gl);
const psyduck = new Psyduck(gl);
const ctrl = new Controller(psyduck);
const brain = new Brain();
(window as any).ctrl = ctrl; // handy for console tinkering: ctrl.trigger('jump')

let W = 0, H = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.floor(window.innerWidth * dpr);
  H = Math.floor(window.innerHeight * dpr);
  canvas.width = W; canvas.height = H;
}
window.addEventListener('resize', resize);
resize();

// --- bubble helpers ---
let bubbleTimer = 0;
function showBubble(text: string) {
  bubbleEl.textContent = text;
  bubbleEl.classList.add('show');
  bubbleTimer = 2.2;
}
function placeBubble() {
  const v = ctrl.view;
  const asp = W / H;
  const headY = 4.3;
  const fracX = 0.5 + (v.rootX / v.unitsVisible) / asp;
  const fracY = v.feetFrac + (headY + v.rootY) / v.unitsVisible;
  bubbleEl.style.left = `${fracX * window.innerWidth}px`;
  bubbleEl.style.top = `${(1 - fracY) * window.innerHeight}px`;
}

function setStatus(s: string) {
  statusEl.textContent = s;
  statusEl.classList.remove('hide');
  clearTimeout((setStatus as any)._t);
  (setStatus as any)._t = setTimeout(() => statusEl.classList.add('hide'), 1800);
}

// --- chat handling ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const intent: Intent = await brain.classify(text);
  ctrl.trigger(intent);
});

// kick off brain load after first interaction (keeps startup instant)
let brainKicked = false;
function kickBrain() {
  if (brainKicked) return; brainKicked = true;
  brain.load(setStatus);
}
input.addEventListener('focus', kickBrain, { once: true });
window.addEventListener('pointerdown', kickBrain, { once: true });

setStatus('¡Háblale a Psyduck!');

let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  const t = now / 1000;
  ctrl.view.aspect = W / H;

  gl.viewport(0, 0, W, H);
  gl.clearColor(0.04, 0.08, 0.06, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  forest.render(t, W, H);

  ctrl.update(dt, t);
  psyduck.draw(ctrl.view);

  // emotes (speech + sound) emitted by behaviors
  const emote = ctrl.takeEmote();
  if (emote) { showBubble(emote); psy(emote.length > 6 ? 2 : 1); }

  if (bubbleTimer > 0) { bubbleTimer -= dt; if (bubbleTimer <= 0) bubbleEl.classList.remove('show'); }
  placeBubble();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
