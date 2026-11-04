// Chạy:  node --test test/
// Kiểm tra các mapper trên dữ liệu thật đã lưu (test/fixtures, lấy bằng scripts/sample.mjs) và cách dựng đường dẫn.
// Khi một nguồn đổi schema: chạy lại scripts/sample.mjs, cập nhật fixture, test sẽ chỉ ra chỗ lệch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCES } from '../lib/sources.js';
import { makeImg, uniqOptions, isNoise, toPage, NotFound } from '../lib/adapters/common.js';
import * as kk from '../lib/adapters/kk.js';
import * as tx from '../lib/adapters/topxx.js';
import { source, readQuery, listArgs } from '../lib/adapters/index.js';

const fx = (s, n) => JSON.parse(readFileSync(new URL(`./fixtures/${s}/${n}.json`, import.meta.url), 'utf8'));
const ctx = (id) => ({ id, img: makeImg(SOURCES[id].img), onlySingle: SOURCES[id].kinds.length === 1 && SOURCES[id].kinds[0] === 'single' });
const MOD = { kkphim: kk, vsmov: kk, vsphim: kk, topxx: tx };

// Hợp đồng của "mô hình chuẩn": mọi nguồn phải thoả, giao diện dựa vào đây
function assertCard(c, id) {
  assert.equal(c.src, id);
  for (const k of ['slug', 'title']) assert.ok(typeof c[k] === 'string' && c[k], `${id}: thiếu ${k}`);
  for (const k of ['original', 'lang', 'quality', 'episode', 'duration', 'cover', 'poster']) assert.equal(typeof c[k], 'string', `${id}: ${k} phải là chuỗi`);
  assert.ok(Array.isArray(c.country), `${id}: country phải là mảng`);
  assert.ok(['series', 'single', null].includes(c.kind), `${id}: kind lạ ${c.kind}`);
  assert.equal(c.isSeries, c.kind === 'series');
  assert.match(c.cover, /^https?:\/\//, `${id}: cover không phải URL (${c.cover})`);
}

const LISTS = {
  kkphim: ['latest', 'type-phim-bo', 'search'],
  vsmov: ['latest', 'search'],
  vsphim: ['latest', 'search'],
  topxx: ['latest', 'search'],
};
for (const [id, names] of Object.entries(LISTS)) {
  for (const n of names) {
    test(`${id}: danh sách "${n}" → mô hình chuẩn`, () => {
      const raw = fx(id, n);
      const r = MOD[id].mapList(raw, ctx(id));
      assert.ok(r.items.length > 0, 'danh sách rỗng');
      r.items.forEach((c) => assertCard(c, id));
      assert.ok(r.pagination.page >= 1 && r.pagination.totalPages >= 1);
      // Không phim nào được mất âm thầm
      const total = (raw.items || raw.data?.items || raw.data || []).length;
      assert.equal(r.items.length, total, 'có phim bị bỏ qua');
    });
  }
}

test('vsphim: quốc gia ở danh sách là chuỗi vẫn ra được (lỗi cũ làm mất cả danh sách)', () => {
  const r = kk.mapList(fx('vsphim', 'latest'), ctx('vsphim'));
  assert.equal(r.items.length, 24);
  assert.ok(r.items.every((c) => c.country.length === 1 && c.kind === 'single'));
});

test('kkphim: danh sách "mới cập nhật" thiếu trường vẫn dựng được thẻ, kind lấy từ tmdb', () => {
  const r = kk.mapList(fx('kkphim', 'latest'), ctx('kkphim'));
  assert.ok(r.items.some((c) => c.kind === 'series'));
  assert.ok(r.items.every((c) => c.quality === '' && c.lang === '' && c.country.length === 0));
});

test('vsmov: totalItemsPerPage dạng chuỗi và poster_url = {} không làm hỏng', () => {
  const raw = fx('vsmov', 'search');
  raw.items[0].poster_url = {};
  const r = kk.mapList(raw, ctx('vsmov'));
  assert.equal(r.items.length, raw.items.length);
  assert.equal(r.items[0].poster, r.items[0].cover); // rơi về thumb_url
});

test('phân trang: thiếu tổng số trang thì vẫn cho tải tiếp tới khi gặp trang rỗng', () => {
  assert.equal(toPage([{}], 1, 0).pagination.totalPages, 2);
  assert.equal(toPage([], 3, 0).pagination.totalPages, 3);
  assert.equal(toPage([{}], 1, 991).pagination.totalPages, 991);
});

// ---- chi tiết phim
test('kkphim: chi tiết phim bộ có m3u8 và thể loại', () => {
  const d = kk.mapDetail(fx('kkphim', 'detail'), ctx('kkphim'));
  assert.equal(d.isSeries, true);
  assert.deepEqual(d.genres, ['Hài Hước', 'Chính Kịch']);
  assert.deepEqual(d.genreSlugs, ['hai-huoc', 'chinh-kich']);
  assert.match(d.servers[0].episodes[0].m3u8, /\.m3u8/);
  assert.ok(d.servers[0].episodes.length > 1);
  assert.equal(d.time, ''); // " phút/tập" không có số → bỏ
});

test('vsmov: tên server sạch, chỉ có embed (không m3u8)', () => {
  const d = kk.mapDetail(fx('vsmov', 'detail'), ctx('vsmov'));
  assert.ok(d.servers.length >= 1);
  for (const s of d.servers) assert.doesNotMatch(s.name, /[\r\n]|\s{2,}/);
  const e = d.servers[0].episodes[0];
  assert.equal(e.m3u8, '');
  assert.match(e.embed, /^https?:\/\//);
  assert.equal(d.isSeries, true);
});

test('vsphim: phim lẻ, một server embed', () => {
  const d = kk.mapDetail(fx('vsphim', 'detail'), ctx('vsphim'));
  assert.equal(d.isSeries, false);
  assert.equal(d.kind, 'single');
  assert.equal(d.servers.length, 1);
  assert.match(d.servers[0].episodes[0].embed, /^https?:\/\//);
});

test('topxx: chi tiết lấy link embed từ sources cấp ngoài, thời lượng dạng mm:ss', () => {
  const raw = fx('topxx', 'detail');
  const d = tx.mapDetail(raw, ctx('topxx'));
  assert.equal(d.slug, raw.data.code);
  assert.equal(d.isSeries, false);
  assert.equal(d.servers[0].episodes[0].embed, raw.sources[0].link);
  assert.equal(d.servers[0].episodes[0].m3u8, '');
  assert.match(d.time, /^\d+:\d{2}(:\d{2})?$/);
  assert.ok(d.title && d.title !== d.slug, 'phải lấy tên từ trans[], không dùng code');
});

test('chi tiết không tồn tại → NotFound', () => {
  assert.throws(() => kk.mapDetail({ status: false }, ctx('kkphim')), NotFound);
  assert.throws(() => tx.mapDetail({ data: {} }, ctx('topxx')), NotFound);
});

test('topxx: định dạng thời lượng', () => {
  assert.equal(tx.fmtDuration('00:18:13'), '18:13');
  assert.equal(tx.fmtDuration('01:07:38'), '1:07:38');
  assert.equal(tx.fmtDuration('00:00:09'), '0:09');
  assert.equal(tx.fmtDuration(null), '');
});

// ---- facet / bộ lọc
test('kkphim: nhóm lọc lấy từ API (thể loại, quốc gia, năm)', () => {
  const groups = kk.mapFacets({ genre: fx('kkphim', 'genres'), country: fx('kkphim', 'countries'), year: fx('kkphim', 'years') }, {});
  assert.deepEqual(groups.map((g) => g.key), ['genre', 'country', 'year']);
  const year = groups[2];
  assert.equal(year.options[0].value, '2026');
  assert.ok(Number(year.options[0].value) > Number(year.options[1].value), 'năm phải giảm dần');
  assert.equal(year.searchable, false);
  assert.ok(groups[0].options.length >= 20);
});

test('vsmov: chỉ có thể loại và quốc gia (không có năm)', () => {
  const groups = kk.mapFacets({ genre: fx('vsmov', 'genres'), country: fx('vsmov', 'countries') }, {});
  assert.deepEqual(groups.map((g) => g.key), ['genre', 'country']);
});

test('vsphim: bỏ mục trống và thẻ SEO rác', () => {
  const g = kk.mapFacets({ country: fx('vsphim', 'countries') }, { cleanTags: true })[0];
  assert.ok(g.options.length > 0 && g.options.every((o) => o.value && o.label));
  const tags = kk.mapFacets({ genre: { data: { items: [
    { slug: '', name: '' }, { slug: 'a', name: '(Ngực nhỏ)' }, { slug: 'b', name: '1080P siêu nét' }, { slug: 'c', name: 'Hành Động' }, { slug: 'c', name: 'Hành Động' },
  ] } } }, { cleanTags: true })[0];
  assert.deepEqual(tags.options, [{ value: 'c', label: 'Hành Động' }]);
});

test('topxx: chỉ giữ thể loại/quốc gia có phim, nhiều phim nhất lên đầu', () => {
  const genres = fx('topxx', 'genres').data, countries = fx('topxx', 'countries').data;
  const groups = tx.mapFacets({ genres, countries });
  const want = (rows) => rows.filter((x) => x.movies_count > 0).sort((a, b) => b.movies_count - a.movies_count).map((x) => x.code);
  assert.deepEqual(groups.find((g) => g.key === 'genre').options.map((o) => o.value), want(genres));
  const c = groups.find((g) => g.key === 'country');
  assert.deepEqual(c.options.map((o) => o.value), want(countries));
  assert.equal(c.options[0].label.length > 0, true);
});

test('isNoise / uniqOptions', () => {
  assert.ok(isNoise('1080P') && isNoise('(abc)') && isNoise('x'.repeat(41)));
  assert.ok(!isNoise('Hành Động'));
  assert.deepEqual(uniqOptions([{ value: 'a', label: ' A ' }, { value: 'a', label: 'B' }, { value: '', label: 'C' }]), [{ value: 'a', label: 'A' }]);
});

// ---- đọc query + dựng đường dẫn
const q = (o) => (k) => o[k];

test('readQuery: KKPhim kết hợp được nhiều bộ lọc, bỏ loại lạ', () => {
  const S = source('kkphim');
  assert.deepEqual(readQuery(S, q({ feed: 'phim-le', genre: 'hanh-dong', country: 'han-quoc', year: '2023' })),
    { feed: 'phim-le', genre: 'hanh-dong', country: 'han-quoc', year: '2023' });
  assert.equal(readQuery(S, q({ feed: 'khong-co' })).feed, '');
});

test('readQuery: nguồn không kết hợp được chỉ giữ một giá trị; khoá không thuộc nguồn bị bỏ', () => {
  const T = source('topxx');
  assert.deepEqual(readQuery(T, q({ feed: 'today', genre: 'x' })), { feed: 'today', genre: '', country: '' });
  assert.deepEqual(readQuery(T, q({ genre: 'a', country: 'b', year: '2023' })), { feed: '', genre: 'a', country: '', });
  assert.equal(readQuery(source('vsphim'), q({ feed: 'phim-bo' })).feed, '', 'VSPhim không có loại');
});

function stub(status = 200, body = { items: [], pagination: {} }) {
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return { status, ok: status >= 200 && status < 300, json: async () => body }; };
  return calls;
}

test('đường dẫn: KKPhim loại > thể loại > quốc gia > năm, phần còn lại thành query', async () => {
  const calls = stub();
  const S = source('kkphim');
  await S.list(1, {});
  await S.list(2, listArgs({ feed: 'phim-le', genre: '', country: 'han-quoc', year: '2023' }));
  await S.list(1, listArgs({ feed: '', genre: 'hanh-dong', country: 'han-quoc', year: '' }));
  await S.list(1, listArgs({ feed: '', genre: '', country: '', year: '2023' }));
  await S.search('bat man', 3, 6);
  assert.deepEqual(calls, [
    'https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=1',
    'https://phimapi.com/v1/api/danh-sach/phim-le?page=2&country=han-quoc&year=2023',
    'https://phimapi.com/v1/api/the-loai/hanh-dong?page=1&country=han-quoc',
    'https://phimapi.com/v1/api/nam/2023?page=1',
    'https://phimapi.com/v1/api/tim-kiem?keyword=bat%20man&page=3&limit=6',
  ]);
});

test('đường dẫn: VSMov/VSPhim không gửi bộ lọc phụ; VSPhim bỏ qua loại', async () => {
  let calls = stub();
  await source('vsmov').list(1, listArgs({ feed: 'phim-bo', genre: '', country: '', year: '' }));
  await source('vsmov').list(1, listArgs({ feed: '', genre: 'hanh-dong', country: 'han-quoc', year: '' }));
  assert.deepEqual(calls, ['https://vsmov.com/api/danh-sach/phim-bo?page=1', 'https://vsmov.com/api/the-loai/hanh-dong?page=1']);
  calls = stub();
  await source('vsphim').list(1, { feed: 'phim-bo', filters: {} });
  assert.deepEqual(calls, ['https://nguon.vsphim.com/api/danh-sach/phim-moi-cap-nhat?page=1']);
});

test('đường dẫn: TOPXX hôm nay / thể loại / quốc gia / tìm kiếm bằng q', async () => {
  const calls = stub(200, { data: [], meta: {} });
  const T = source('topxx');
  await T.list(1, { feed: 'today' });
  await T.list(1, { filters: { genre: 'abc' } });
  await T.list(2, { filters: { country: 'jp' } });
  await T.search('bat man', 1);
  assert.deepEqual(calls, [
    'https://topxx.vip/api/v1/movies/today?page=1',
    'https://topxx.vip/api/v1/genres/abc/movies?page=1',
    'https://topxx.vip/api/v1/countries/jp/movies?page=2',
    'https://topxx.vip/api/v1/movies/search?q=bat%20man&page=1',
  ]);
});

test('404: danh sách coi như rỗng, chi tiết ném NotFound', async () => {
  stub(404);
  const r = await source('kkphim').list(1, { filters: { genre: 'khong-co' } });
  assert.deepEqual(r.items, []);
  await assert.rejects(() => source('vsmov').detail('x'), NotFound);
});
