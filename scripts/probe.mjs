// Đo thử API của một nguồn phim: in mã trạng thái, các khoá chính và một mẫu dữ liệu.
// Chạy:  node scripts/probe.mjs https://vsmov.com/api
// Dán toàn bộ kết quả để biết nguồn trả về dạng nào.
const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!base) { console.log('Cách dùng: node scripts/probe.mjs <base API>, ví dụ https://vsmov.com/api'); process.exit(1); }

const cut = (v, n = 160) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > n ? s.slice(0, n) + '…' : s; };
const keys = (o) => (o && typeof o === 'object' ? Object.keys(o).join(', ') : String(o));

async function hit(label, path) {
  const url = base + path;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch {}
    console.log(`\n== ${label}\n   GET ${url}\n   -> HTTP ${r.status} ${r.headers.get('content-type') || ''}${j ? '' : '  (KHÔNG phải JSON: ' + cut(t.replace(/\s+/g, ' '), 120) + ')'}`);
    return j;
  } catch (e) {
    console.log(`\n== ${label}\n   GET ${url}\n   -> LỖI ${e?.cause?.code || e?.message}`);
    return null;
  }
}
const items = (j) => (j?.items || j?.data?.items || []);

const latest = await hit('Phim mới cập nhật', '/danh-sach/phim-moi-cap-nhat?page=1');
if (latest) {
  console.log('   khoá gốc:', keys(latest));
  console.log('   khoá item đầu:', keys(items(latest)[0]));
  console.log('   pathImage:', cut(latest.pathImage));
}
const slug = items(latest).find((x) => x?.slug)?.slug;

for (const [label, p] of [['Phim lẻ (v1)', '/v1/api/danh-sach/phim-le?page=1'], ['Phim lẻ (không v1)', '/danh-sach/phim-le?page=1'],
  ['Phim bộ (v1)', '/v1/api/danh-sach/phim-bo?page=1'], ['Phim bộ (không v1)', '/danh-sach/phim-bo?page=1']]) {
  const j = await hit(label, p);
  if (j) console.log('   khoá gốc:', keys(j), '| data:', keys(j.data), '| số item:', items(j).length);
}
for (const [label, p] of [['Thể loại (v1)', '/v1/api/the-loai'], ['Thể loại (không v1)', '/the-loai'], ['Quốc gia (v1)', '/v1/api/quoc-gia'], ['Quốc gia (không v1)', '/quoc-gia']]) {
  const j = await hit(label, p);
  if (j) console.log('   khoá gốc:', keys(j), '| mẫu:', cut(Array.isArray(j) ? j[0] : (j.data?.items || j.items || j.data || [])[0]));
}
const s = await hit('Tìm kiếm (v1)', '/v1/api/tim-kiem?keyword=a&page=1&limit=3');
if (s) console.log('   số item:', items(s).length);
if (slug) {
  const d = await hit('Chi tiết phim', '/phim/' + encodeURIComponent(slug));
  if (d) {
    console.log('   khoá gốc:', keys(d), '| status:', d.status);
    console.log('   khoá movie:', keys(d.movie));
    const sv = d.episodes?.[0];
    console.log('   server đầu:', sv ? keys(sv) : 'KHÔNG CÓ episodes');
    console.log('   tập đầu:', cut(sv?.server_data?.[0], 400));
  }
}
console.log('\nXong. Dán toàn bộ phần trên lại cho mình.');
