// The Sky Fits in a Teacup! — ai-excited-01, round 4
//
// A goldfish leaps out of a teacup on a night windowsill. Its splash
// bursts into stars that arc up to a big cratered full moon, along one
// strong diagonal: cup bottom-left, fish mid-frame, moon top-right.
// The line to the judge sits on a dark panel, top-left, in a 5x7
// bitmap font: "THE SKY FITS / IN A TEACUP!"
//
// Fully procedural SDF render. Node 22 standard library only, own PNG
// encoder (node:zlib + CRC32). No assets, no network, no randomness
// at run time: every value is fixed or derived from a seeded generator,
// so two runs write byte-identical files.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;
const img = new Uint8Array(W * H * 3);

type RGB = [number, number, number];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function sstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261116);

function idx(x: number, y: number): number {
  return (y * W + x) * 3;
}
function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = idx(x, y);
  img[i] = c[0];
  img[i + 1] = c[1];
  img[i + 2] = c[2];
}
function blendPx(x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  if (a > 1) a = 1;
  const i = idx(x, y);
  img[i] = clamp(img[i] * (1 - a) + c[0] * a, 0, 255);
  img[i + 1] = clamp(img[i + 1] * (1 - a) + c[1] * a, 0, 255);
  img[i + 2] = clamp(img[i + 2] * (1 - a) + c[2] * a, 0, 255);
}
function mixC(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
function ellQ(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return Math.sqrt(dx * dx + dy * dy);
}
function sdRoundBox(px: number, py: number, cx: number, cy: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px - cx) - (hx - r);
  const qy = Math.abs(py - cy) - (hy - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}

// ---------------------------------------------------------------- sky, moon, sill, panel, cup
const MOON: RGB = [255, 247, 214];
const MOON_X = 772;
const MOON_Y = 208;
const MOON_R = 148;
const CRATERS: Array<[number, number, number]> = [
  [722, 168, 26],
  [812, 252, 34],
  [758, 138, 14],
  [832, 182, 18],
  [698, 242, 16],
  [782, 292, 12],
];

function renderBase(): void {
  for (let y = 0; y < H; y++) {
    const t = y / H;
    for (let x = 0; x < W; x++) {
      // Night sky: deep indigo overhead, softening to teal-blue at the sill.
      let c: RGB = mixC([8, 12, 38], [24, 38, 86], sstep(0, 0.55, t));
      c = mixC(c, [34, 56, 96], sstep(0.6, 1, t));
      // Faint violet nebula drift, so the sky is not a flat gradient.
      const neb = 0.5 + 0.5 * Math.sin(x * 0.011 + 1.7) * Math.sin(y * 0.013 + 0.4);
      c = mixC(c, [52, 44, 108], neb * neb * 0.16);

      // Moon glow, then the disc with craters and limb darkening.
      const mdx = x - MOON_X;
      const mdy = y - MOON_Y;
      const md2 = mdx * mdx + mdy * mdy;
      if (md2 < 420 * 420) {
        const md = Math.sqrt(md2);
        const glow = 52 * Math.exp(-md / 150);
        c = [c[0] + glow, c[1] + glow * 0.92, c[2] + glow * 0.7];
        const sd = md - MOON_R;
        const ma = sstep(1.5, -1.5, sd);
        if (ma > 0) {
          const limb = 1 - 0.13 * (md / MOON_R) * (md / MOON_R);
          let mc: RGB = [MOON[0] * limb, MOON[1] * limb, MOON[2] * limb];
          for (const cr of CRATERS) {
            const cd = Math.sqrt((x - cr[0]) * (x - cr[0]) + (y - cr[1]) * (y - cr[1])) - cr[2];
            const ca = sstep(2, -2, cd);
            if (ca > 0) mc = mixC(mc, [212, 194, 148], ca * 0.85);
          }
          c = mixC(c, mc, ma);
        }
      }

      // Distant rooftop silhouette just above the sill.
      if (y > 846 && y < 900) {
        const col = Math.floor(x / 46);
        const hh = 10 + ((col * 37 + 11) % 26);
        if (y > 900 - hh) c = mixC(c, [11, 15, 38], 0.9);
      }

      // Windowsill: dark wood band with a lit top edge.
      if (y >= 900) {
        let wc: RGB = [38, 27, 48];
        if (((x / 64) | 0) % 2 === 0) wc = [42, 30, 52];
        if (y < 906) wc = [96, 76, 104];
        if (y < 902) wc = [52, 40, 62];
        c = wc;
      }

      // Text panel, top-left: dark rounded slab, thin gold border.
      if (x > 20 && x < 620 && y > 16 && y < 224) {
        const sd = sdRoundBox(x, y, 320, 120, 276, 80, 18);
        if (sd < 4) {
          const pa = sstep(1.5, -1.5, sd);
          c = mixC(c, [10, 14, 40], pa * 0.94);
          const border = sstep(4.5, 1.5, Math.abs(sd + 1.5)) * sstep(1.5, -1.5, sd);
          if (border > 0) c = mixC(c, [255, 205, 90], border * 0.9);
        }
      }

      // Teacup + saucer, bottom-left (drawn over sill and skyline).
      if (x > 120 && x < 450 && y > 690 && y < 930) {
        // Soft shadow of the saucer on the sill.
        const shQ = ellQ(x, y, 272, 908, 182, 15);
        if (shQ < 1) c = mixC(c, [8, 6, 16], (1 - shQ) * 0.55);
        // Saucer.
        const saQ = ellQ(x, y, 272, 884, 168, 26);
        const saD = (saQ - 1) * 26;
        const saA = sstep(1.5, -1.5, saD);
        if (saA > 0) {
          const shade = 1 - 0.22 * sstep(-1, 1, (x - 272) / 168);
          c = mixC(c, [244 * shade, 238 * shade, 224 * shade], saA);
          const rimQ = Math.abs(saQ - 0.82) * 26;
          if (rimQ < 2.5) c = mixC(c, [64, 96, 168], saA * 0.9);
        }
        // Cup body: width narrows toward the base, rounded bottom.
        if (y >= 738 && y <= 872) {
          let wy = lerp(106, 80, (y - 738) / 134);
          if (y > 846) wy *= Math.sqrt(Math.max(0, 1 - ((y - 846) / 26) * ((y - 846) / 26)));
          const dSide = Math.abs(x - 272) - wy;
          const dBot = y - 872;
          const d = Math.max(dSide, dBot);
          const ba = sstep(1.5, -1.5, d);
          if (ba > 0) {
            let bc: RGB = mixC([247, 243, 232], [212, 204, 186], sstep(738, 872, y));
            bc = mixC(bc, [176, 164, 140], sstep(0, 106, x - 272) * 0.35);
            // Blue band with gold dots.
            if (y >= 796 && y <= 828) {
              const bandA = sstep(796, 800, y) * sstep(828, 824, y);
              bc = mixC(bc, [43, 87, 166], bandA * 0.95);
              for (const dotX of [206, 272, 338]) {
                const dd = Math.sqrt((x - dotX) * (x - dotX) + (y - 812) * (y - 812));
                if (dd < 5) bc = [255, 205, 90];
              }
            }
            c = mixC(c, bc, ba);
          }
        }
        // Handle: porcelain ring on the cup's right side.
        if (x >= 372) {
          const hd = Math.sqrt((x - 398) * (x - 398) + (y - 802) * (y - 802));
          const hD = Math.abs(hd - 38) - 7;
          const ha = sstep(1.5, -1.5, hD);
          if (ha > 0) c = mixC(c, [228, 220, 202], ha);
        }
        // Tea surface: dark amber ellipse in the open rim.
        const teaQ = ellQ(x, y, 272, 742, 100, 15);
        const teaA = sstep(1.5, -1.5, (teaQ - 1) * 15);
        if (teaA > 0) {
          let tc: RGB = [122, 68, 19];
          if (x < 272 && y < 742) tc = [178, 110, 38];
          c = mixC(c, tc, teaA);
        }
        // Porcelain rim ring around the tea.
        const rimD = Math.abs(teaQ - 1) * 15;
        const rimA = sstep(3, 0, rimD);
        if (rimA > 0) c = mixC(c, [255, 248, 230], rimA * 0.9);
      }

      // Vignette: pull the corners in so the diagonal reads first.
      const vx = (x - 512) / 760;
      const vy = (y - 512) / 760;
      const vig = 1 - 0.2 * clamp(vx * vx + vy * vy, 0, 1);
      const i = idx(x, y);
      img[i] = clamp(c[0] * vig, 0, 255);
      img[i + 1] = clamp(c[1] * vig, 0, 255);
      img[i + 2] = clamp(c[2] * vig, 0, 255);
    }
  }
}

// ---------------------------------------------------------------- stamps: stars, splash, sparkles
function stampDisc(cx: number, cy: number, r: number, c: RGB, alpha: number): void {
  const rI = Math.ceil(r) + 1;
  for (let y = Math.floor(cy) - rI; y <= Math.floor(cy) + rI; y++) {
    for (let x = Math.floor(cx) - rI; x <= Math.floor(cx) + rI; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (d >= r) continue;
      const a = alpha * sstep(r, r * 0.55, d);
      blendPx(x, y, c, a);
    }
  }
}
function stampSparkle(cx: number, cy: number, r: number, c: RGB, alpha: number): void {
  const rI = Math.ceil(r);
  for (let y = Math.floor(cy) - rI; y <= Math.floor(cy) + rI; y++) {
    for (let x = Math.floor(cx) - rI; x <= Math.floor(cx) + rI; x++) {
      const dx = Math.abs(x - cx) / r;
      const dy = Math.abs(y - cy) / r;
      const v = Math.max(0, 1 - dx) * Math.max(0, 1 - dy * 6) + Math.max(0, 1 - dy) * Math.max(0, 1 - dx * 6);
      if (v <= 0) continue;
      blendPx(x, y, c, alpha * clamp(v, 0, 1));
    }
  }
  stampDisc(cx, cy, Math.max(1.5, r * 0.18), c, alpha);
}

function renderStars(): void {
  // Background stars: kept out of the text panel and the moon's face.
  for (let s = 0; s < 170; s++) {
    const x = rng() * W;
    const y = rng() * 860;
    if (x > 28 && x < 612 && y > 24 && y < 216) continue;
    if (Math.sqrt((x - MOON_X) * (x - MOON_X) + (y - MOON_Y) * (y - MOON_Y)) < MOON_R + 22) continue;
    const r = 0.8 + rng() * 1.9;
    const b = 0.45 + rng() * 0.55;
    const tint: RGB = rng() < 0.25 ? [255, 226, 160] : rng() < 0.5 ? [190, 220, 255] : [255, 255, 255];
    stampDisc(x, y, r, tint, b);
    if (rng() < 0.09) stampSparkle(x, y, 7 + rng() * 6, tint, 0.5);
  }
}

function renderSplashArc(): void {
  // Droplets leave the cup rim, swell into stars, and arc to the moon.
  const p0: [number, number] = [305, 722];
  const p1: [number, number] = [470, 430];
  const p2: [number, number] = [690, 295];
  for (let k = 0; k <= 22; k++) {
    const t = 0.04 + (k / 22) * 0.92;
    const mt = 1 - t;
    const x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0] + (rng() - 0.5) * 14;
    const y = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1] + (rng() - 0.5) * 14;
    const size = lerp(9, 4, t);
    const col: RGB = t < 0.45 ? [191, 230, 255] : t < 0.75 ? [255, 244, 200] : [255, 255, 255];
    stampDisc(x, y, size, col, 0.95);
    if (t > 0.55 && k % 2 === 0) stampSparkle(x, y, 10 + rng() * 8, [255, 240, 180], 0.75);
  }
  // Splash crown bursting from the cup's rim.
  for (let k = 0; k < 9; k++) {
    const ang = -Math.PI / 2 + (k - 4) * 0.22;
    const dist = 24 + rng() * 52;
    const x = 272 + Math.cos(ang) * dist;
    const y = 736 + Math.sin(ang) * dist * 0.9;
    stampDisc(x, y, 3.5 + rng() * 5.5, [205, 235, 255], 0.95);
  }
  // Three rising jets above the rim.
  for (const jx of [238, 272, 306]) {
    for (let k = 0; k < 4; k++) {
      stampDisc(jx + (rng() - 0.5) * 6, 730 - k * 13, 5.5 - k, [200, 232, 255], 0.9);
    }
  }
}

// ---------------------------------------------------------------- the goldfish
const FISH_CX = 545;
const FISH_CY = 462;
const FISH_A = -0.733; // head points up-right, about -42 degrees
const COS_A = Math.cos(FISH_A);
const SIN_A = Math.sin(FISH_A);

function renderFish(): void {
  for (let y = 220; y <= 710; y++) {
    for (let x = 320; x <= 790; x++) {
      const dx = x - FISH_CX;
      const dy = y - FISH_CY;
      // Rotate into the fish's own frame: +x toward the head.
      // Inverse of rotating local coords by FISH_A (head up-right).
      const lx = dx * COS_A + dy * SIN_A;
      const ly = -dx * SIN_A + dy * COS_A;
      // Body ellipse.
      const bq = Math.sqrt((lx / 150) * (lx / 150) + (ly / 64) * (ly / 64));
      const dBody = (bq - 1) * 62;
      // Flowing tail: two lobes fanning behind the body.
      const t1 = Math.sqrt(((lx + 185) / 72) * ((lx + 185) / 72) + ((ly + 30) / 26) * ((ly + 30) / 26));
      const t2 = Math.sqrt(((lx + 185) / 72) * ((lx + 185) / 72) + ((ly - 30) / 26) * ((ly - 30) / 26));
      const dTail = (Math.min(t1, t2) - 1) * 26;
      // Dorsal fin on the back.
      const fq = Math.sqrt(((lx + 20) / 56) * ((lx + 20) / 56) + ((ly + 58) / 18) * ((ly + 58) / 18));
      const dFin = (fq - 1) * 18;
      const d = Math.min(dBody, dTail, dFin);
      if (d >= 1.5) continue;
      const a = sstep(1.5, -1.5, d);
      let col: RGB;
      if (dFin === d) {
        col = [232, 93, 0];
      } else if (dTail === d) {
        // Tail: translucent-looking orange, paler toward the tips.
        const tip = clamp((-lx - 130) / 120, 0, 1);
        col = mixC([255, 154, 46], [255, 205, 120], tip);
      } else {
        // Body: deep orange back, gold belly, scale shimmer.
        const belly = sstep(-64, 64, ly);
        col = mixC([240, 106, 0], [255, 217, 122], belly);
        const shim = 0.5 + 0.5 * Math.sin(lx * 0.32) * Math.sin(ly * 0.42);
        col = [col[0] * (0.94 + shim * 0.1), col[1] * (0.94 + shim * 0.1), col[2] * (0.94 + shim * 0.1)];
        // Pale highlight stripe along the back.
        if (ly > -52 && ly < -28 && lx > -90 && lx < 105) {
          col = mixC(col, [255, 236, 180], 0.4);
        }
        // Gill curve.
        const gill = Math.abs(Math.sqrt((lx - 62) * (lx - 62) + ly * ly) - 36);
        if (gill < 2.5 && lx > 40 && lx < 95) col = mixC(col, [180, 70, 0], 0.55);
      }
      // Eye: white ring, black pupil, glint.
      const eyeD = Math.sqrt((lx - 98) * (lx - 98) + (ly + 16) * (ly + 16));
      if (eyeD < 13) {
        col = [255, 252, 240];
        if (eyeD < 6.5) col = [16, 10, 8];
        if (eyeD < 2.5 && lx > 98) col = [255, 255, 255];
      }
      // Mouth.
      const moD = Math.sqrt(((lx - 146) / 7) * ((lx - 146) / 7) + ((ly - 4) / 4.5) * ((ly - 4) / 4.5));
      if (moD < 1) col = [120, 40, 0];
      blendPx(x, y, col, a);
    }
  }
}

// ---------------------------------------------------------------- 5x7 bitmap font
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
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

function drawTextLine(line: string, x0: number, y0: number, scale: number, c: RGB): void {
  // Soft shadow first, then the face, so the letters lift off the panel.
  for (const pass of [0, 1]) {
    const ox = pass === 0 ? 3 : 0;
    const oy = pass === 0 ? 3 : 0;
    const col: RGB = pass === 0 ? [5, 7, 18] : c;
    for (let ci = 0; ci < line.length; ci++) {
      const glyph = FONT[line[ci]];
      if (!glyph) continue;
      const gx = x0 + ci * (5 * scale + scale);
      for (let r = 0; r < 7; r++) {
        for (let colI = 0; colI < 5; colI++) {
          if (glyph[r][colI] !== "1") continue;
          for (let py = 0; py < scale; py++) {
            for (let px = 0; px < scale; px++) {
              setPx(gx + colI * scale + px + ox, y0 + r * scale + py + oy, col);
            }
          }
        }
      }
    }
  }
}

function renderText(): void {
  drawTextLine("THE SKY FITS", 107, 64, 6, [255, 243, 196]);
  drawTextLine("IN A TEACUP!", 107, 120, 6, [255, 217, 77]);
}

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
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
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function main(): void {
  renderBase();
  renderStars();
  renderSplashArc();
  renderFish();
  // A few bright droplets in front of the fish, where the splash leaves the cup.
  stampDisc(338, 688, 6, [210, 236, 255], 0.95);
  stampDisc(392, 648, 5, [220, 240, 255], 0.95);
  stampDisc(356, 612, 4, [255, 244, 200], 0.95);
  stampSparkle(700, 300, 16, [255, 240, 180], 0.8);
  renderText();
  const png = encodePNG();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), png);
  console.log(`wrote ${join(outDir, "entry.png")} (${png.length} bytes, ${W}x${H})`);
}

main();
