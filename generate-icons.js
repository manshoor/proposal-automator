/**
 * Generate professional extension icons with an upward arrow + document design.
 * Upwork-green rounded rectangle with white arrow symbol.
 * Run: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, drawFn) {
  const ch = 4;
  const raw = Buffer.alloc(height * (1 + width * ch));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * ch)] = 0;
    for (let x = 0; x < width; x++) {
      const off = y * (1 + width * ch) + 1 + x * ch;
      const c = drawFn(x, y, width, height);
      raw[off] = c[0]; raw[off+1] = c[1]; raw[off+2] = c[2]; raw[off+3] = c[3];
    }
  }
  const deflated = zlib.deflateSync(raw);
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0); }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, cr]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflated), chunk('IEND', Buffer.alloc(0))]);
}

function dist(x1, y1, x2, y2) { return Math.sqrt((x1-x2)*(x1-x2) + (y1-y2)*(y1-y2)); }

function drawIcon(x, y, w, h) {
  const m = w * 0.06; // margin
  const r = w * 0.2;  // corner radius
  const cx = w / 2, cy = h / 2;

  // Rounded rect check
  function inRR(px, py) {
    const l = m, ri = w - m, t = m, b = h - m;
    if (px >= l + r && px <= ri - r && py >= t && py <= b) return true;
    if (px >= l && px <= ri && py >= t + r && py <= b - r) return true;
    const corners = [[l+r,t+r],[ri-r,t+r],[l+r,b-r],[ri-r,b-r]];
    for (const c of corners) { if (dist(px, py, c[0], c[1]) <= r) return true; }
    return false;
  }

  if (!inRR(x, y)) return [0, 0, 0, 0];

  // Green gradient background
  const t = y / h;
  const bgR = Math.round(16 + t * 4);
  const bgG = Math.round(160 - t * 25);
  const bgB = Math.round(0 + t * 8);

  // Normalize coords to -1..1
  const nx = (x - cx) / (w * 0.32);
  const ny = (y - cy) / (h * 0.32);

  // --- Draw paper plane / send icon ---

  // Diagonal paper plane shape — a tilted triangle
  // Main body: triangle from top-right to bottom-left
  const plane1 = nx * 0.6 + ny * -0.8 < -0.05 &&
                 nx * -0.3 + ny * -0.6 < 0.15 &&
                 ny < 0.5 && ny > -0.85 && nx > -0.75 && nx < 0.85;

  // Upper wing
  const wing = ny < nx * -0.5 + 0.1 && ny > nx * -0.5 - 0.2 &&
               nx > -0.6 && nx < 0.8 && ny > -0.85 && ny < 0.1;

  // Lower fold line
  const fold = ny > nx * 0.8 - 0.3 && ny < nx * 0.8 - 0.05 &&
               nx > -0.4 && nx < 0.6 && ny > -0.2 && ny < 0.5;

  // Simple approach: draw a bold "UP" arrow that's clearly readable
  // Chevron arrow pointing up (like ↑ but bolder)
  const aw = Math.abs(nx);
  const chevronUp = ny >= -0.75 && ny <= -0.05 && aw <= 0.55 &&
    (ny <= -0.75 + aw * 1.3 + 0.08) && (ny >= -0.75 + aw * 1.3 - 0.18);

  // Vertical stem below chevron
  const stem = ny >= -0.2 && ny <= 0.45 && aw <= 0.15;

  // Horizontal underline (document line)
  const line1 = ny >= 0.6 && ny <= 0.72 && aw <= 0.6;
  const line2 = ny >= 0.8 && ny <= 0.88 && aw <= 0.4;

  if (chevronUp || stem || line1 || line2) {
    return [255, 255, 255, 255];
  }

  return [bgR, bgG, bgB, 255];
}

const sizes = [16, 48, 128];
const outDir = path.join(__dirname, 'extension', 'icons');

for (const size of sizes) {
  const png = createPNG(size, size, drawIcon);
  const out = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`Written: ${out} (${png.length} bytes)`);
}
console.log('Done.');
