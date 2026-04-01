/**
 * Generates minimal valid PNG icons for the Chrome extension.
 * Creates a solid blue square at 16x16, 48x48, and 128x128.
 * Run once with: node generate-icons.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Build a minimal valid PNG buffer for a solid-colour square.
 *
 * @param {number} size - Width and height in pixels
 * @param {number} r - Red channel (0–255)
 * @param {number} g - Green channel (0–255)
 * @param {number} b - Blue channel (0–255)
 * @returns {Buffer}
 */
function buildPNG(size, r, g, b) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // ---- IHDR chunk ----
  // Width (4) | Height (4) | Bit depth (1=8) | Colour type (1=2, RGB) | Compression (1=0) | Filter (1=0) | Interlace (1=0)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8]  = 8;  // bit depth
  ihdrData[9]  = 2;  // colour type: RGB (truecolour)
  ihdrData[10] = 0;  // compression method
  ihdrData[11] = 0;  // filter method
  ihdrData[12] = 0;  // interlace method
  const ihdr = buildChunk('IHDR', ihdrData);

  // ---- IDAT chunk ----
  // Build raw image data: for each row, a filter byte (0 = None) followed by RGB pixels
  const rawRows = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 3);
    rawRows[rowOffset] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const pixOffset = rowOffset + 1 + x * 3;
      rawRows[pixOffset]     = r;
      rawRows[pixOffset + 1] = g;
      rawRows[pixOffset + 2] = b;
    }
  }
  const compressed = zlib.deflateSync(rawRows);
  const idat = buildChunk('IDAT', compressed);

  // ---- IEND chunk ----
  const iend = buildChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * Build a PNG chunk: length (4) | type (4) | data (n) | CRC (4).
 * @param {string} type - 4-character chunk type
 * @param {Buffer} data
 * @returns {Buffer}
 */
function buildChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lenBuffer  = Buffer.alloc(4);
  lenBuffer.writeUInt32BE(data.length, 0);

  // CRC covers type + data
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc      = crc32(crcInput);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([lenBuffer, typeBuffer, data, crcBuffer]);
}

// CRC-32 lookup table (PNG uses standard CRC-32)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ---- Main ----
const outDir = path.join(__dirname, 'extension', 'icons');
fs.mkdirSync(outDir, { recursive: true });

// Upwork blue: #2563EB → 37, 99, 235
const sizes = [16, 48, 128];
for (const size of sizes) {
  const buf = buildPNG(size, 37, 99, 235);
  const outPath = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`Written: ${outPath} (${buf.length} bytes)`);
}

console.log('Done.');
