import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
function icon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const scale = size / 512;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = (x + .5) / scale, py = (y + .5) / scale;
      const frame = ((Math.abs(px - 114) < 11 || Math.abs(px - 398) < 11) && py >= 88 && py <= 424) || ((Math.abs(py - 88) < 11 || Math.abs(py - 424) < 11) && px >= 114 && px <= 398);
      const halfway = Math.abs(py - 256) < 8.5 && px >= 114 && px <= 398;
      const box = ((Math.abs(px - 193) < 8.5 || Math.abs(px - 319) < 8.5) && (py <= 142 || py >= 370) && py >= 88 && py <= 424) || ((Math.abs(py - 142) < 8.5 || Math.abs(py - 370) < 8.5) && px >= 193 && px <= 319);
      const center = Math.abs(Math.hypot(px - 256, py - 256) - 45) < 8.5;
      const white = frame || halfway || box || center;
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      raw[offset] = white ? 255 : 22;
      raw[offset + 1] = white ? 255 : 93;
      raw[offset + 2] = white ? 255 : 70;
      raw[offset + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const size of [192, 512]) await writeFile(resolve(`apps/web/public/icons/icon-${size}.png`), icon(size));
