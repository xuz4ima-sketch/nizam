// Генерирует PNG-иконки PWA (без внешних зависимостей): восьмиконечная звезда на изумрудном фоне.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [6, 95, 70];
const FG = [236, 253, 245];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const c = size / 2, half = size * 0.215, r1 = size * 0.14, r2 = size * 0.066;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const inSq = Math.abs(dx) <= half && Math.abs(dy) <= half;
      const rx = (dx + dy) / Math.SQRT2, ry = (dy - dx) / Math.SQRT2;
      const inRot = Math.abs(rx) <= half && Math.abs(ry) <= half;
      const d = Math.hypot(dx, dy);
      let col = BG;
      if ((inSq || inRot) && !(d <= r1 && d > r2)) col = FG;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
mkdirSync('public', { recursive: true });
for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, png(s));
console.log('icons ok');
