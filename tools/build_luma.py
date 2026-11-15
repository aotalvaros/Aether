"""Extrae los 8 frames del orbe de la hoja de Gemini y genera un atlas PNG con transparencia real.
Uso (desde la raíz del proyecto):
  python tools/build_luma.py Gemini_Generated_Image_1s4mb51s4mb51s4m.png Imagenes/sprite-orbe/luma.png preview.png
Requiere Pillow y NumPy."""
import sys, numpy as np
from PIL import Image

src = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(np.float32)
H, W, _ = src.shape

# Centro del núcleo de cada frame, y límites izquierdo/derecho (para no tomar orbes vecinos).
# Orden en el atlas: 0-3 reposo (estela hacia arriba), 4 lento, 5 medio, 6 rápido, 7 muy rápido.
FRAMES = [
    ((193, 230), 63, 360),    # banda 1, frame 1
    ((497, 229), 380, 680),   # banda 1, frame 2
    ((501, 676), 385, 700),   # banda 2, frame 2
    ((824, 675), 705, 1000),  # banda 2, frame 3
    ((182, 676), 52, 375),    # banda 2, frame 1
    ((813, 229), 690, 1010),  # banda 1, frame 3
    ((1123, 231), 1015, 1395),# banda 1, frame 4
    ((1511, 245), 1400, 2040),# banda 1, frame 5
]
LEFT, RIGHT, UP, DOWN = 130, 500, 200, 80   # tamaño del frame alrededor del ancla (núcleo)
CORE_R = 54        # radio del núcleo sólido (ojos incluidos)
BELOW_KEEP = 70    # por debajo del centro, solo se conserva el halo dentro de este radio (quita la sombra de suelo)
FADE = 12
NOISE = 0.04     # umbral de ruido del fondo

FW, FH = LEFT + RIGHT, UP + DOWN
atlas = np.zeros((FH, FW * len(FRAMES), 4), np.float32)

for i, ((cx, cy), xl, xr) in enumerate(FRAMES):
    y0, x0 = cy - UP, cx - LEFT
    win = np.zeros((FH, FW, 3), np.float32)
    sy0, sy1 = max(0, y0), min(H, y0 + FH)
    sx0, sx1 = max(0, x0), min(W, x0 + FW)
    win[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = src[sy0:sy1, sx0:sx1]

    # Fondo por fila: mediana de la fila completa de la hoja (el fondo es un degradado vertical gris)
    rows = np.clip(np.arange(y0, y0 + FH), 0, H - 1)
    bg = np.median(src[rows], axis=1)                 # (FH, 3)
    emitted = np.clip(win - bg[:, None, :], 0, None)
    alpha = np.clip(emitted.max(axis=2) / np.maximum(1, 255 - bg.max(axis=1))[:, None], 0, 1)
    # El brillo real es cian; los restos grises del fondo no tienen color.
    # Se usa la saturación (max-min) para descartarlos y se resta un umbral de ruido.
    chroma = (win.max(axis=2) - win.min(axis=2)) / 255
    alpha = np.minimum(alpha, chroma * 3)
    alpha = np.clip((alpha - NOISE) / (1 - NOISE), 0, 1)

    yy, xx = np.mgrid[0:FH, 0:FW]
    dist = np.hypot(xx - LEFT, yy - UP)
    # Núcleo sólido: color original y opaco (así los ojos oscuros no quedan transparentes)
    core = np.clip((CORE_R - dist) / 2 + 0.5, 0, 1)
    color = np.where(alpha[..., None] > 0, emitted / np.maximum(alpha[..., None], 1e-4), 0)
    color = color * (1 - core[..., None]) + win * core[..., None]
    alpha = np.maximum(alpha, core)

    # Máscaras: límites horizontales del frame y eliminación de la sombra bajo el orbe
    gx = xx + x0
    m = np.clip((gx - xl) / FADE, 0, 1) * np.clip((xr - gx) / FADE, 0, 1)
    below = yy > UP
    m *= np.where(below, np.clip((BELOW_KEEP + FADE - dist) / FADE, 0, 1), 1)
    m *= np.clip(yy / FADE, 0, 1) * np.clip((FH - 1 - yy) / FADE, 0, 1)
    alpha *= m

    atlas[:, i * FW:(i + 1) * FW, :3] = np.clip(color, 0, 255)
    atlas[:, i * FW:(i + 1) * FW, 3] = alpha * 255

img = Image.fromarray(atlas.round().astype(np.uint8), "RGBA")
# Reducir a la mitad con alfa premultiplicado (evita bordes oscuros)
img = img.convert("RGBa").resize((img.width // 2, img.height // 2), Image.LANCZOS).convert("RGBA")
img.save(sys.argv[2], optimize=True)
print("atlas", img.size, "frame", (FW // 2, FH // 2), "ancla", (LEFT // 2, UP // 2))

# Vista previa sobre fondo del juego y sobre gris claro (para detectar halos)
prev = Image.new("RGBA", (img.width, img.height * 2), (1, 1, 3, 255))
light = Image.new("RGBA", img.size, (120, 120, 130, 255))
prev.paste(light, (0, img.height))
prev.alpha_composite(img, (0, 0)); prev.alpha_composite(img, (0, img.height))
prev.convert("RGB").save(sys.argv[3])
