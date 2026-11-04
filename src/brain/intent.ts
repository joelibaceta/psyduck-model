// Chat -> intent. Fast rule/keyword path for obvious phrases, plus a lazy
// MiniLM embedding classifier (Transformers.js / WASM) for fuzzy ones.
import type { Intent } from '../anim/controller';

interface IntentDef { intent: Intent; keywords: RegExp; prototypes: string[]; }

const DEFS: IntentDef[] = [
  { intent: 'wave', keywords: /\b(hola|holi|buenas|buenos|hey|hello|hi|saludos|qué tal|que tal|saluda|preséntate|presentate)\b/i,
    prototypes: ['hola psyduck', 'buenos días', 'salúdame', 'hey qué tal', 'preséntate'] },
  { intent: 'walk_left', keywords: /\b(izquierda|left|a la izq)\b/i,
    prototypes: ['camina a la izquierda', 've hacia la izquierda', 'muévete a la izquierda'] },
  { intent: 'walk_right', keywords: /\b(derecha|right|a la der)\b/i,
    prototypes: ['camina a la derecha', 've hacia la derecha', 'muévete a la derecha'] },
  { intent: 'jump', keywords: /\b(salta|salto|brinca|brinco|jump|hop)\b/i,
    prototypes: ['salta', 'da un brinco', 'pega un salto'] },
  { intent: 'touch_head', keywords: /\b(cabeza|head|tócate|tocate|duele|dolor|migraña|migrana|headache)\b/i,
    prototypes: ['tócate la cabeza', 'te duele la cabeza', 'agárrate la cabeza', 'dolor de cabeza'] },
  { intent: 'happy', keywords: /\b(baila|bailar|feliz|alegre|contento|happy|dance|genial|yay|fiesta|celebra)\b/i,
    prototypes: ['baila', 'ponte feliz', 'estás contento', 'celebra', 'qué alegría'] },
  { intent: 'walk_right', keywords: /\b(camina|anda|muévete|muevete|pasea|walk|avanza|ve)\b/i,
    prototypes: ['camina', 'da un paseo', 'muévete un poco', 'anda'] },
  { intent: 'confused', keywords: /\b(no entiendo|confundido|confused|qué eres|que eres|no sé|no se)\b/i,
    prototypes: ['no entiendo', 'estás confundido', 'qué pasa'] },
];

export function ruleClassify(text: string): Intent | null {
  for (const d of DEFS) if (d.keywords.test(text)) return d.intent;
  return null;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

export class Brain {
  private extractor: any = null;
  private protoVecs: { intent: Intent; vec: Float32Array }[] = [];
  ready = false;
  loading = false;

  async load(onStatus?: (s: string) => void) {
    if (this.loading || this.ready) return;
    this.loading = true;
    try {
      onStatus?.('cargando cerebro…');
      const { pipeline } = await import('@huggingface/transformers');
      this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      for (const d of DEFS) {
        for (const proto of d.prototypes) {
          this.protoVecs.push({ intent: d.intent, vec: await this.embed(proto) });
        }
      }
      this.ready = true;
      onStatus?.('cerebro listo');
    } catch (e) {
      console.warn('[brain] no se pudo cargar MiniLM, uso solo reglas', e);
      onStatus?.('modo reglas');
    } finally {
      this.loading = false;
    }
  }

  private async embed(text: string): Promise<Float32Array> {
    const out = await this.extractor(text, { pooling: 'mean', normalize: true });
    return out.data as Float32Array;
  }

  async classify(text: string): Promise<Intent> {
    const rule = ruleClassify(text);
    if (rule) return rule;
    if (this.ready) {
      try {
        const v = await this.embed(text);
        let best: Intent = 'confused', bestScore = -1;
        for (const p of this.protoVecs) {
          const s = cosine(v, p.vec);
          if (s > bestScore) { bestScore = s; best = p.intent; }
        }
        return bestScore >= 0.35 ? best : 'confused';
      } catch { /* fall through */ }
    }
    return 'confused';
  }
}
