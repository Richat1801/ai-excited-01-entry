// The Sky Fits in a Teacup! — ai-excited-01
// A goldfish leaps out of a teacup on a night windowsill and its splash
// bursts into stars that arc up to a big cratered full moon: a whole sky
// hiding in a teacup. Fully procedural SDF render, Node stdlib only,
// own PNG encoder (node:zlib + CRC32). Deterministic: no clock, no
// Math.random — every run writes byte-identical output.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const W = 1024;
const H = 1024;
const img = new Uint8Array(W * H * 4);

type RGB = [number, number, number];

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function sstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
// Deterministic PRNG (mulberry32).
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setPx(x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 4;
  const ia = 1 - a;
  img[i] = Math.round(c[0] * a + img[i] * ia);
  img[i + 1] = Math.round(c[1] * a + img[i + 1] * ia);
  img[i + 2] = Math.round(c[2] * a + img[i + 2] * ia);
  img[i + 3] = 255;
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// ---- sky ----
for (let y = 0; y < H; y++) {
  const t = y / H;
  // Deep indigo overhead melting into a warmer dusk band at the sill.
  const top: RGB = [10, 14, 42];
  const mid: RGB = [24, 34, 84];
  const low: RGB = [58, 52, 110];
  const c = t < 0.55 ? mix(top, mid, t / 0.55) : mix(mid, low, (t - 0.55) / 0.45);
  for (let x = 0; x < W; x++) {
    const g1 = Math.exp(-(Math.pow((x - 210) / 420, 2) + Math.pow((y - 180) / 300, 2)));
    const g2 = Math.exp(-(Math.pow((x - 880) / 380, 2) + Math.pow((y - 620) / 260, 2)));
    const cc: RGB = [
      clamp(c[0] + g1 * 26 + g2 * 14, 0, 255),
      clamp(c[1] + g1 * 18 + g2 * 22, 0, 255),
      clamp(c[2] + g1 * 52 + g2 * 30, 0, 255),
    ];
    // Gentle vignette so the centre glows.
    const vx = (x - W / 2) / (W / 2);
    const vy = (y - H / 2) / (H / 2);
    const vig = 1 - 0.22 * clamp(vx * vx + vy * vy - 0.35, 0, 1);
    const i = (y * W + x) * 4;
    img[i] = Math.round(cc[0] * vig);
    img[i + 1] = Math.round(cc[1] * vig);
    img[i + 2] = Math.round(cc[2] * vig);
    img[i + 3] = 255;
  }
}

// ---- shape helpers ----
function disc(cx: number, cy: number, r: number, c: RGB, a: number): void {
  const x0 = Math.max(0, Math.floor(cx - r - 2));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + 2));
  const y0 = Math.max(0, Math.floor(cy - r - 2));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cov = 1 - sstep(r - 1, r + 0.5, d);
      if (cov > 0) setPx(x, y, c, a * cov);
    }
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a: number): void {
  const x0 = Math.max(0, Math.floor(cx - rx - 2));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx + 2));
  const y0 = Math.max(0, Math.floor(cy - ry - 2));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      const cov = 1 - sstep(0.96, 1.02, d);
      if (cov > 0) setPx(x, y, c, a * cov);
    }
  }
}
function glow(cx: number, cy: number, r: number, c: RGB, a: number): void {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d >= 1) continue;
      setPx(x, y, c, a * Math.pow(1 - d, 2.2));
    }
  }
}
// Four-point sparkle star.
function sparkle(cx: number, cy: number, r: number, c: RGB, a: number): void {
  const x0 = Math.max(0, Math.floor(cx - r - 2));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + 2));
  const y0 = Math.max(0, Math.floor(cy - r - 2));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = Math.abs(x + 0.5 - cx) / r;
      const dy = Math.abs(y + 0.5 - cy) / r;
      const d = Math.min(dx + dy * 0.28, dy + dx * 0.28);
      const cov = 1 - sstep(0.55, 1, d);
      if (cov > 0) setPx(x, y, c, a * cov);
    }
  }
}
// Filled polygon (scanline, even-odd).
function poly(pts: Array<[number, number]>, c: RGB, a: number): void {
  let minY = H - 1;
  let maxY = 0;
  for (const p of pts) {
    minY = Math.min(minY, Math.floor(p[1]));
    maxY = Math.max(maxY, Math.ceil(p[1]));
  }
  minY = Math.max(0, minY);
  maxY = Math.min(H - 1, maxY);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      if ((p0[1] <= y + 0.5 && p1[1] > y + 0.5) || (p1[1] <= y + 0.5 && p0[1] > y + 0.5)) {
        const t = (y + 0.5 - p0[1]) / (p1[1] - p0[1]);
        xs.push(p0[0] + t * (p1[0] - p0[0]));
      }
    }
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k]));
      const x1 = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) setPx(x, y, c, a);
    }
  }
}
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(lerp(x0, x1, t), lerp(y0, y1, t), w / 2, c, a);
  }
}

// ---- background stars ----
const rand = rng(20261116);
const starCol: RGB = [235, 240, 255];
for (let i = 0; i < 170; i++) {
  const x = rand() * W;
  const y = rand() * 800;
  const r = 0.7 + rand() * 1.9;
  const b = 0.35 + rand() * 0.6;
  disc(x, y, r, starCol, b);
  if (r > 2.5) sparkle(x, y, r * 2.8, starCol, b * 0.35);
}

// ---- the moon (top right) ----
const MOON: [number, number, number] = [772, 208, 138];
glow(MOON[0], MOON[1], MOON[2] * 2.1, [255, 244, 200], 0.5);
glow(MOON[0], MOON[1], MOON[2] * 1.35, [255, 246, 210], 0.55);
disc(MOON[0], MOON[1], MOON[2], [250, 238, 205], 1);
// Moon shading: warm light from upper left, cooler limb lower right.
for (let y = Math.floor(MOON[1] - MOON[2]); y <= Math.ceil(MOON[1] + MOON[2]); y++) {
  for (let x = Math.floor(MOON[0] - MOON[2]); x <= Math.ceil(MOON[0] + MOON[2]); x++) {
    const d = Math.hypot(x + 0.5 - MOON[0], y + 0.5 - MOON[1]);
    if (d > MOON[2]) continue;
    const shade = clamp(((x - MOON[0]) + (y - MOON[1]) * 0.6) / MOON[2], -1, 1);
    setPx(x, y, mix([255, 248, 224], [214, 196, 158], (shade + 1) / 2), 0.35);
  }
}
// Craters.
const craters: Array<[number, number, number]> = [
  [716, 168, 22], [806, 148, 15], [836, 216, 26], [742, 252, 17],
  [788, 258, 11], [700, 214, 10], [824, 178, 8], [762, 196, 13],
];
for (const [cx, cy, r] of craters) {
  disc(cx, cy, r, [206, 186, 148], 0.85);
  disc(cx - r * 0.25, cy - r * 0.25, r * 0.62, [228, 210, 172], 0.6);
}

// ---- star arc: splash turning into stars, fish -> moon ----
function bez(p0: number, p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}
for (let i = 0; i <= 26; i++) {
  const t = i / 26;
  const x = bez(588, 660, 700, t);
  const y = bez(428, 300, 296, t);
  const r = 2.2 + t * 5.5;
  if (i % 3 === 0) {
    sparkle(x, y, r * 2.4, [255, 250, 220], 0.95);
  } else {
    disc(x, y, r * 0.55, [255, 252, 230], 0.95);
  }
  glow(x, y, r * 2.6, [190, 210, 255], 0.28);
}

// ---- windowsill ----
for (let y = 852; y < H; y++) {
  const t = (y - 852) / (H - 852);
  const c = mix([74, 48, 30] as RGB, [34, 20, 12] as RGB, t);
  for (let x = 0; x < W; x++) {
    // Faint wood grain bands.
    const grain = 6 * Math.sin(y * 0.35 + 2.1 * Math.sin(x * 0.008));
    setPx(x, y, [clamp(c[0] + grain, 0, 255), clamp(c[1] + grain * 0.7, 0, 255), clamp(c[2] + grain * 0.5, 0, 255)], 1);
  }
}
thickLine(0, 852, W, 852, 4, [150, 104, 62], 1);
thickLine(0, 858, W, 858, 2, [20, 12, 8], 0.6);

// ---- saucer + teacup (bottom left) ----
const CUPX = 300;
ellipse(CUPX, 856, 178, 26, [238, 228, 205], 1); // saucer top
ellipse(CUPX, 860, 178, 26, [120, 96, 70], 0.35); // saucer shade
ellipse(CUPX, 856, 138, 19, [46, 128, 122], 1); // teal ring
ellipse(CUPX, 856, 122, 16, [238, 228, 205], 1); // saucer centre
// Handle: ring on the cup's right side (the cup body covers its left half).
{
  const hx = 424;
  const hy = 796;
  const ro = 48;
  const ri = 32;
  for (let y = Math.floor(hy - ro - 2); y <= Math.ceil(hy + ro + 2); y++) {
    for (let x = Math.floor(hx - ro - 2); x <= Math.ceil(hx + ro + 2); x++) {
      const d = Math.hypot(x + 0.5 - hx, y + 0.5 - hy);
      const ring = (1 - sstep(ro - 1, ro + 1, d)) * sstep(ri - 1, ri + 1, d);
      if (ring > 0 && x > CUPX + 60) setPx(x, y, [238, 228, 205], ring);
    }
  }
}
// Cup body: trapezoid, wider at the rim.
for (let y = 742; y <= 852; y++) {
  const t = (y - 742) / 110;
  const half = lerp(106, 76, t);
  const shade = 0.16 * Math.sin((y - 742) * 0.09);
  for (let x = Math.floor(CUPX - half); x <= Math.ceil(CUPX + half); x++) {
    const edge = 1 - sstep(half - 2, half, Math.abs(x + 0.5 - CUPX));
    const side = (x - CUPX) / half;
    const c = mix([245, 234, 210], [226, 200, 160], clamp(Math.abs(side) * 0.55 + shade, 0, 1));
    setPx(x, y, c, edge);
  }
}
// Teal band + gold rim line on the cup.
for (let y = 792; y <= 812; y++) {
  const t = (y - 742) / 110;
  const half = lerp(106, 76, t);
  for (let x = Math.floor(CUPX - half); x <= Math.ceil(CUPX + half); x++) {
    setPx(x, y, [36, 110, 106], 0.95);
  }
}
thickLine(CUPX - 104, 744, CUPX + 104, 744, 3, [212, 164, 76], 1);
// Tea surface.
ellipse(CUPX, 744, 100, 15, [122, 74, 30], 1);
ellipse(CUPX, 744, 82, 11, [146, 94, 38], 1);
ellipse(CUPX - 28, 741, 30, 5, [214, 164, 92], 0.8);
// Steam curls rising from the tea.
const steamCol: RGB = [240, 244, 255];
for (let i = 0; i <= 40; i++) {
  const t = i / 40;
  const y = 736 - t * 130;
  const x = 262 + Math.sin(t * 9.2) * 14 * (1 - t * 0.4);
  disc(x, y, 5 + t * 3, steamCol, 0.16 * (1 - t));
}
for (let i = 0; i <= 40; i++) {
  const t = i / 40;
  const y = 736 - t * 110;
  const x = 338 + Math.sin(t * 8.1 + 2.4) * 12 * (1 - t * 0.4);
  disc(x, y, 4 + t * 3, steamCol, 0.14 * (1 - t));
}

// ---- splash droplets: cup rim -> fish tail ----
const splashRand = rng(777);
for (let i = 0; i < 46; i++) {
  const t = splashRand();
  const bx = bez(352, 398, 452, t);
  const by = bez(736, 660, 588, t);
  const jx = (splashRand() - 0.5) * 34;
  const jy = (splashRand() - 0.5) * 26;
  const r = 2 + splashRand() * 6.5;
  const x = bx + jx;
  const y = by + jy;
  glow(x, y, r * 2.4, [150, 200, 255], 0.3);
  disc(x, y, r, [205, 228, 255], 0.95);
  disc(x - r * 0.3, y - r * 0.3, r * 0.45, [255, 255, 255], 0.9);
}
// Spray crown right where the fish broke the surface.
for (let i = 0; i < 14; i++) {
  const a = -Math.PI * (0.15 + 0.7 * (i / 13));
  const len = 26 + (i % 4) * 12;
  const x = 388 + Math.cos(a) * len;
  const y = 736 + Math.sin(a) * len * 0.8;
  disc(x, y, 2.5 + (i % 3), [220, 236, 255], 0.9);
}

// ---- the goldfish (leaping up-right) ----
const FISH: [number, number, number] = [530, 498, -48]; // cx, cy, degrees
const fang = (FISH[2] * Math.PI) / 180;
const fcos = Math.cos(fang);
const fsin = Math.sin(fang);
function fishLocal(px: number, py: number): [number, number] {
  const dx = px - FISH[0];
  const dy = py - FISH[1];
  return [dx * fcos + dy * fsin, -dx * fsin + dy * fcos];
}
// Tail fins first (behind the body): two flowing lobes with a V notch.
{
  const tx = FISH[0] - fcos * 108;
  const ty = FISH[1] - fsin * 108;
  const ux = fcos;
  const uy = fsin;
  const vx = -fsin;
  const vy = fcos;
  poly(
    [
      [tx, ty],
      [tx - ux * 66 + vx * 52, ty - uy * 66 + vy * 52],
      [tx - ux * 84 + vx * 10, ty - uy * 84 + vy * 10],
    ],
    [244, 140, 44],
    1,
  );
  poly(
    [
      [tx, ty],
      [tx - ux * 84 - vx * 10, ty - uy * 84 - vy * 10],
      [tx - ux * 66 - vx * 52, ty - uy * 66 - vy * 52],
    ],
    [255, 178, 92],
    1,
  );
}
// Body: rotated ellipse with a dark outline, orange back to pale belly.
{
  const cx = FISH[0];
  const cy = FISH[1];
  const rx = 112;
  const ry = 50;
  const x0 = Math.floor(cx - 130);
  const x1 = Math.ceil(cx + 130);
  const y0 = Math.floor(cy - 130);
  const y1 = Math.ceil(cy + 130);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const [u, v] = fishLocal(x + 0.5, y + 0.5);
      const d = Math.sqrt((u / rx) * (u / rx) + (v / ry) * (v / ry));
      if (d > 1.06) continue;
      if (d > 0.97) {
        setPx(x, y, [146, 62, 12], (1 - sstep(0.97, 1.06, d)) * 0.95);
        continue;
      }
      const belly = clamp((v / ry + 0.55) / 1.1, 0, 1);
      let c = mix([232, 104, 26], [255, 216, 138], belly);
      // Head blush near the nose.
      const nose = clamp((u / rx - 0.35) / 0.65, 0, 1);
      c = mix(c, [255, 150, 70] as RGB, nose * 0.35);
      setPx(x, y, c, 1);
    }
  }
  // Scale arcs: three soft crescents along the flank.
  for (const [su, sv, sr] of [
    [-30, -6, 26],
    [6, 2, 30],
    [42, -8, 24],
  ] as Array<[number, number, number]>) {
    const gx = cx + su * fcos - sv * fsin;
    const gy = cy + su * fsin + sv * fcos;
    for (let a = 0; a <= 20; a++) {
      const th = Math.PI * (0.15 + (a / 20) * 0.7);
      const px = gx + Math.cos(th) * sr * fcos - Math.sin(th) * sr * 0.55 * fsin;
      const py = gy + Math.cos(th) * sr * fsin + Math.sin(th) * sr * 0.55 * fcos;
      disc(px, py, 2.2, [214, 92, 20], 0.5);
    }
  }
  // Dorsal fin on the back: a low swept triangle, not a sail.
  const dx0 = cx - 5 * fcos + 44 * fsin;
  const dy0 = cy - 5 * fsin - 44 * fcos;
  poly(
    [
      [dx0, dy0],
      [dx0 + 20 * fcos + 28 * fsin, dy0 + 20 * fsin - 28 * fcos],
      [dx0 + 40 * fcos, dy0 + 40 * fsin],
    ],
    [240, 128, 36],
    1,
  );
  // Pectoral fin.
  const px0 = cx + 18 * fcos + 30 * fsin;
  const py0 = cy + 18 * fsin - 30 * fcos;
  poly(
    [
      [px0, py0],
      [px0 + 34 * fcos + 34 * fsin, py0 + 34 * fsin - 34 * fcos],
      [px0 + 52 * fcos + 8 * fsin, py0 + 52 * fsin - 8 * fcos],
    ],
    [255, 178, 92],
    0.95,
  );
  // Gill arc.
  const gx = cx + 62 * fcos;
  const gy = cy + 62 * fsin;
  for (let a = 0; a <= 16; a++) {
    const th = -1.1 + (a / 16) * 2.0;
    const px = gx + Math.cos(th) * 16 * fcos - Math.sin(th) * 26 * fsin;
    const py = gy + Math.cos(th) * 16 * fsin + Math.sin(th) * 26 * fcos;
    disc(px, py, 2.4, [190, 84, 18], 0.7);
  }
  // Eye: bright, wide open, looking at the moon.
  const ex = cx + 84 * fcos - 12 * fsin;
  const ey = cy + 84 * fsin + 12 * fcos;
  disc(ex, ey, 11, [255, 252, 240], 1);
  disc(ex + 3, ey - 3, 5.5, [16, 12, 10], 1);
  disc(ex + 5, ey - 5, 2, [255, 255, 255], 1);
  // Mouth, open in wonder.
  const mx = cx + 106 * fcos + 6 * fsin;
  const my = cy + 106 * fsin - 6 * fcos;
  disc(mx, my, 5, [120, 48, 10], 0.95);
}
// A few droplets flung off the fish.
const fling = rng(4242);
for (let i = 0; i < 12; i++) {
  const a = fling() * Math.PI * 2;
  const r = 60 + fling() * 70;
  const x = FISH[0] + Math.cos(a) * r;
  const y = FISH[1] + Math.sin(a) * r * 0.8;
  disc(x, y, 2 + fling() * 3.5, [210, 230, 255], 0.9);
}

// ---- caption panel (bottom right) ----
const PANEL: [number, number, number, number] = [588, 686, 996, 848];
{
  const [x0, y0, x1, y1] = PANEL;
  const rad = 22;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = clamp(x, x0 + rad, x1 - rad);
      const ny = clamp(y, y0 + rad, y1 - rad);
      const d = Math.hypot(x + 0.5 - nx, y + 0.5 - ny) - rad;
      const cov = 1 - sstep(-1, 1, d);
      if (cov <= 0) continue;
      const isBorder = d > -5;
      setPx(x, y, isBorder ? [232, 182, 76] : [13, 20, 48], cov * (isBorder ? 1 : 0.94));
    }
  }
  // Gold corner stars on the panel.
  sparkle(x0 + 26, y0 + 26, 9, [255, 214, 120], 0.9);
  sparkle(x1 - 26, y1 - 26, 9, [255, 214, 120], 0.9);
}
// 5x7 bitmap font (own glyph patterns).
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};
function drawText(text: string, cx: number, y: number, scale: number, c: RGB): void {
  const adv = 6 * scale;
  const total = text.length * adv - scale;
  let x = Math.round(cx - total / 2);
  for (const ch of text) {
    const g = FONT[ch] ?? FONT[" "];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "1") {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              setPx(x + col * scale + dx, y + r * scale + dy, c, 1);
            }
          }
        }
      }
    }
    x += adv;
  }
}
drawText("THE SKY FITS", 792, 716, 5, [255, 233, 168]);
drawText("IN A TEACUP!", 792, 766, 5, [255, 233, 168]);

// ---- PNG encode (own encoder: zlib + CRC32) ----
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
const raw = new Uint8Array(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  raw.set(img.subarray(y * W * 4, (y + 1) * W * 4), y * (1 + W * 4) + 1);
}
const ihdr = new Uint8Array(13);
{
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W);
  dv.setUint32(4, H);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from(chunk("IHDR", ihdr)),
  Buffer.from(chunk("IDAT", deflateSync(raw, { level: 9 }))),
  Buffer.from(chunk("IEND", new Uint8Array(0))),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/entry.png`, png);
