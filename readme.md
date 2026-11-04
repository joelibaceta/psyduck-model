# animar · Psyduck 🦆

Un Psyduck de Pokémon renderizado en tiempo real en **frontend puro** (WebGL2),
que reacciona al chat y genera su movimiento proceduralmente — sin frames
pregrabados ni assets externos.

## Qué hace

Escríbele en la caja de chat y Psyduck reacciona:

- **hola / hey / buenas** → saluda con la mano ("¡Psy psy!")
- **camina / a la derecha / a la izquierda** → camina cruzando la pantalla
- **salta** → brinco con squash & stretch
- **tócate la cabeza / te duele la cabeza** → su pose icónica de migraña
- **baila / feliz** → saltitos de alegría
- otras frases → se queda confundido (ladea la cabeza)

Dice solo "psy psy" (globo de diálogo + chirrido sintetizado).

## Cómo correrlo

```bash
npm install
npm run dev      # http://localhost:5178
```

Tip: en la consola del navegador tienes `ctrl.trigger('jump')` para probar
acciones directamente (`idle`, `walk_left`, `walk_right`, `jump`, `touch_head`,
`wave`, `happy`, `confused`).

## Arquitectura

```
chat  →  intención  →  comportamiento  →  pose (rig+IK)  →  render (WebGL2)
```

| Capa | Archivo | Qué hace |
|------|---------|----------|
| Render | `src/gl/`, `src/background/forest.ts` | Micro-engine WebGL2 + shader de bosque procedural (parallax, god rays, polen, neblina) |
| Esqueleto | `src/rig/skeleton.ts` | Jerarquía de huesos 2D + matrices de skinning (linear blend) |
| Mallas | `src/rig/mesh.ts`, `src/rig/shapes.ts` | Mallas generadas por código con skinning en CPU; sombreado que finge volumen (normal fake + rim light) y outline |
| Físicas | `src/rig/spring.ts`, `src/rig/ik.ts` | Springs amortiguados (pelos/cola/bob) + IK analítica de 2 huesos |
| Personaje | `src/character/psyduck.ts` | Ensambla el rig y las partes de Psyduck |
| Animación | `src/anim/controller.ts` | Máquina de estados de comportamientos con blending, locomoción, squash & stretch |
| Cerebro | `src/brain/intent.ts` | Reglas/keywords + embeddings MiniLM (Transformers.js/WASM, lazy) |
| UI | `src/ui/sound.ts`, `index.html`, `src/main.ts` | Chat, globo, sonido "psy" |

### Por qué 2D procedural y no "monigote"

El detalle que evita el look burdo: cada parte es una **malla deformable** cuyos
vértices están pesados a varios huesos (las extremidades se doblan como goma, no
giran en un pivote), el sombreado calcula un normal falso por fragmento para dar
**volumen** real, hay **outline** tipo ilustración, y las físicas de resorte dan
inercia/overshoot a pelos y cola. El esqueleto se mueve con IK, squash & stretch
y anticipación — los principios clásicos de animación, en código.

## Decisiones

- **WebGL2 puro** (sin framework) para control total del skinning y los shaders.
- **Sin assets**: shapes y texturas son procedurales → cero copyright, todo editable.
- **Cerebro offline**: MiniLM corre en el navegador; si no carga, cae a reglas.
