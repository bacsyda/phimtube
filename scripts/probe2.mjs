// Đo sâu một nguồn: bộ lọc, tìm kiếm, và trang embed (nơi có thể chứa link m3u8).
// Chạy:  node scripts/probe2.mjs https://vsmov.com/api
const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!base) { console.log('Cách dùng: node scripts/probe2.mjs <base API>'); process.exit(1); }
const origin = new URL(base).origin;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const cut = (v, n = 140) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > n ? s.slice(0, n) + '…' : s; };
const keys = (o) => (o && typeof o === 'object' ? Object.keys(o).join(', ') : String(o));
const items = (j) => j?.items || j?.data?.items || [];
const flat = (s) => s.replace(/\s+/g, ' ').trim();

async function get(url, headers = {}) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*', ...headers }, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    return { status: r.status, type: r.headers.get('content-type') || '', text: t, json: j };
  } catch (e) { return { status: 0, type: '', text: '', json: null, err: e?.cause?.code || e?.message }; }
}
async function api(label, path) {
  const r = await get(base + path, { Accept: 'application/json' });
  const j = r.json, list = items(j);
  const first = list[0];
  console.log(`\n== ${label}\n   GET ${base}${path}\n   -> HTTP ${r.status}${r.err ? ' LỖI ' + r.err : ''}${j ? '' : r.status ? '  (không phải JSON)' : ''}` +
    (j ? `\n   khoá gốc: ${keys(j)} | số item: ${list.length}${first ? ` | item đầu: ${cut({ name: first.name, slug: first.slug, type: first.type, category: first.category, country: first.country, year: first.year }, 200)}` : ''}` : ''));
  return r;
}

const latest = await get(base + '/danh-sach/phim-moi-cap-nhat?page=1', { Accept: 'application/json' });
const slug = items(latest.json).find((x) => x?.slug)?.slug;
const pick = async (p) => { const r = await get(base + p, { Accept: 'application/json' }); const a = r.json?.data?.items || r.json?.data || r.json?.items || (Array.isArray(r.json) ? r.json : []); return (Array.isArray(a) ? a : []).find((x) => x?.slug && x?.name?.trim?.()); };
const genre = await pick('/the-loai'), country = await pick('/quoc-gia');
console.log('thể loại mẫu:', cut(genre), '| quốc gia mẫu:', cut(country));

console.log('\n######## A. LỌC THEO LOẠI / THỂ LOẠI / QUỐC GIA / NĂM');
await api('Phim lẻ', '/danh-sach/phim-le?page=1');
await api('Hoạt hình', '/danh-sach/hoat-hinh?page=1');
await api('TV Shows', '/danh-sach/tv-shows?page=1');
if (genre) {
  await api(`Theo thể loại (đường /the-loai/${genre.slug})`, `/the-loai/${genre.slug}?page=1`);
  await api('Phim lẻ + tham số category', `/danh-sach/phim-le?page=1&category=${genre.slug}`);
}
if (country) {
  await api(`Theo quốc gia (đường /quoc-gia/${country.slug})`, `/quoc-gia/${country.slug}?page=1`);
  await api('Phim lẻ + tham số country', `/danh-sach/phim-le?page=1&country=${country.slug}`);
}
await api('Phim lẻ + tham số year=2020', '/danh-sach/phim-le?page=1&year=2020');
await api('Thử đường khác: /phim-le', '/phim-le?page=1');
await api('Gốc API', '');

console.log('\n######## B. TÌM KIẾM');
for (const p of ['/tim-kiem?keyword=batman&page=1&limit=3', '/tim-kiem/?keyword=batman', '/danh-sach/tim-kiem?keyword=batman', '/search?keyword=batman', '/v1/api/tim-kiem?keyword=batman']) await api('Tìm kiếm', p);

console.log('\n######## C. TRANG EMBED (tìm link m3u8)');
let embed = '';
if (slug) {
  const d = await get(base + '/phim/' + encodeURIComponent(slug), { Accept: 'application/json' });
  const e = d.json?.episodes?.[0]?.server_data?.[0];
  console.log('tập đầu:', cut(e, 400));
  embed = e?.link_embed || '';
}
if (!embed) console.log('Không có link_embed để thử.');
else {
  for (const [label, headers] of [['không Referer', {}], [`Referer ${origin}/`, { Referer: origin + '/' }]]) {
    const r = await get(embed, headers);
    console.log(`\n-- GET ${embed} (${label}) -> HTTP ${r.status} ${r.type} ${r.text.length} ký tự${r.err ? ' LỖI ' + r.err : ''}`);
    if (!r.text) continue;
    const m3u8 = [...new Set(r.text.match(/https?:[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*/g) || [])];
    const rel = [...new Set(r.text.match(/["'`][^"'`\s]*\.m3u8[^"'`\s]*["'`]/g) || [])];
    const apis = [...new Set(r.text.match(/["'`](?:https?:\/\/[^"'`\s]+)?\/(?:api|source|stream|hls|get)[^"'`\s]*["'`]/gi) || [])];
    const scripts = [...new Set([...r.text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((x) => x[1]))];
    console.log('   m3u8 (tuyệt đối):', m3u8.length ? m3u8.slice(0, 5).join('\n                     ') : '(không có)');
    console.log('   m3u8 (chuỗi tương đối):', rel.slice(0, 5).join(' , ') || '(không có)');
    console.log('   chuỗi giống đường API:', apis.slice(0, 10).join(' , ') || '(không có)');
    console.log('   thẻ <script src>:', scripts.slice(0, 8).join(' , ') || '(không có)');
    console.log('   600 ký tự đầu:', flat(r.text).slice(0, 600));
  }
}
console.log('\nXong. Dán toàn bộ phần trên lại cho mình.');
