// Lấy mẫu JSON thật của 4 nguồn phim, lưu vào samples/<nguồn>/<tên>.json
// Chạy từ thư mục gốc dự án:  node scripts/sample.mjs
// Chỉ chạy một nguồn:         node scripts/sample.mjs topxx
// Cần Node 18+. Không ghi đè gì ngoài thư mục samples/.
import { mkdir, writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX = 300_000; // mỗi file tối đa ~300KB

// Placeholder: {id} = mã phim lấy từ danh sách "latest" (slug hoặc code tuỳ nguồn),
// {genre} {country} {actor} = mã đầu tiên lấy từ danh sách metadata tương ứng.
// Các đường dẫn ghi "THỬ" là chưa được tài liệu xác nhận: 404 là bình thường.
const SOURCES = {
  kkphim: {
    base: 'https://phimapi.com', idKey: 'slug',
    eps: [
      ['latest', '/danh-sach/phim-moi-cap-nhat?page=1'],
      ['type-phim-bo', '/v1/api/danh-sach/phim-bo?page=1&limit=5'],
      ['type-phim-le-filtered', '/v1/api/danh-sach/phim-le?page=1&limit=5&country=han-quoc&year=2023'],
      ['genres', '/the-loai', 'genre'],
      ['countries', '/quoc-gia', 'country'],
      ['years-try1', '/v1/api/nam-phat-hanh'],
      ['years-try2', '/nam-phat-hanh'],
      ['by-genre', '/v1/api/the-loai/{genre}?page=1&limit=5'],
      ['by-country', '/v1/api/quoc-gia/{country}?page=1&limit=5'],
      ['by-year', '/v1/api/nam/2023?page=1&limit=5'],
      ['search', '/v1/api/tim-kiem?keyword=batman&page=1&limit=5'],
      ['detail', '/phim/{id}'],
    ],
  },
  vsmov: {
    base: 'https://vsmov.com/api', idKey: 'slug',
    eps: [
      ['latest', '/danh-sach/phim-moi-cap-nhat?page=1'],
      ['subteam', '/danh-sach/subteam?page=1&limit=5'],
      ['search', '/tim-kiem?keyword=avengers&limit=5'],
      ['detail', '/phim/{id}'],
      // THỬ: chưa có path trong tài liệu
      ['genres-try1', '/the-loai', 'genre'],
      ['genres-try2', '/v1/api/the-loai', 'genre'],
      ['countries-try1', '/quoc-gia', 'country'],
      ['countries-try2', '/v1/api/quoc-gia', 'country'],
      ['years-try1', '/nam-phat-hanh'],
      ['years-try2', '/v1/api/nam-phat-hanh'],
      ['code-try', '/danh-sach/code?page=1&limit=5'],
      ['type-try1', '/danh-sach/phim-bo?page=1&limit=5'],
      ['type-try2', '/v1/api/danh-sach/phim-bo?page=1&limit=5'],
      ['by-genre-try1', '/the-loai/{genre}?page=1&limit=5'],
      ['by-genre-try2', '/v1/api/the-loai/{genre}?page=1&limit=5'],
      ['by-country-try1', '/quoc-gia/{country}?page=1&limit=5'],
      ['by-country-try2', '/v1/api/quoc-gia/{country}?page=1&limit=5'],
      ['search-try-v1', '/v1/api/tim-kiem?keyword=avengers&limit=5'],
    ],
  },
  vsphim: {
    base: 'https://nguon.vsphim.com', idKey: 'slug',
    // Tài liệu ghi base không có /api, code đang dùng có /api: thử cả hai
    eps: [
      ['latest-api', '/api/danh-sach/phim-moi-cap-nhat?page=1'],
      ['latest-noapi', '/danh-sach/phim-moi-cap-nhat?page=1'],
      ['detail-api', '/api/phim/{id}'],
      ['detail-noapi', '/phim/{id}'],
      ['search-api', '/api/tim-kiem?keyword=batman&limit=5'],
      ['search-noapi', '/tim-kiem?keyword=batman&limit=5'],
      ['search-v1', '/v1/api/tim-kiem?keyword=batman&limit=5'],
      ['genres-api', '/api/the-loai', 'genre'],
      ['genres-noapi', '/the-loai', 'genre'],
      ['genres-v1', '/v1/api/the-loai', 'genre'],
      ['countries-api', '/api/quoc-gia', 'country'],
      ['countries-noapi', '/quoc-gia', 'country'],
      ['countries-v1', '/v1/api/quoc-gia', 'country'],
      ['years-api', '/api/nam-phat-hanh'],
      ['years-noapi', '/nam-phat-hanh'],
      ['years-v1', '/v1/api/nam-phat-hanh'],
      ['type-api', '/api/danh-sach/phim-bo?page=1&limit=5'],
      ['type-v1', '/v1/api/danh-sach/phim-bo?page=1&limit=5'],
      ['by-genre-api', '/api/the-loai/{genre}?page=1&limit=5'],
      ['by-genre-v1', '/v1/api/the-loai/{genre}?page=1&limit=5'],
      ['by-country-api', '/api/quoc-gia/{country}?page=1&limit=5'],
      ['by-country-v1', '/v1/api/quoc-gia/{country}?page=1&limit=5'],
      ['root', '/'],
      ['api-root', '/api'],
    ],
  },
  topxx: {
    base: 'https://topxx.vip/api/v1', idKey: 'code',
    eps: [
      ['latest', '/movies/latest'],
      ['latest-page2', '/movies/latest?page=2'],
      ['today', '/movies/today'],
      ['detail', '/movies/{id}'],
      ['genres', '/genres', 'genre'],
      ['countries', '/countries', 'country'],
      ['actors', '/actors', 'actor'],
      ['by-genre', '/genres/{genre}/movies'],
      ['by-country', '/countries/{country}/movies'],
      ['by-actor', '/actors/{actor}/movies'],
      // Tên tham số tìm kiếm chưa xác minh: thử vài kiểu
      ['search-keyword', '/movies/search?keyword=batman'],
      ['search-q', '/movies/search?q=batman'],
      ['search-query', '/movies/search?query=batman'],
      ['search-s', '/movies/search?s=batman'],
      ['search-name', '/movies/search?name=batman'],
      ['search-noparam', '/movies/search'],
    ],
  },
};

// Tìm mã đầu tiên trong JSON bất kỳ: object có slug/code/id (ưu tiên khoá `prefer`)
function firstCode(j, prefer) {
  const keys = [prefer, 'slug', 'code', 'id', '_id'].filter(Boolean);
  const seen = new Set();
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 6 || seen.has(v)) return null;
    seen.add(v);
    if (!Array.isArray(v)) for (const k of keys) if (typeof v[k] === 'string' && v[k].trim() && (v.name || v.title || k === prefer)) return v[k];
    for (const x of Array.isArray(v) ? v : Object.values(v)) { const r = walk(x, depth + 1); if (r) return r; }
    return null;
  };
  return walk(j, 0);
}

const topKeys = (j) => (j && typeof j === 'object' ? (Array.isArray(j) ? `[array ${j.length}]` : Object.keys(j).slice(0, 8).join(',')) : '-');

async function run(id, cfg) {
  const dir = `samples/${id}`;
  await mkdir(dir, { recursive: true });
  const ctx = {};
  const rows = [];
  for (const [name, tpl, provides] of cfg.eps) {
    const need = [...tpl.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const missing = need.filter((k) => !ctx[k]);
    if (missing.length) { rows.push(`${id.padEnd(7)} ${name.padEnd(24)} BỎ QUA (chưa có ${missing.join(',')})`); continue; }
    const path = tpl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(ctx[k]));
    const url = cfg.base + path;
    const t0 = Date.now();
    let status = 0, type = '', text = '', err = '';
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      status = r.status; type = r.headers.get('content-type') || ''; text = await r.text();
    } catch (e) { err = e?.cause?.code || e?.message || 'lỗi'; }
    const ms = Date.now() - t0;
    let j = null; try { j = JSON.parse(text); } catch {}
    if (j && name.startsWith('latest') && !ctx.id) { const c = firstCode(j, cfg.idKey); if (c) ctx.id = c; }
    if (j && provides) { const c = firstCode(j, provides === 'genre' || provides === 'country' || provides === 'actor' ? cfg.idKey : null); if (c && !ctx[provides]) ctx[provides] = c; }
    const ok = status >= 200 && status < 300;
    if (text && ok) await writeFile(`${dir}/${name}.${j ? 'json' : 'txt'}`, text.slice(0, MAX));
    rows.push(`${id.padEnd(7)} ${name.padEnd(24)} HTTP ${String(status || err).padEnd(4)} ${ms}ms ${(type.split(';')[0] || '').padEnd(18)} ${j ? 'JSON ' + topKeys(j) : text ? 'KHÔNG phải JSON' : ''}  ${url}`);
  }
  console.log(rows.join('\n'));
  return rows;
}

const only = process.argv[2];
const all = [];
for (const [id, cfg] of Object.entries(SOURCES)) {
  if (only && only !== id) continue;
  console.log(`\n===== ${id} (${cfg.base})`);
  all.push(...(await run(id, cfg)));
}
await mkdir('samples', { recursive: true });
await writeFile('samples/summary.txt', all.join('\n') + '\n');
console.log('\nXong. Gửi lại file samples.zip (hoặc thư mục samples/) và nội dung samples/summary.txt.');
