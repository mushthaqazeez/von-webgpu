import fs from "fs";
import path from "path";
import zlib from "zlib";

function createPNG(size, primaryColor = [245, 158, 11, 255], bgColor = [15, 23, 42, 255]) {
  const width = size;
  const height = size;

  // Raw RGBA pixel buffer: (width * 4 + 1) per row for PNG filter byte
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  const cx = width / 2;
  const cy = height / 2;
  const r = width * 0.42;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Mentat diamond / ocular pupil geometry
      const diamondDist = Math.abs(dx) + Math.abs(dy);
      const inCircle = dist <= r;
      const inDiamond = diamondDist <= r * 0.75;
      const inPupil = dist <= r * 0.25;

      if (inPupil) {
        // Cyan prescience pupil
        rawData[offset++] = 6;
        rawData[offset++] = 182;
        rawData[offset++] = 212;
        rawData[offset++] = 255;
      } else if (inDiamond) {
        // Spice Amber diamond
        rawData[offset++] = primaryColor[0];
        rawData[offset++] = primaryColor[1];
        rawData[offset++] = primaryColor[2];
        rawData[offset++] = 255;
      } else if (inCircle) {
        // Dark metallic outer ring
        rawData[offset++] = 30;
        rawData[offset++] = 41;
        rawData[offset++] = 59;
        rawData[offset++] = 255;
      } else {
        // Transparent
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      }
    }
  }

  // Compress IDAT
  const compressed = zlib.deflateSync(rawData);

  // Helper to calculate CRC32
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    const body = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crcBuf]);
  }

  // Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // Bit depth
  ihdrData[9] = 6;  // Color type: RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdr = makeChunk("IHDR", ihdrData);

  // IDAT
  const idat = makeChunk("IDAT", compressed);

  // IEND
  const iend = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const iconsDir = path.resolve("extension/icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach((size) => {
  const png = createPNG(size);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`[✓] Generated ${filePath}`);
});
