# animar · Psyduck 🦆

Un Psyduck de Pokémon dibujado con curvas vectoriales SVG en **frontend puro**,
que reacciona al chat y genera su movimiento proceduralmente — sin frames
pregrabados. El bosque es una ilustración SVG local.

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
| Render | `src/vector/psyduck.ts`, `public/forest.svg` | Personaje vectorial animado + bosque ilustrado en capas |
| Esqueleto | `src/rig/skeleton.ts` | Jerarquía de huesos 2D + matrices de skinning (linear blend) |
| Mallas | `src/rig/mesh.ts`, `src/rig/shapes.ts` | Mallas generadas por código con skinning en CPU; sombreado que finge volumen (normal fake + rim light) y outline |
| Físicas | `src/rig/spring.ts`, `src/rig/ik.ts` | Springs amortiguados (pelos/cola/bob) + IK analítica de 2 huesos |
| Personaje | `src/character/psyduck.ts` | Ensambla el rig; conserva el generador de mallas del render anterior |
| Animación | `src/anim/controller.ts` | Máquina de estados de comportamientos con blending, locomoción, squash & stretch |
| Cerebro | `src/brain/intent.ts` | Reglas/keywords + embeddings MiniLM (Transformers.js/WASM, lazy) |
| UI | `src/ui/sound.ts`, `index.html`, `src/main.ts` | Chat, globo, sonido "psy" |

### Estética vectorial

El render activo usa curvas Bézier SVG, colores planos y contornos oscuros.
Las piezas siguen las matrices del esqueleto y los brazos se dibujan como curvas
continuas entre hombro, codo y mano. Se conservan IK, resortes, parpadeo y
squash & stretch. El render WebGL anterior permanece disponible en `src/gl/`,
`src/rig/mesh.ts` y `src/background/forest.ts`, pero no se usa en la escena actual.

MiniLM se descarga al interactuar por primera vez; después puede aprovechar
la caché del navegador. Si no carga, el chat sigue funcionando mediante reglas.
