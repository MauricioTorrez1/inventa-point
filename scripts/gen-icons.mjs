// Genera los iconos de la PWA (gradiente del acento + bolsa de compras) sin
// dependencias: dibuja en un buffer RGBA y lo codifica como PNG con zlib.
// Reejecutar con:  node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(OUT, { recursive: true })

const C0 = [99, 102, 241] // índigo
const C1 = [139, 92, 246] // violeta
const clamp = (v, a, b) => Math.min(Math.max(v, a), b)
const lerp = (a, b, t) => a + (b - a) * t

// Cobertura (0..1) de un rectángulo de esquinas redondeadas, con antialias 1px.
function roundedCoverage(px, py, x0, y0, x1, y1, r) {
  const cx = clamp(px, x0 + r, x1 - r)
  const cy = clamp(py, y0 + r, y1 - r)
  if (px < x0 || px > x1 || py < y0 || py > y1) {
    // fuera del bounding box: solo cuenta si está dentro del radio de esquina
  }
  const dx = px - cx
  const dy = py - cy
  const dist = Math.hypot(dx, dy)
  const inX = px >= x0 && px <= x1
  const inY = py >= y0 && py <= y1
  if (!inX || !inY) return 0
  return clamp(r - dist + 0.5, 0, 1)
}

function drawIcon(size, { rounded }) {
  const buf = Buffer.alloc(size * size * 4)
  const cornerR = rounded ? size * 0.22 : 0

  // Glifo: gráfico de barras ascendente (analítica / ventas).
  const baseY = size * 0.68
  const barR = size * 0.022
  const bars = [
    [0.30, 0.52], // [x0, topY] en fracciones
    [0.44, 0.42],
    [0.58, 0.32],
  ].map(([fx, ftop]) => ({
    x0: size * fx,
    x1: size * (fx + 0.12),
    y0: size * ftop,
  }))

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      // Gradiente diagonal del acento.
      const t = (x + y) / (2 * size)
      let r = lerp(C0[0], C1[0], t)
      let g = lerp(C0[1], C1[1], t)
      let b = lerp(C0[2], C1[2], t)

      // Glifo blanco: tres barras redondeadas de altura creciente.
      let glyph = 0
      for (const bar of bars) {
        glyph = Math.max(glyph, roundedCoverage(x + 0.5, y + 0.5, bar.x0, bar.y0, bar.x1, baseY, barR))
      }
      r = lerp(r, 255, glyph)
      g = lerp(g, 255, glyph)
      b = lerp(b, 255, glyph)

      const a = rounded
        ? roundedCoverage(x + 0.5, y + 0.5, 0, 0, size, size, cornerR) * 255
        : 255

      buf[i] = Math.round(r)
      buf[i + 1] = Math.round(g)
      buf[i + 2] = Math.round(b)
      buf[i + 3] = Math.round(a)
    }
  }
  return buf
}

// --- Codificador PNG mínimo (RGBA, sin filtros) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // raw con byte de filtro 0 por fila
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const targets = [
  { file: 'icon-192.png', size: 192, rounded: true },
  { file: 'icon-512.png', size: 512, rounded: true },
  { file: 'icon-maskable-512.png', size: 512, rounded: false },
  { file: 'apple-touch-icon.png', size: 180, rounded: false }, // iOS aplica su propio recorte
]
for (const { file, size, rounded } of targets) {
  const rgba = drawIcon(size, { rounded })
  writeFileSync(resolve(OUT, file), encodePng(rgba, size))
  console.log('✓', file)
}
