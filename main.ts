// The Sky Fits in a Teacup! — ai-excited-01 entry
// A goldfish leaps out of a teacup on a night windowsill; its splash bursts
// into stars that arc up to a big cratered full moon: a whole sky hiding in
// a teacup. Fully procedural, Node stdlib only, deterministic (same bytes
// every run). Writes /output/entry.png (or $MAKEFUN_OUTPUT_DIR/entry.png).
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || "/output";

// ---------------- deterministic RNG (LCG) ----------------
let rngState = 0x5eed1234;
function rnd(): number {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 4294967296;
}

// ---------------- framebuffer (RGB) ----------------
const fb = new Uint8Array(W * H * 3);

type RGB = [number, number, number];

function blendPx(x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 3;
  if (a >= 1) {
    fb[i] = c[0];
    fb[i + 1] = c[1];
    fb[i + 2] = c[2];
    return;
  }
  fb[i] = Math.round(fb[i] + (c[0] - fb[i]) * a);
  fb[i + 1] = Math.round(fb[i + 1] + (c[1] - fb[i + 1]) * a);
  fb[i + 2] = Math.round(fb[i + 2] + (c[2] - fb[i + 2]) * a);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---------------- sky gradient ----------------
function skyGradient(): void {
  // stops: [y, r, g, b]
  const stops: Array<[number, number, number, number]> = [
    [0, 6, 9, 34],
    [380, 14, 22, 62],
    [700, 26, 40, 92],
    [900, 44, 62, 122],
    [1024, 52, 70, 128],
  ];
  for (let y = 0; y < H; y++) {
    let s = 0;
    while (s < stops.length - 2 && y > stops[s + 1][0]) s++;
    const a = stops[s];
    const b = stops[s + 1];
    const t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    const r = Math.round(lerp(a[1], b[1], t));
    const g = Math.round(lerp(a[2], b[2], t));
    const bl = Math.round(lerp(a[3], b[3], t));
    const row = y * W * 3;
    for (let x = 0; x < W; x++) {
      fb[row + x * 3] = r;
      fb[row + x * 3 + 1] = g;
      fb[row + x * 3 + 2] = bl;
    }
  }
}

// ---------------- primitive drawing ----------------
function disc(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      const edge = clamp(r + 0.6 - d, 0, 1);
      if (edge > 0) blendPx(x, y, c, a * edge);
    }
  }
}

function glow(cx: number, cy: number, r: number, c: RGB, peak: number): void {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / r;
      if (d >= 1) continue;
      const t = 1 - d;
      blendPx(x, y, c, peak * t * t);
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(cx - rx - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1) {
        const edge = clamp((1 - Math.sqrt(d)) * Math.min(rx, ry) + 0.6, 0, 1);
        blendPx(x, y, c, a * edge);
      }
    }
  }
}

function ellipseRot(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  deg: number,
  c: RGB,
  a = 1,
): void {
  const th = (deg * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const rad = Math.max(rx, ry) + 2;
  const x0 = Math.max(0, Math.floor(cx - rad));
  const x1 = Math.min(W - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad));
  const y1 = Math.min(H - 1, Math.ceil(cy + rad));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const u = (dx * cos + dy * sin) / rx;
      const v = (-dx * sin + dy * cos) / ry;
      const d = u * u + v * v;
      if (d <= 1) {
        const edge = clamp((1 - Math.sqrt(d)) * Math.min(rx, ry) + 0.6, 0, 1);
        blendPx(x, y, c, a * edge);
      }
    }
  }
}

// scanline polygon fill (even-odd)
function poly(pts: Array<[number, number]>, c: RGB, a = 1): void {
  let yMin = H - 1;
  let yMax = 0;
  for (const p of pts) {
    yMin = Math.min(yMin, Math.floor(p[1]));
    yMax = Math.max(yMax, Math.ceil(p[1]));
  }
  yMin = Math.max(0, yMin);
  yMax = Math.min(H - 1, yMax);
  for (let y = yMin; y <= yMax; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      if ((p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y)) {
        const t = (y + 0.5 - p1[1]) / (p2[1] - p1[1]);
        xs.push(p1[0] + t * (p2[0] - p1[0]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k]));
      const x1 = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) blendPx(x, y, c, a);
    }
  }
}

function thickLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  c: RGB,
  a = 1,
): void {
  const len = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
  const steps = Math.max(1, Math.ceil(len / Math.max(1, w * 0.4)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(lerp(x0, x1, t), lerp(y0, y1, t), w / 2, c, a);
  }
}

// four-point sparkle star
function sparkle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const core = Math.max(1.5, r * 0.28);
  disc(cx, cy, core, c, a);
  const steps = Math.ceil(r);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wdt = Math.max(0.7, core * (1 - t * 0.85));
    const d = r * t;
    disc(cx + d, cy, wdt, c, a * (1 - t * 0.6));
    disc(cx - d, cy, wdt, c, a * (1 - t * 0.6));
    disc(cx, cy + d, wdt, c, a * (1 - t * 0.6));
    disc(cx, cy - d, wdt, c, a * (1 - t * 0.6));
  }
}

// rounded-rect SDF fill + stroke
function rrect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  fill: RGB,
  fillA: number,
  strokeW: number,
  stroke: RGB,
): void {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2;
  const hy = (y1 - y0) / 2;
  for (let y = Math.floor(y0) - 2; y <= Math.ceil(y1) + 2; y++) {
    for (let x = Math.floor(x0) - 2; x <= Math.ceil(x1) + 2; x++) {
      const qx = Math.abs(x - cx) - (hx - r);
      const qy = Math.abs(y - cy) - (hy - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const d = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
      if (d < 0.8) {
        const edge = clamp(0.8 - d, 0, 1);
        if (strokeW > 0 && d > -strokeW) {
          blendPx(x, y, stroke, edge);
        } else {
          blendPx(x, y, fill, fillA * edge);
        }
      }
    }
  }
}

// ---------------- 5x7 bitmap font ----------------
const FONT: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

function drawText(str: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of str) {
    const g = FONT[ch] || FONT[" "];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] === "#") {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              blendPx(cx + col * scale + dx, y + row * scale + dy, c, 1);
            }
          }
        }
      }
    }
    cx += 6 * scale;
  }
}

// ---------------- scene ----------------
const MOON: RGB = [255, 243, 207];
const MOON_CRATER: RGB = [216, 189, 133];
const MOON_CRATER_DARK: RGB = [196, 167, 108];
const STAR_W: RGB = [255, 255, 255];
const STAR_G: RGB = [255, 226, 150];
const STAR_B: RGB = [190, 220, 255];
const FISH_O: RGB = [255, 140, 46];
const FISH_L: RGB = [255, 179, 71];
const FISH_BELLY: RGB = [255, 217, 138];
const FISH_D: RGB = [214, 96, 20];
const CUP: RGB = [246, 234, 210];
const CUP_TEAL: RGB = [46, 127, 138];
const GOLD: RGB = [217, 164, 65];
const WATER: RGB = [207, 238, 255];
const TEA: RGB = [180, 118, 42];
const TEXT_C: RGB = [255, 233, 168];

function drawStars(): void {
  // background starfield, skipping the moon disc and the text panel
  for (let i = 0; i < 300; i++) {
    const x = rnd() * W;
    const y = rnd() * 880;
    const dx = x - 795;
    const dy = y - 205;
    if (dx * dx + dy * dy < 175 * 175) continue;
    if (x > 28 && x < 512 && y > 32 && y < 196) continue;
    const r = rnd();
    const col = r < 0.55 ? STAR_W : r < 0.8 ? STAR_G : STAR_B;
    const size = 0.8 + rnd() * 1.6;
    const a = 0.45 + rnd() * 0.55;
    disc(x, y, size, col, a);
    if (rnd() < 0.07) sparkle(x, y, 5 + rnd() * 5, col, a * 0.9);
  }
}

function drawMoon(): void {
  const cx = 795;
  const cy = 205;
  const r = 138;
  glow(cx, cy, 300, [255, 240, 190], 0.34);
  glow(cx, cy, 200, [255, 246, 220], 0.5);
  disc(cx, cy, r, MOON, 1);
  // terminator shading on the lower-left limb
  glow(cx - 95, cy + 105, 150, [120, 130, 170], 0.22);
  const craters: Array<[number, number, number]> = [
    [-42, -32, 22],
    [30, 12, 16],
    [56, -56, 12],
    [-72, 42, 14],
    [10, 56, 18],
    [72, 46, 9],
    [-16, -72, 10],
    [36, -12, 7],
    [-58, 8, 8],
    [4, -38, 6],
  ];
  for (const [dx, dy, cr] of craters) {
    disc(cx + dx, cy + dy, cr, MOON_CRATER, 0.85);
    disc(cx + dx + 2.5, cy + dy + 2.5, cr * 0.62, MOON_CRATER_DARK, 0.7);
  }
  // (no rim slash: keep the moon clean)
}

function drawSplashArc(): void {
  // quadratic bezier from the fish up to the moon: droplets turn into stars
  const p0: [number, number] = [520, 560];
  const p1: [number, number] = [665, 405];
  const p2: [number, number] = [735, 300];
  const n = 52;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0];
    const y = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1];
    const size = 2.2 + 8.5 * Math.sin(Math.PI * (0.15 + 0.85 * t));
    const col = t < 0.35 ? WATER : t < 0.6 ? STAR_B : t < 0.85 ? STAR_W : STAR_G;
    if (i % 3 === 0) {
      sparkle(x, y, size, col, 0.95);
    } else {
      disc(x, y, Math.max(1.2, size * 0.32), col, 0.95);
    }
    // faint halo on the bigger ones
    if (size > 7) glow(x, y, size * 2.4, col, 0.16);
  }
  // three comets streaking from the fish toward the moon
  const comets: Array<[number, number, number, number]> = [
    [560, 505, 640, 430],
    [600, 470, 690, 385],
    [540, 545, 615, 480],
  ];
  for (const [x0, y0, x1, y1] of comets) {
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      disc(lerp(x0, x1, t), lerp(y0, y1, t), 5.5 * (1 - t) + 1, STAR_W, 0.85 * (1 - t * 0.7));
    }
    sparkle(x1, y1, 9, STAR_G, 1);
  }
}

function drawSillAndCup(): void {
  // windowsill band
  for (let y = 900; y < H; y++) {
    const t = (y - 900) / 124;
    const r = Math.round(lerp(58, 22, t));
    const g = Math.round(lerp(42, 15, t));
    const b = Math.round(lerp(30, 10, t));
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      fb[i] = r;
      fb[i + 1] = g;
      fb[i + 2] = b;
    }
  }
  thickLine(0, 900, W, 900, 3, [96, 72, 48], 0.9);
  // warm glow behind the cup
  glow(320, 850, 230, [217, 164, 65], 0.12);
  // saucer shadow + saucer
  ellipse(320, 916, 158, 24, [10, 8, 6], 0.5);
  ellipse(320, 912, 155, 24, CUP, 1);
  ellipse(320, 912, 118, 17, [214, 198, 168], 1);
  ellipse(320, 912, 108, 15, CUP_TEAL, 1);
  // cup body: trapezoid with rounded corners
  poly(
    [
      [228, 800],
      [412, 800],
      [386, 902],
      [254, 902],
    ],
    CUP,
    1,
  );
  disc(228, 800, 10, CUP, 1);
  disc(412, 800, 10, CUP, 1);
  disc(254, 902, 8, CUP, 1);
  disc(386, 902, 8, CUP, 1);
  // teal band + gold trim on the cup
  poly(
    [
      [236, 838],
      [404, 838],
      [398, 862],
      [242, 862],
    ],
    CUP_TEAL,
    1,
  );
  thickLine(234, 834, 406, 834, 3, GOLD, 1);
  thickLine(241, 866, 399, 866, 3, GOLD, 1);
  // handle: thick arc on the right
  for (let a = -70; a <= 70; a += 4) {
    const th = (a * Math.PI) / 180;
    disc(412 + Math.cos(th) * 42, 852 + Math.sin(th) * 42, 7, CUP, 1);
  }
  disc(412 + Math.cos((-70 * Math.PI) / 180) * 42, 852 + Math.sin((-70 * Math.PI) / 180) * 42, 8, CUP, 1);
  disc(412 + Math.cos((70 * Math.PI) / 180) * 42, 852 + Math.sin((70 * Math.PI) / 180) * 42, 8, CUP, 1);
  // tea surface inside the rim
  ellipse(320, 800, 90, 15, TEA, 1);
  ellipse(320, 798, 74, 11, [214, 150, 62], 1);
  disc(292, 796, 4, [255, 220, 140], 0.9);
  // splash crown bursting from the rim
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const x = lerp(245, 395, t);
    const hgt = 26 + 34 * Math.sin(Math.PI * t) + (rnd() * 14 - 7);
    const tipX = x + (rnd() * 16 - 8);
    poly(
      [
        [x - 5, 800],
        [tipX, 800 - hgt],
        [x + 5, 800],
      ],
      WATER,
      0.95,
    );
    disc(tipX, 800 - hgt - 4, 3 + rnd() * 2.5, WATER, 0.95);
  }
  // droplets arcing from the rim up to the fish
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const x = lerp(335, 425, t) + (rnd() * 10 - 5);
    const y = lerp(775, 655, t * t) + (rnd() * 10 - 5);
    disc(x, y, 2.5 + rnd() * 3, WATER, 0.9);
  }
}

function drawFish(): void {
  const cx = 475;
  const cy = 605;
  const ang = -38;
  // motion streaks behind the tail
  thickLine(330, 700, 400, 668, 4, WATER, 0.55);
  thickLine(345, 722, 408, 690, 3, WATER, 0.4);
  thickLine(360, 680, 415, 652, 3, STAR_B, 0.4);
  // flowing tail (two sweeping fins, fanning down-left)
  poly(
    [
      [408, 640],
      [326, 696],
      [348, 718],
      [392, 690],
      [420, 668],
    ],
    FISH_L,
    0.92,
  );
  poly(
    [
      [412, 662],
      [336, 750],
      [362, 758],
      [404, 706],
      [424, 682],
    ],
    FISH_O,
    0.92,
  );
  // dorsal fin
  poly(
    [
      [448, 568],
      [488, 534],
      [516, 564],
      [494, 580],
    ],
    FISH_D,
    1,
  );
  // body: layered rotated ellipses for a rounded, lit form
  ellipseRot(cx, cy, 88, 42, ang, FISH_O, 1);
  ellipseRot(cx + 12, cy - 8, 66, 30, ang, FISH_L, 1);
  ellipseRot(cx + 6, cy + 12, 62, 22, ang, FISH_BELLY, 0.95);
  // pectoral fin: small tapered sliver hugging the lower belly edge
  poly(
    [
      [452, 626],
      [428, 652],
      [464, 650],
      [476, 636],
    ],
    FISH_L,
    1,
  );
  // scale hints: short curved strokes along the body
  const th = (ang * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  for (let i = -2; i <= 2; i++) {
    for (let j = -1; j <= 1; j++) {
      const lx = i * 26;
      const ly = j * 16 - 4;
      const px = cx + lx * cos - ly * sin;
      const py = cy + lx * sin + ly * cos;
      disc(px, py, 3.2, FISH_D, 0.55);
    }
  }
  // gill curve
  const gx = cx + 52;
  const gy = cy - 6;
  for (let a = 40; a <= 140; a += 8) {
    const t2 = (a * Math.PI) / 180;
    disc(gx + Math.cos(t2) * 14, gy + Math.sin(t2) * 14, 2.4, FISH_D, 0.8);
  }
  // eye: big, looking up toward the moon
  const ex = cx + 58;
  const ey = cy - 22;
  disc(ex, ey, 9, [255, 255, 255], 1);
  disc(ex + 2, ey - 2, 4.5, [20, 12, 8], 1);
  disc(ex + 4, ey - 4, 1.8, [255, 255, 255], 1);
  // mouth
  thickLine(cx + 82, cy - 6, cx + 88, cy + 2, 3, FISH_D, 1);
  // splash burst where the fish left the cup
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.3;
    const d = 96 + rnd() * 26;
    const x = cx + Math.cos(a) * d * 0.7;
    const y = cy + Math.sin(a) * d * 0.55;
    disc(x, y, 2 + rnd() * 3.5, WATER, 0.9);
    if (i % 4 === 0) sparkle(x, y, 5, STAR_W, 0.85);
  }
}

function drawTextPanel(): void {
  rrect(40, 44, 500, 184, 18, [13, 19, 48], 0.94, 3, GOLD);
  drawText("THE SKY FITS", 72, 72, 5, TEXT_C);
  drawText("IN A TEACUP!", 72, 122, 5, TEXT_C);
  // tiny star accents flanking the panel
  sparkle(472, 72, 7, STAR_G, 0.95);
  sparkle(472, 158, 5, STAR_W, 0.9);
}

function vignette(): void {
  const cx = W / 2;
  const cy = H / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxD;
      const t = clamp((d - 0.55) / 0.45, 0, 1);
      const f = 1 - 0.2 * t * t;
      const i = (y * W + x) * 3;
      fb[i] = Math.round(fb[i] * f);
      fb[i + 1] = Math.round(fb[i + 1] * f);
      fb[i + 2] = Math.round(fb[i + 2] * f);
    }
  }
}

// ---------------- PNG encoder (RGB, per-row filter choice) ----------------
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(): Buffer {
  const rowBytes = W * 3;
  const raw = Buffer.alloc((rowBytes + 1) * H);
  const prev = Buffer.alloc(rowBytes);
  for (let y = 0; y < H; y++) {
    const row = Buffer.from(fb.buffer, fb.byteOffset + y * rowBytes, rowBytes);
    // try filters 0..4, keep the one with the smallest sum of |signed byte|
    let bestF = 0;
    let bestScore = Infinity;
    let bestRow: Buffer | null = null;
    for (let f = 0; f <= 4; f++) {
      const out = Buffer.alloc(rowBytes);
      let score = 0;
      for (let i = 0; i < rowBytes; i++) {
        let v = row[i];
        if (f === 1) v = (v - (i >= 3 ? row[i - 3] : 0)) & 0xff;
        else if (f === 2) v = (v - prev[i]) & 0xff;
        else if (f === 3) {
          const a = i >= 3 ? row[i - 3] : 0;
          v = (v - Math.floor((a + prev[i]) / 2)) & 0xff;
        } else if (f === 4) {
          const a = i >= 3 ? row[i - 3] : 0;
          const b = prev[i];
          const c = i >= 3 ? prev[i - 3] : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          v = (v - pr) & 0xff;
        }
        out[i] = v;
        const s = v >= 128 ? v - 256 : v;
        score += s < 0 ? -s : s;
      }
      if (score < bestScore) {
        bestScore = score;
        bestF = f;
        bestRow = out;
      }
    }
    raw[y * (rowBytes + 1)] = bestF;
    (bestRow as Buffer).copy(raw, y * (rowBytes + 1) + 1);
    row.copy(prev);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------- render ----------------
skyGradient();
glow(320, 700, 320, [64, 48, 120], 0.14);
glow(820, 220, 260, [90, 70, 150], 0.12);
drawStars();
drawMoon();
drawSplashArc();
drawSillAndCup();
drawFish();
drawTextPanel();
vignette();

mkdirSync(OUT_DIR, { recursive: true });
const png = encodePNG();
writeFileSync(`${OUT_DIR}/entry.png`, png);
console.log(`wrote ${OUT_DIR}/entry.png ${png.length} bytes`);
