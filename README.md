# Aether: The Last Resonance

Plataformas atmosférico de física en el navegador. Eres **Luma**, una chispa de luz que debe despertar al *Golem Estelar*, una nave-planeta abandonada, usando la inercia y un gancho de luz como únicas herramientas.

<!-- Reemplaza esta línea por el GIF del juego: ![Gameplay](docs/gameplay.gif) -->

**[▶ Jugar en el navegador](#)** <!-- Enlace de GitHub Pages cuando esté publicado -->

## Controles

| Acción | Teclado / ratón |
|---|---|
| Moverse | `A` / `D` o flechas |
| Saltar | `Espacio`, `W` o flecha arriba |
| Planear (tras usar el gancho) | Mantener `Espacio` en el aire |
| Gancho de luz | `Click` sobre un nodo (mantener) |
| Zoom | Rueda del ratón |
| Pausa | `Esc` |

## El nivel

1. **El Despertar:** tutorial sin caídas mortales: moverse, saltar, orbes de energía y trampas.
2. **El Abismo:** islas sobre el vacío; el gancho es obligatorio. Balancéate y suelta en la subida para salir disparado, y planea después del gancho.
3. **La Colmena:** subida vertical perseguido por drones cazadores, hasta el núcleo.

Tu energía se agota con el tiempo: recoge orbes para sobrevivir. Al morir reapareces en el último checkpoint. Al terminar ves tu tiempo, tus caídas y tu mejor marca.

## Aspectos técnicos

Todo el juego está en un único `index.html`, con JavaScript sin librerías y Canvas 2D.

- **Bucle de paso fijo** a 60 ticks/s con acumulador: la física es idéntica en monitores de 60, 120 o 144 Hz.
- **Gancho tipo péndulo:** restricción de cuerda rígida que separa la velocidad en componente radial y tangencial, conservación del momento angular al recoger la cuerda (gira más rápido al acortarse) y lanzamiento tipo honda al soltar.
- **Movimiento ajustado:** *coyote time*, *jump buffer* y *squash & stretch*.
- **IA de drones** con máquina de estados (patrulla → persecución → regreso).
- **Audio procedural** con Web Audio API (osciladores, sin archivos de sonido).
- **Sprite animado** según la velocidad, con volteo e inclinación hacia la dirección del movimiento.
- **Validador de nivel automático** (`tools/validate_level.js`): un bot que usa la física real del juego prueba miles de secuencias de inputs para verificar que cada tramo tiene solución y medir el margen de cada salto.

## Ejecutar en local

Abre `index.html` en el navegador; no necesita servidor ni instalación.

## Modificar el juego

- **Física, cámara y energía:** objeto `CONFIG` al principio del script.
- **Mapa:** objeto `LEVEL_DATA` (plataformas, nodos, orbes, trampas, drones, checkpoints y carteles). Después de editarlo, comprueba que sigue siendo jugable:

  ```bash
  node tools/validate_level.js
  ```

- **Sprite de Luma:** `Imagenes/sprite-orbe/luma.png` se genera desde la hoja original con:

  ```bash
  python tools/build_luma.py Gemini_Generated_Image_1s4mb51s4mb51s4m.png Imagenes/sprite-orbe/luma.png preview.png
  ```

  Requiere Pillow y NumPy.

## Estructura

```
index.html                Juego completo (HTML + CSS + JS)
Imagenes/                 Fondos parallax, textura de suelo y sprite de Luma
tools/validate_level.js   Validador de alcanzabilidad del nivel
tools/build_luma.py       Generador del atlas del sprite
GameDesign.pdf            Documento de diseño
Plan de desarrollo.pdf    Plan de desarrollo
```

## Créditos

Diseño y desarrollo: Andres Otalvaro Sanchez.
Sprite de Luma generado con IA (Google Gemini) y procesado para el juego.
<!-- Completar: origen/licencia de los fondos (Imagenes/capa0.png, capa1.png, capa2.jpeg) -->

