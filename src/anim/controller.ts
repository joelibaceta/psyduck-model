import type { Psyduck } from '../character/psyduck';
import type { StageView } from '../rig/mesh';
import { Spring, smooth, clamp, lerp } from '../rig/spring';
import { solveLimbDown } from '../rig/ik';

export type Intent = 'idle' | 'walk_left' | 'walk_right' | 'jump' | 'touch_head' | 'wave' | 'happy' | 'confused';
interface TP { dx: number; dy: number; drot: number; sx: number; sy: number; }
const ease = (v: number) => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
const envelope = (t: number, duration: number, enter = .35, exit = .4) => ease(t / enter) * ease((duration - t) / exit);
const EMOTES: Partial<Record<Intent, string>> = { wave: '¡Psy psy!', touch_head: 'psy… psy-duck…', happy: '¡Psy~! ♪', confused: '¿…psy?', jump: '¡Psy!' };

export class Controller {
  private s: Psyduck['skel'];
  private B: Psyduck['B'];
  private tp: TP[];
  view: StageView = {
    rootX: 0, rootY: 0, scaleX: 1, scaleY: 1, flip: 1,
    unitsVisible: 8.6, aspect: 1, feetFrac: .24,
    outlineW: .045, outlineColor: [.12, .09, .07],
  };
  behavior: Intent = 'idle';
  private phase = 0;
  private worldX = 0;
  private velocity = 0;
  private previousVelocity = 0;
  private gait = 0;
  private lift = 0;
  private sx = 1;
  private sy = 1;
  private weight = 1;
  private emote = '';
  private pendingIntent: Intent | null = null;
  private hair = [0, 1, 2].map(() => new Spring(0, 65, 10));
  private tail = new Spring(0, 55, 9);
  private bob = new Spring(0, 150, 21);
  private blinkWait = 1.6;
  private blinkPhase = -1;

  constructor(private p: Psyduck) {
    this.s = p.skel; this.B = p.B;
    this.tp = this.s.bones.map(() => ({ dx: 0, dy: 0, drot: 0, sx: 1, sy: 1 }));
    this.s.update();
  }
  takeEmote() { const result = this.emote; this.emote = ''; return result; }
  trigger(intent: Intent) {
    // Finish the landing before responding to another gesture.
    if (this.behavior === 'jump' && this.phase < 1.25) {
      this.pendingIntent = intent; return;
    }
    this.behavior = intent; this.phase = 0;
    this.emote = EMOTES[intent] ?? '';
  }
  private rot(name: string, value: number) {
    const pose = this.tp[this.B[name]];
    pose.drot = lerp(pose.drot, value, this.weight);
  }
  private scale(name: string, x: number, y: number) {
    const pose = this.tp[this.B[name]];
    pose.sx = lerp(pose.sx, x, this.weight); pose.sy = lerp(pose.sy, y, this.weight);
  }
  /** Convert stage targets into the animated parent's space before solving IK. */
  private limb(up: string, lo: string, x: number, y: number, l1: number, l2: number, bend: number) {
    const bone = this.s.bone(up), parent = this.s.bones[bone.parent].world;
    const det = parent[0] * parent[3] - parent[1] * parent[2];
    const dx = x - parent[4], dy = y - parent[5];
    const tx = (parent[3] * dx - parent[2] * dy) / det;
    const ty = (-parent[1] * dx + parent[0] * dy) / det;
    const angles = solveLimbDown(bone.rx, bone.ry, l1, l2, tx, ty, bend);
    this.rot(up, angles.upper); this.rot(lo, angles.lower);
  }
  private foot(side: string, x: number, y: number, roll = 0) {
    this.limb(`leg${side}_up`, `leg${side}_lo`, x, y, .27, .20, 1);
    // Keep the broad webbed foot level instead of rotating it with the shin.
    const up = this.tp[this.B[`leg${side}_up`]].drot;
    const lo = this.tp[this.B[`leg${side}_lo`]].drot;
    const pelvis = this.s.bone('pelvis').world;
    this.rot(`leg${side}_ft`, roll - up - lo - Math.atan2(pelvis[1], pelvis[0]));
  }
  private hand(side: string, x: number, y: number) {
    this.limb(`arm${side}_up`, `arm${side}_fore`, x, y, .5, .42, side === 'L' ? -1 : 1);
  }

  update(dt: number, t: number) {
    dt = clamp(dt, 0, .05);
    this.phase += dt; this.weight = 1; this.lift = 0; this.sx = 1; this.sy = 1;
    for (const pose of this.tp) Object.assign(pose, { dx: 0, dy: 0, drot: 0, sx: 1, sy: 1 });
    this.idle(t);
    this.locomotion(dt);
    switch (this.behavior) {
      case 'jump': this.jump(); break;
      case 'wave': this.wave(); break;
      case 'touch_head': this.touchHead(); break;
      case 'happy': this.happy(); break;
      case 'confused': this.confused(); break;
    }
    const priorY = this.view.rootY;
    this.bob.step(dt);
    this.view.rootY = this.bob.value + this.lift;
    this.view.rootX = this.worldX;
    this.view.scaleX = smooth(this.view.scaleX, this.sx, 20, dt);
    this.view.scaleY = smooth(this.view.scaleY, this.sy, 20, dt);
    // Head and arms settle slightly later than the torso.
    for (let i = 0; i < this.s.bones.length; i++) {
      const b = this.s.bones[i], goal = this.tp[i];
      const rate = /head|neck/.test(b.name) ? 10 : /arm/.test(b.name) ? 14 : 22;
      for (const key of ['dx', 'dy', 'drot', 'sx', 'sy'] as const) b.pose[key] = smooth(b.pose[key], goal[key], rate, dt);
    }
    this.secondary(dt, t, (this.view.rootY - priorY) / Math.max(dt, .001));
    this.blink(dt);
    this.s.update();
    for (const part of this.p.parts) part.mesh.skin(this.s);
  }
  private idle(t: number) {
    const breath = Math.sin(t * 1.65);
    this.scale('spine', 1 + .006 * breath, 1 + .01 * breath);
    this.scale('chest', 1 - .006 * breath, 1 + .009 * breath);
    this.rot('spine', .009 * Math.sin(t * .75));
    this.rot('neck', .018 * Math.sin(t * .7 + .6));
    this.rot('head', .025 * Math.sin(t * .53 + 1.2));
    this.rot('armL_up', .04 + .018 * Math.sin(t * 1.65 - .6));
    this.rot('armR_up', -.04 - .02 * Math.sin(t * 1.65 - .3));
    this.bob.target = 0;
    this.foot('L', -.33, -this.view.rootY);
    this.foot('R', .33, -this.view.rootY);
  }
  private locomotion(dt: number) {
    const dir = this.behavior === 'walk_left' ? -1 : this.behavior === 'walk_right' ? 1 : 0;
    const limit = Math.max(0, Math.min(2.5, this.view.unitsVisible * this.view.aspect / 2 - 1.4));
    const remaining = Math.max(0, limit - this.worldX * dir);
    const desired = dir * Math.min(.85, Math.sqrt(2 * 1.8 * remaining));
    this.velocity = smooth(this.velocity, desired, dir ? 4 : 7, dt);
    const next = this.worldX + this.velocity * dt;
    this.worldX = clamp(next, -limit, limit);
    if (next !== this.worldX || (dir && remaining < .012 && Math.abs(this.velocity) < .12)) {
      this.velocity = 0;
      if (dir) this.trigger('idle');
    }
    const speed = Math.abs(this.velocity);
    this.gait += speed * .62 / .48 * dt;
    if (speed < .008) return;
    const ph = this.gait * Math.PI * 2;
    const amount = ease(speed / .5);
    this.weight = amount;
    for (const [side, offset, hip] of [['L', 0, -.33], ['R', .5, .33]] as const) {
      const cycle = (this.gait + offset) % 1;
      const stance = cycle < .62;
      const u = stance ? cycle / .62 : (cycle - .62) / .38;
      const stride = stance ? lerp(.24, -.24, u) : lerp(-.24, .24, ease(u));
      const height = stance ? -this.view.rootY : Math.sin(Math.PI * u) * .12 - this.view.rootY;
      this.foot(side, hip + stride * Math.sign(this.velocity), height, stance ? 0 : -.13 * Math.sin(Math.PI * u));
    }
    this.rot('pelvis', .045 * Math.sin(ph));
    this.rot('spine', -.028 * Math.sin(ph) - .035 * this.velocity);
    this.rot('neck', .025 * Math.sin(ph - .4));
    this.rot('head', .035 * Math.sin(ph - .7));
    this.rot('armL_up', .22 * Math.sin(ph) + .06);
    this.rot('armR_up', -.22 * Math.sin(ph + .2) - .06);
    this.rot('armL_fore', .05 + .08 * Math.sin(ph - .5));
    this.rot('armR_fore', -.05 - .08 * Math.sin(ph - .3));
    this.bob.target = amount * (.018 - .018 * Math.cos(ph * 2));
    this.weight = 1;
  }
  private jump() {
    const p = this.phase;
    if (p >= 1.25) {
      const next = this.pendingIntent ?? 'idle'; this.pendingIntent = null;
      this.trigger(next); return;
    }
    if (p < .24) {
      const crouch = ease(p / .24);
      this.sx = 1 + .09 * crouch; this.sy = 1 - .12 * crouch;
      this.bob.target = -.045 * crouch;
      this.rot('armL_up', .25 * crouch); this.rot('armR_up', -.25 * crouch);
    } else if (p < .84) {
      const u = (p - .24) / .6;
      this.lift = 4 * .85 * u * (1 - u);
      this.bob.target = 0;
      const launch = ease(u / .13);
      const stretch = Math.exp(-Math.max(0, u - .13) * 9);
      this.sx = lerp(1.09, 1 - .055 * stretch, launch);
      this.sy = lerp(.88, 1 + .075 * stretch, launch);
      this.rot('armL_up', -.8 * Math.sin(Math.PI * u)); this.rot('armR_up', .8 * Math.sin(Math.PI * u));
      this.foot('L', -.33, .1 * Math.sin(Math.PI * u), -.08);
      this.foot('R', .33, .1 * Math.sin(Math.PI * u), .08);
      this.rot('head', -.065 * Math.sin(Math.PI * u));
    } else {
      const u = (p - .84) / .41;
      const impact = Math.sin(Math.PI * ease(u));
      this.sx = 1 + .11 * impact; this.sy = 1 - .13 * impact;
      this.bob.target = -.04 * impact;
      this.rot('neck', .08 * impact);
    }
  }
  private wave() {
    const p = this.phase;
    if (p >= 2.6) { this.trigger('idle'); return; }
    this.weight = envelope(p, 2.6, .48, .55);
    const wave = Math.sin(Math.max(0, p - .4) * 8.5);
    this.hand('R', 1.01 + .15 * wave, 2.39 + .055 * Math.cos(p * 8.5));
    this.rot('armL_up', .12); this.rot('neck', -.045);
    this.rot('head', -.06 + .025 * Math.sin(p * 3));
    this.rot('spine', -.025);
    this.weight = 1;
  }
  private touchHead() {
    const p = this.phase;
    if (p >= 3.2) { this.trigger('idle'); return; }
    this.weight = envelope(p, 3.2, .65, .65);
    this.hand('L', -.65, 2.43); this.hand('R', .65, 2.43);
    this.rot('neck', .025 * Math.sin(p * 4));
    this.rot('head', .065 * Math.sin(p * 4 - .4));
    this.scale('chest', 1.015, .985);
    this.weight = 1;
  }
  private happy() {
    const p = this.phase;
    if (p >= 3) { this.trigger('idle'); return; }
    const amount = envelope(p, 3, .4, .6);
    this.weight = amount;
    const ph = p * 6;
    this.rot('pelvis', .055 * Math.sin(ph));
    this.rot('spine', -.065 * Math.sin(ph));
    this.rot('head', .09 * Math.sin(ph - .6));
    this.rot('armL_up', -.7 + .18 * Math.sin(ph - .4));
    this.rot('armR_up', .7 + .18 * Math.sin(ph + .4));
    this.foot('L', -.33, .065 * Math.max(0, Math.sin(ph)) - this.view.rootY);
    this.foot('R', .33, .065 * Math.max(0, -Math.sin(ph)) - this.view.rootY);
    this.bob.target = amount * .035 * (1 - Math.cos(ph * 2));
    this.sx = 1 + .018 * amount * Math.cos(ph * 2);
    this.sy = 1 - .018 * amount * Math.cos(ph * 2);
    this.weight = 1;
  }
  private confused() {
    const p = this.phase;
    if (p >= 2.8) { this.trigger('idle'); return; }
    this.weight = envelope(p, 2.8, .5, .65);
    // Look, pause to think, then a smaller corrective tilt.
    const tilt = p < 1.4 ? .22 : lerp(.22, -.11, ease((p - 1.4) / .5));
    this.rot('head', tilt); this.rot('neck', tilt * .25);
    this.rot('armL_up', .12); this.rot('armR_up', -.08);
    this.weight = 1;
  }
  private secondary(dt: number, t: number, verticalVelocity: number) {
    const acceleration = (this.velocity - this.previousVelocity) / Math.max(dt, .001);
    this.previousVelocity = this.velocity;
    const drag = clamp(-acceleration * .025 - verticalVelocity * .035, -.22, .22);
    for (const [i, name] of ['hairL0', 'hairB0', 'hairR0'].entries()) {
      const spring = this.hair[i];
      spring.target = drag + .018 * Math.sin(t * 1.3 + i * .6);
      spring.step(dt);
      // Add to the freshly smoothed pose, never to last frame's secondary offset.
      this.s.bone(name).pose.drot = this.tp[this.B[name]].drot + spring.value;
    }
    this.tail.target = -.035 * acceleration + .028 * Math.sin(t * 1.1);
    this.tail.step(dt);
    this.s.bone('tail').pose.drot = this.tp[this.B.tail].drot + this.tail.value;
  }
  private blink(dt: number) {
    if (this.blinkPhase < 0) {
      this.blinkWait -= dt;
      if (this.blinkWait <= 0) this.blinkPhase = 0;
    }
    let openness = 1;
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt;
      const p = this.blinkPhase;
      openness = p < .065 ? lerp(1, .08, ease(p / .065)) : lerp(.08, 1, ease((p - .065) / .13));
      if (p >= .195) { this.blinkPhase = -1; this.blinkWait = 2.2 + Math.random() * 3.5; }
    }
    this.s.bone('eyeL').pose.sy = openness;
    this.s.bone('eyeR').pose.sy = openness;
  }
}
