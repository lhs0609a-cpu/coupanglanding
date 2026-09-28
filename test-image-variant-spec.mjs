// 대표이미지 변형이 쿠팡 규격(500~5000px, 10MB)을 지키는지 + 셀러끼리 실제로 다른 파일이
// 되는지 실제 이미지로 확인한다. catalog-register.ts 의 makeSellerMainImage 와 같은 수식.
import { createHash } from 'crypto';
import JimpPkg from 'jimp';
const Jimp = JimpPkg.default || JimpPkg;

const URL_ = process.argv[2] || 'https://dwfhcshvkxyokvtbgluw.supabase.co/storage/v1/object/public/product-images/catalog/naver_13523068260/000.png';

function stringToSeed(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
function createSeededRandom(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const SELLERS = ['46623ab0-a', 'dd59b013-b', 'ea9d0da6-c', '756c23b2-d', 'f13d611d-e', '47841ad3-f'];
const COUPANG_MIN = 500, COUPANG_MAX = 5000;

const res = await fetch(URL_);
const input = Buffer.from(await res.arrayBuffer());
const src = await Jimp.read(input);
const w0 = src.getWidth(), h0 = src.getHeight();
console.log(`원본: ${w0}×${h0}, ${(input.length / 1024).toFixed(0)}KB, 비율 ${(w0 / h0).toFixed(4)}\n`);

const hashes = new Set();
let allOk = true;

for (const uid of SELLERS) {
  const image = await Jimp.read(input);
  const w = image.getWidth(), h = image.getHeight();
  const rng = createSeededRandom(stringToSeed(`seller_${uid}::img::prod-1`));

  const keep = 0.96 + rng() * 0.03;
  let cw = Math.round(w * keep), ch = Math.round(h * keep);
  let cropped = false;
  if (cw >= COUPANG_MIN && ch >= COUPANG_MIN && cw <= w && ch <= h) {
    image.crop(Math.floor(rng() * (w - cw)), Math.floor(rng() * (h - ch)), cw, ch);
    cropped = true;
  }
  if (image.getWidth() > COUPANG_MAX || image.getHeight() > COUPANG_MAX) {
    const f = Math.min(4500 / image.getWidth(), 4500 / image.getHeight());
    image.resize(Math.round(image.getWidth() * f), Math.round(image.getHeight() * f));
  }
  if (image.getWidth() < COUPANG_MIN || image.getHeight() < COUPANG_MIN) {
    const f = Math.max(800 / image.getWidth(), 800 / image.getHeight());
    image.resize(Math.round(image.getWidth() * f), Math.round(image.getHeight() * f));
  }
  image.brightness((rng() - 0.5) * 0.03);

  let q = 92;
  let out = Buffer.from(await image.quality(q).getBufferAsync(Jimp.MIME_JPEG));
  while (out.length > 10 * 1024 * 1024 && q > 50) { q -= 10; out = Buffer.from(await image.quality(q).getBufferAsync(Jimp.MIME_JPEG)); }

  const W = image.getWidth(), H = image.getHeight();
  const ratioDrift = Math.abs(W / H - w0 / h0);
  const specOk = W >= COUPANG_MIN && H >= COUPANG_MIN && W <= COUPANG_MAX && H <= COUPANG_MAX && out.length <= 10 * 1024 * 1024;
  const areaKept = ((W * H) / (w0 * h0) * 100).toFixed(1);
  if (!specOk || ratioDrift > 0.01) allOk = false;

  hashes.add(createHash('sha1').update(out).digest('hex'));
  console.log(`${uid}  ${W}×${H}  ${(out.length / 1024).toFixed(0)}KB  면적 ${areaKept}%  비율오차 ${ratioDrift.toFixed(5)}  크롭:${cropped ? 'O' : 'X'}  규격:${specOk ? 'OK' : '위반'}`);
}

console.log(`\n고유 이미지: ${hashes.size} / ${SELLERS.length}`);
console.log(`규격 준수  : ${allOk ? '전부 통과 (500~5000px, 10MB 이하, 비율 유지)' : '위반 있음'}`);
console.log(`\n판정: ${hashes.size === SELLERS.length && allOk ? '통과' : '실패'}`);
