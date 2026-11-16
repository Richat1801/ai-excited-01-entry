// ai-excited-01 entry: "The Sky Fits in a Teacup!"
// A goldfish leaps out of a teacup on a night windowsill and its splash
// bursts into stars that arc up to a full moon — a whole sky hiding in a
// teacup. Fully procedural SDF scene (Node standard library only).
// Writes /output/entry.png (or $MAKEFUN_OUTPUT_DIR/entry.png).
// Deterministic: pure math + a fixed-seed PRNG — two runs, same bytes.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const W = 1024;
const H = 1024;

// ---------- tiny float framebuffer ----------
type Col = [number, number, number, number]; // r, g, b (0..255), a (0..1)
const buf = new Float32Array(W * H * 4);

function blend(x: number, y: number, cov: number, c: Col): void {
  if (cov <= 0) return;
  const i = (y * W + x) * 4;
  const a = cov * c[3];
  if (a <= 0) return;
  const ia = 1 - a;
  buf[i] = buf[i] * ia + c[0] * a;
  buf[i + 1] = buf[i + 1] * ia + c[1] * a;
  buf[i + 2] = buf[i + 2] * ia + c[2] * a;
  buf[i + 3] = buf[i + 3] * ia + 1 * a;
}

// ---------- deterministic PRNG (mulberry32, fixed seed) ----------
let seed = 20261116;
function rnd(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- SDF helpers ----------
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const sdCircle = (px: number, py: number, cx: number, cy: number, r: number): number =>
  Math.hypot(px - cx, py - cy) - r;
const sdEllipse = (px: number, py: number, cx: number, cy: number, rx: number, ry: number): number => {
  const x = (px - cx) / rx;
  const y = (py - cy) / ry;
  return (Math.hypot(x, y) - 1) * Math.min(rx, ry);
};
// rotated ellipse: ang rotates the shape clockwise on screen (y down)
function sdRotEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number, ang: number): number {
  const dx = px - cx, dy = py - cy;
  const c = Math.cos(ang), s = Math.sin(ang);
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  return (Math.hypot(u / rx, v / ry) - 1) * Math.min(rx, ry);
}
function sdSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}
function sdTri(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const d1 = sdSeg(px, py, ax, ay, bx, by);
  const d2 = sdSeg(px, py, bx, by, cx, cy);
  const d3 = sdSeg(px, py, cx, cy, ax, ay);
  const s = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  const inside = (s >= 0 && s2 >= 0 && s3 >= 0) || (s <= 0 && s2 <= 0 && s3 <= 0);
  const d = Math.min(d1, d2, d3);
  return inside ? -d : d;
}
function sdBox(px: number, py: number, cx: number, cy: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px - cx) - (hx - r);
  const qy = Math.abs(py - cy) - (hy - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}
const cov = (d: number, soft: number): number => clamp01(0.5 - d / (2 * soft));

// paint one shape: f(x,y) -> signed distance; local box limits the scan
function paint(x0: number, y0: number, x1: number, y1: number, soft: number, c: Col, f: (x: number, y: number) => number): void {
  const m = soft + 2;
  const xa = Math.max(0, Math.floor(x0 - m)), xb = Math.min(W - 1, Math.ceil(x1 + m));
  const ya = Math.max(0, Math.floor(y0 - m)), yb = Math.min(H - 1, Math.ceil(y1 + m));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      blend(x, y, cov(f(x + 0.5, y + 0.5), soft), c);
    }
  }
}
// hard-edged filled rectangle (for bitmap text)
function fillRect(x0: number, y0: number, x1: number, y1: number, c: Col): void {
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(W - 1, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H - 1, Math.ceil(y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) blend(x, y, 1, c);
  }
}

// ---------- palette ----------
const INK: Col = [16, 20, 52, 1];
const CREAM: Col = [255, 243, 196, 1];
const MOON: Col = [255, 246, 216, 1];
const MOON_SHADE: Col = [232, 214, 170, 1];
const FISH: Col = [255, 158, 44, 1];
const FISH_DEEP: Col = [240, 110, 26, 1];
const FISH_PALE: Col = [255, 210, 122, 1];
const FIN: Col = [255, 178, 84, 0.92];
const CUP: Col = [247, 240, 220, 1];
const CUP_BLUE: Col = [62, 111, 176, 1];
const TEA: Col = [201, 138, 46, 1];
const TEA_DARK: Col = [138, 90, 30, 1];
const SPLASH: Col = [190, 235, 255, 0.95];
const STAR_GOLD: Col = [255, 214, 120, 1];
const DARK: Col = [20, 26, 58, 1];

// ---------- night sky: indigo top -> violet -> teal glow at the sill ----------
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / H;
    let r: number, g: number, b: number;
    if (t < 0.5) {
      const u = t / 0.5;
      r = 11 + 16 * u; g = 14 + 26 * u; b = 42 + 46 * u;
    } else {
      const u = (t - 0.5) / 0.5;
      r = 27 - 4 * u; g = 40 + 30 * u; b = 88 + 6 * u;
    }
    // warm glow low near the table, cool glow around the moon
    const tableGlow = Math.max(0, 1 - Math.abs(y - 880) / 320) * Math.max(0, 1 - Math.abs(x - 320) / 700);
    const moonGlow = Math.max(0, 1 - Math.hypot(x - 820, y - 300) / 520);
    r = Math.min(255, r + 26 * tableGlow + 10 * moonGlow);
    g = Math.min(255, g + 14 * tableGlow + 8 * moonGlow);
    b = Math.min(255, b + 2 * tableGlow + 2 * moonGlow);
    const i = (y * W + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 1;
  }
}

// ---------- stars: fixed-seed scatter, denser away from the moon ----------
for (let i = 0; i < 170; i++) {
  const sx = rnd() * W, sy = rnd() * 760;
  const dMoon = Math.hypot(sx - 820, sy - 300);
  if (dMoon < 150 && rnd() < 0.8) continue;
  const r = 0.8 + rnd() * 1.8;
  const a = 0.35 + rnd() * 0.65;
  const c: Col = rnd() < 0.25 ? [255, 214, 120, a] : [235, 242, 255, a];
  paint(sx - r - 2, sy - r - 2, sx + r + 2, sy + r + 2, 1.2, c, (x, y) => sdCircle(x, y, sx, sy, r));
}
// a few four-point sparkles
function sparkle(cx: number, cy: number, r: number, c: Col): void {
  paint(cx - r, cy - r, cx + r, cy + r, 2, c, (x, y) => {
    const dx = Math.abs(x - cx) / r, dy = Math.abs(y - cy) / r;
    return (Math.pow(dx, 0.55) + Math.pow(dy, 0.55) - 1) * r * 0.55;
  });
}
sparkle(140, 260, 16, [255, 240, 190, 0.9]);
sparkle(480, 120, 12, [255, 240, 190, 0.85]);
sparkle(950, 560, 13, [200, 235, 255, 0.85]);
sparkle(90, 620, 11, [255, 220, 150, 0.8]);

// ---------- the big full moon, upper right ----------
paint(620, 100, 1024, 500, 60, [255, 233, 168, 0.4], (x, y) => sdCircle(x, y, 820, 300, 175));
paint(690, 170, 950, 430, 10, MOON, (x, y) => sdCircle(x, y, 820, 300, 118));
paint(690, 170, 950, 430, 6, MOON_SHADE, (x, y) => sdCircle(x, y, 820, 300, 118) > -14 ? 10 : -10);
// craters
paint(740, 230, 820, 310, 5, [226, 206, 158, 0.9], (x, y) => sdCircle(x, y, 780, 270, 22));
paint(830, 300, 900, 370, 5, [226, 206, 158, 0.9], (x, y) => sdCircle(x, y, 862, 335, 16));
paint(780, 340, 830, 390, 4, [226, 206, 158, 0.9], (x, y) => sdCircle(x, y, 805, 365, 11));
paint(850, 220, 900, 270, 4, [226, 206, 158, 0.85], (x, y) => sdCircle(x, y, 875, 245, 10));

// ---------- windowsill / table: warm wood band along the bottom ----------
for (let y = 884; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = (y - 884) / (H - 884);
    const i = (y * W + x) * 4;
    // warm walnut, darkening toward the bottom edge
    buf[i] = 122 - 38 * t; buf[i + 1] = 74 - 24 * t; buf[i + 2] = 40 - 12 * t; buf[i + 3] = 1;
  }
}
// table edge highlight
paint(0, 878, 1024, 892, 2, [196, 140, 84, 0.9], (x, y) => Math.abs(y - 885) - 2);
// soft shadow under the saucer
paint(140, 880, 500, 960, 16, [40, 20, 8, 0.35], (x, y) => sdEllipse(x, y, 320, 920, 165, 26));

// ---------- saucer + teacup, bottom left ----------
// saucer
paint(150, 880, 490, 950, 4, CUP, (x, y) => sdEllipse(x, y, 320, 914, 158, 24));
paint(150, 880, 490, 950, 2, CUP_BLUE, (x, y) => Math.abs(sdEllipse(x, y, 320, 914, 138, 19)) - 2);
// cup body (rounded box, slightly tapered look via a shade wedge)
paint(232, 792, 408, 912, 4, CUP, (x, y) => sdBox(x, y, 320, 852, 82, 58, 16));
// blue band around the cup
paint(238, 848, 402, 878, 3, CUP_BLUE, (x, y) => sdBox(x, y, 320, 863, 80, 12, 6));
// shade on the cup's right side
paint(340, 800, 408, 912, 18, [214, 202, 176, 0.55], (x, y) => sdEllipse(x, y, 392, 852, 52, 56));
// cup handle (ring segment on the right)
paint(392, 806, 470, 900, 3, CUP, (x, y) => {
  const d = Math.abs(sdCircle(x, y, 412, 852, 30)) - 7;
  const ang = Math.atan2(y - 852, x - 412);
  return (ang > -1.2 && ang < 1.2) ? d : 10;
});
// tea surface (open top of the cup)
paint(244, 786, 396, 826, 3, TEA, (x, y) => sdEllipse(x, y, 320, 806, 72, 13));
paint(244, 786, 396, 826, 2, TEA_DARK, (x, y) => Math.abs(sdEllipse(x, y, 320, 806, 72, 13)) - 2);
// a ripple where the fish broke the surface
paint(260, 786, 380, 826, 2, [255, 220, 140, 0.8], (x, y) => Math.abs(sdEllipse(x, y, 320, 806, 52, 9)) - 2);

// ---------- steam curls rising from the tea, turning to sparkles ----------
for (let s = 0; s < 2; s++) {
  const bx = 292 + s * 56;
  for (let t = 0; t <= 1.001; t += 0.06) {
    const px = bx + 16 * Math.sin(t * 7 + s * 2.2) * (0.4 + t);
    const py = 800 - t * 150;
    const rr = 5 + t * 7;
    const a = 0.5 * (1 - t);
    paint(px - rr - 2, py - rr - 2, px + rr + 2, py + rr + 2, rr * 0.7, [255, 244, 214, a],
      (x, y) => sdCircle(x, y, px, py, rr));
  }
}
sparkle(300, 640, 9, [255, 240, 190, 0.8]);
sparkle(352, 600, 7, [255, 240, 190, 0.75]);

// ---------- splash: droplets arcing from the cup rim up to the fish ----------
// quadratic bezier: cup rim (352, 796) -> control (470, 600) -> fish tail (520, 500)
function bez(t: number): [number, number] {
  const u = 1 - t;
  const x = u * u * 352 + 2 * u * t * 470 + t * t * 520;
  const y = u * u * 796 + 2 * u * t * 600 + t * t * 500;
  return [x, y];
}
for (let i = 0; i < 16; i++) {
  const t = 0.08 + (i / 15) * 0.86;
  const [dx, dy] = bez(t);
  const jx = (rnd() - 0.5) * 26, jy = (rnd() - 0.5) * 20;
  const r = 4 + rnd() * 13 * (1 - t * 0.4);
  const c: Col = rnd() < 0.5 ? SPLASH : [255, 226, 150, 0.9];
  if (r > 9) paint(dx + jx - r - 6, dy + jy - r - 6, dx + jx + r + 6, dy + jy + r + 6, 5, [150, 210, 255, 0.35], (x, y) => sdCircle(x, y, dx + jx, dy + jy, r + 4));
  paint(dx + jx - r - 2, dy + jy - r - 2, dx + jx + r + 2, dy + jy + r + 2, 2, c, (x, y) => sdCircle(x, y, dx + jx, dy + jy, r));
}
// a few droplets flung wide, catching the light
for (const [dx, dy, r] of [[560, 560, 8], [610, 610, 6], [430, 690, 10], [470, 730, 7]] as const) {
  paint(dx - r - 3, dy - r - 3, dx + r + 3, dy + r + 3, 2, SPLASH, (x, y) => sdCircle(x, y, dx, dy, r));
}

// ---------- galaxy ribbon: the splash becomes stars, fish -> moon's edge ----------
// stops just short of the moon's disc so the trail lands on its rim, not its face
for (let i = 0; i < 26; i++) {
  const t = (i / 25) * 0.22;
  const gx = 700 + t * 130 + 26 * Math.sin(t * 5.2);
  const gy = 380 - t * 110 + 14 * Math.sin(t * 3.1);
  const r = 1.5 + rnd() * 4.5 * (1 - t * 0.5);
  const c: Col = rnd() < 0.4 ? STAR_GOLD : (rnd() < 0.5 ? SPLASH : [255, 255, 255, 0.95]);
  if (r > 3.5) paint(gx - r - 4, gy - r - 4, gx + r + 4, gy + r + 4, 3, [150, 210, 255, 0.3], (x, y) => sdCircle(x, y, gx, gy, r + 3));
  paint(gx - r - 2, gy - r - 2, gx + r + 2, gy + r + 2, 1.5, c, (x, y) => sdCircle(x, y, gx, gy, r));
}

// ---------- the goldfish, leaping up-right along the diagonal ----------
// flowing double tail, fanning down-left from the body rear
paint(380, 470, 540, 620, 4, FIN, (x, y) => sdTri(x, y, 512, 502, 402, 560, 470, 600));
paint(380, 470, 540, 620, 4, FIN, (x, y) => sdTri(x, y, 512, 502, 396, 508, 452, 470));
paint(400, 540, 480, 610, 3, FISH_DEEP, (x, y) => sdTri(x, y, 470, 556, 410, 566, 458, 596));
// dorsal fin on the top edge
paint(540, 330, 660, 420, 3, FIN, (x, y) => sdTri(x, y, 566, 396, 640, 352, 606, 404));
// pectoral fin below the belly
paint(560, 480, 660, 550, 3, FIN, (x, y) => sdTri(x, y, 590, 494, 646, 522, 600, 532));
// body: rotated ellipse, head up-right
paint(480, 330, 740, 560, 5, FISH, (x, y) => sdRotEllipse(x, y, 610, 442, 122, 56, -0.62));
// belly light
paint(520, 400, 700, 530, 10, FISH_PALE, (x, y) => sdRotEllipse(x, y, 622, 468, 88, 34, -0.62));
// back shade
paint(500, 330, 680, 450, 12, FISH_DEEP, (x, y) => sdRotEllipse(x, y, 596, 408, 96, 34, -0.62));
// gill curve
paint(640, 360, 720, 450, 2, [214, 90, 16, 0.85], (x, y) => {
  const d = Math.abs(sdRotEllipse(x, y, 668, 408, 26, 40, -0.62)) - 2;
  return d;
});
// scales: a few pale arcs along the flank
for (const [sx, sy] of [[560, 430], [590, 452], [620, 470], [575, 470], [605, 490]] as const) {
  paint(sx - 12, sy - 12, sx + 12, sy + 12, 2, [255, 226, 150, 0.55], (x, y) => Math.abs(sdCircle(x, y, sx, sy, 9)) - 1.5);
}
// wide eye, looking up at the moon
paint(668, 356, 712, 400, 2, [255, 255, 255, 1], (x, y) => sdCircle(x, y, 690, 378, 13));
paint(676, 364, 706, 394, 1.5, [24, 18, 40, 1], (x, y) => sdCircle(x, y, 692, 380, 7));
paint(680, 366, 694, 380, 1, [255, 255, 255, 1], (x, y) => sdCircle(x, y, 688, 374, 3));
// open mouth, mid-leap gasp
paint(700, 340, 736, 372, 2, [160, 60, 10, 0.95], (x, y) => sdEllipse(x, y, 718, 356, 10, 7));

// ---------- the line to the judge: 5x7 bitmap font, two lines, top centre ----------
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};
function drawText(line: string, cx: number, top: number, scale: number, c: Col): void {
  const adv = 6 * scale; // 5 cols + 1 gap, times scale
  const w = line.length * adv - scale;
  let x = cx - w / 2;
  for (const ch of line) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] === '1') {
          fillRect(x + col * scale, top + row * scale, x + (col + 1) * scale - 1, top + (row + 1) * scale - 1, c);
        }
      }
    }
    x += adv;
  }
}
// dark backing panel so the letters stay legible over the stars
paint(220, 40, 804, 210, 6, [10, 14, 40, 0.55], (x, y) => sdBox(x, y, 512, 125, 280, 82, 18));
// cream letters with a navy drop-shadow, one pixel of offset at this scale
drawText('THE SKY FITS', 512, 66, 6, [12, 16, 44, 1]);
drawText('THE SKY FITS', 512, 62, 6, CREAM);
drawText('IN A TEACUP!', 512, 128, 6, [12, 16, 44, 1]);
drawText('IN A TEACUP!', 512, 124, 6, CREAM);

// ---------- PNG encode (zlib + crc32, written fresh) ----------
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  const row = y * (1 + W * 4);
  raw[row] = 0;
  for (let x = 0; x < W; x++) {
    const s = (y * W + x) * 4, d = row + 1 + x * 4;
    raw[d] = Math.round(buf[s]);
    raw[d + 1] = Math.round(buf[s + 1]);
    raw[d + 2] = Math.round(buf[s + 2]);
    raw[d + 3] = 255;
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
