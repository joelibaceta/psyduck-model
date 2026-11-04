import type { Psyduck } from '../character/psyduck';
import type { StageView } from '../rig/mesh';

const NS = 'http://www.w3.org/2000/svg';

/** Hand-drawn Bézier artwork, animated by the existing bone hierarchy. */
export class VectorPsyduck {
  private svg = document.createElementNS(NS, 'svg');
  private root: SVGGElement;
  private bindings: { el: SVGGElement; bone: string }[] = [];
  private arms: { el: SVGPathElement; side: string }[] = [];
  constructor(private p: Psyduck) {
    this.svg.id = 'character';
    this.svg.setAttribute('aria-label', 'Psyduck animado');
    this.svg.innerHTML = `<g id="duck-shadow"><ellipse fill="#173d29" opacity=".19" cx="0" cy="0" rx=".95" ry=".12"/></g><g id="duck-art" fill="#f9cc08" stroke="#252b2c" stroke-width=".034" stroke-linecap="round" stroke-linejoin="round"></g>`;
    this.root = this.svg.querySelector('#duck-art')!;
    this.part('tail', `<path d="M-.55 .51 Q-1.18 .65-1.32 1.04 Q-1.33 1.12-1.22 1.08 Q-.84 .9-.53 .97Z"/>`);
    this.part('legL_ft', `<path fill="#fff0ad" d="M-.27 .19 Q-.53 .23-.66 .06 L-.88-.12 Q-.89-.19-.77-.17 L-.57-.13 Q-.45-.24-.37-.17 Q-.24-.25-.17-.14 L.03-.12 Q.1-.09.02-.04Z"/>`);
    this.part('legR_ft', `<path fill="#fff0ad" d="M.27 .19 Q.53 .23.66 .06 L.88-.12 Q.89-.19.77-.17 L.57-.13 Q.45-.24.37-.17 Q.24-.25.17-.14 L-.03-.12 Q-.1-.09-.02-.04Z"/>`);
    this.part('spine', `<path d="M-.66 1.95 C-.82 1.72-1.03 1.17-.98 .77 C-.95 .32-.57 .17 .02 .17 C.64 .16 1.01 .41 1 .87 C.98 1.28.79 1.79.63 1.98Z"/><path fill="#dba600" stroke="none" d="M-.9 .65 Q-.67 .25 .03 .28 Q.7 .25.93 .71 Q.84 .25 .1 .2 Q-.73 .18-.9 .65"/>`);
    const hairs = [
      ['hairL0', 'M-.17 3.33 Q-.31 3.67-.5 3.84 Q-.55 3.91-.61 3.85 Q-.64 3.81-.56 3.71 L-.31 3.28Z'],
      ['hairB0', 'M-.06 3.35 L-.14 3.97 Q-.14 4.06-.06 4.06 Q.01 4.06.01 3.96 L.07 3.36Z'],
      ['hairR0', 'M.12 3.34 Q.23 3.62.34 3.74 Q.4 3.8.45 3.75 Q.48 3.7.42 3.61 L.24 3.3Z'],
    ];
    for (const [bone, d] of hairs) this.part(bone, `<path fill="#252b2c" d="${d}"/>`);
    this.part('head', `<path d="M-1.03 2.47 C-1.08 2.93-.71 3.5-.08 3.51 C.56 3.55 1.03 3.14 1.05 2.65 C1.07 2.29.91 1.96.65 1.79 Q.02 1.55-.64 1.83 C-.91 1.96-1.01 2.17-1.03 2.47Z"/>`);
    this.part('eyeL', `<path fill="#fffef5" d="M-.76 2.91 C-.6 3.06-.29 2.97-.26 2.79 C-.23 2.62-.43 2.53-.63 2.58 C-.82 2.63-.89 2.78-.76 2.91Z"/><ellipse fill="#252b2c" stroke="none" cx="-.49" cy="2.77" rx=".027" ry=".037"/>`);
    this.part('eyeR', `<path fill="#fffef5" d="M.29 2.91 C.46 3.06.76 2.96.8 2.79 C.83 2.61.63 2.54.44 2.58 C.25 2.62.16 2.78.29 2.91Z"/><ellipse fill="#252b2c" stroke="none" cx=".52" cy="2.77" rx=".027" ry=".037"/>`);
    this.part('beak', `<path fill="#fff0aa" d="M-.74 2.32 Q-.47 2.38-.32 2.43 Q-.18 2.66 .03 2.64 Q.23 2.65.38 2.46 Q.56 2.39.76 2.34 C.73 2.22.88 2.06.74 1.89 C.57 1.68-.48 1.65-.72 1.88 Q-.86 1.97-.77 2.15Z"/><path fill="#dfcb80" stroke="none" d="M-.7 1.93 Q-.05 1.66.75 1.94 Q.6 1.73.04 1.74 Q-.54 1.73-.7 1.93Z"/><path fill="none" stroke-width=".026" d="M-.16 2.43 l.055-.055 M.2 2.43 l-.055-.055"/>`);
    for (const side of ['L', 'R']) {
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('fill', '#f9cc08');
      this.root.append(el); this.arms.push({ el, side });
    }
    document.getElementById('app')!.prepend(this.svg);
  }
  private part(bone: string, html: string) {
    const el = document.createElementNS(NS, 'g'); el.innerHTML = html;
    this.root.append(el); this.bindings.push({ el, bone });
  }
  draw(v: StageView, w: number, h: number) {
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const unit = h / v.unitsVisible;
    const x = w / 2 + v.rootX * unit, y = h * (1 - v.feetFrac);
    this.root.setAttribute('transform', `translate(${x} ${y - v.rootY * unit}) scale(${unit * v.scaleX * v.flip} ${-unit * v.scaleY})`);
    this.svg.querySelector('#duck-shadow')!.setAttribute('transform', `translate(${x} ${y + unit * .1}) scale(${unit / (1 + Math.max(0, v.rootY) * .4)} ${unit})`);
    for (const {el, bone} of this.bindings) el.setAttribute('transform', `matrix(${Array.from(this.p.skel.bone(bone).skin).join(' ')})`);
    // A continuous curved silhouette around the animated shoulder, elbow and hand.
    for (const {el, side} of this.arms) {
      const a = this.p.skel.bone(`arm${side}_up`).world;
      const b = this.p.skel.bone(`arm${side}_fore`).world;
      const c = this.p.skel.bone(`arm${side}_hand`).world;
      const ax = a[4], ay = a[5], bx = b[4], by = b[5], cx = c[4], cy = c[5];
      const len = Math.hypot(cx - ax, cy - ay) || 1;
      const nx = -(cy-ay)/len, ny = (cx-ax)/len;
      const q = (x: number, y: number, r: number) => `${x+nx*r} ${y+ny*r}`;
      el.setAttribute('d', `M${q(ax,ay,.14)} Q${q(bx,by,.24)} ${q(cx,cy,.16)} Q${cx+(cx-bx)*.27} ${cy+(cy-by)*.27} ${q(cx,cy,-.16)} Q${q(bx,by,-.24)} ${q(ax,ay,-.14)}`);
    }
  }
}
