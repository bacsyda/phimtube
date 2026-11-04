// Adapter cho họ KKPhim: KKPhim, VSMov, VSPhim. Ba nguồn giống nhau về "vỏ" (items + pagination, movie + episodes)
// nhưng KHÁC nhau về độ đầy đủ và kiểu dữ liệu (đã đo bằng mẫu thật), nên mỗi nguồn có một mục CFG riêng
// khai báo đúng những gì nó có, và mọi trường ngoài khoá (slug, name) đều được coi là tùy chọn.
//
// Các hàm parse (mapList, mapDetail, mapFacets) là hàm thuần, không gọi mạng → test được bằng fixture.
import { SOURCES } from '../sources.js';
import { NotFound, str, clean, strip, int, makeImg, makeGet, toPage, warnOnce, uniqOptions, filterGroup, cached } from './common.js';

const feed = (id, label, icon) => ({ id, label, icon });

// Mỗi nguồn khai báo: đường dẫn đã xác minh, "bộ lọc nào có", và có kết hợp được nhiều bộ lọc không.
// combine=true : thể loại/quốc gia/năm gửi dạng query, kết hợp thoải mái (KKPhim đã kiểm chứng).
// combine=false: chỉ chọn được MỘT trong (loại, thể loại, quốc gia, năm) vì nguồn chưa kiểm chứng kết hợp.
const CFG = {
  kkphim: {
    latest: '/danh-sach/phim-moi-cap-nhat',
    feeds: [feed('phim-bo', 'Phim bộ', 'library'), feed('phim-le', 'Phim lẻ', 'movie'), feed('hoat-hinh', 'Hoạt hình', 'anime'), feed('tv-shows', 'TV Shows', 'tv')],
    feedPath: (f) => `/v1/api/danh-sach/${f}`,
    genrePath: (g) => `/v1/api/the-loai/${g}`,
    countryPath: (c) => `/v1/api/quoc-gia/${c}`,
    yearPath: (y) => `/v1/api/nam/${y}`,
    search: '/v1/api/tim-kiem',
    facets: { genre: '/the-loai', country: '/quoc-gia', year: '/nam-phat-hanh' },
    combine: true,
  },
  vsmov: {
    latest: '/danh-sach/phim-moi-cap-nhat',
    // Chỉ liệt kê loại đã có mẫu thật. Muốn thêm (phim-le, hoat-hinh...) thì chạy scripts/sample.mjs kiểm tra trước.
    feeds: [feed('phim-bo', 'Phim bộ', 'library'), feed('subteam', 'Subteam', 'playlist')],
    feedPath: (f) => `/danh-sach/${f}`,
    genrePath: (g) => `/the-loai/${g}`,
    countryPath: (c) => `/quoc-gia/${c}`,
    yearPath: null, // nguồn không có lọc theo năm
    search: '/tim-kiem',
    facets: { genre: '/the-loai', country: '/quoc-gia' },
    combine: false,
  },
  vsphim: {
    latest: '/danh-sach/phim-moi-cap-nhat',
    feeds: [], // không có lọc theo loại (/danh-sach/phim-bo... đều 404)
    feedPath: null,
    genrePath: (g) => `/the-loai/${g}`,
    countryPath: (c) => `/quoc-gia/${c}`,
    yearPath: null,
    search: '/tim-kiem',
    facets: { genre: '/the-loai', country: '/quoc-gia' },
    combine: false,
    cleanTags: true, // thể loại có hàng nghìn thẻ SEO rác, bỏ bớt
  },
};

// ---------------------------------------------------------------- parse (hàm thuần)

const names = (v) => {
  if (Array.isArray(v)) return v.map((x) => clean(typeof x === 'string' ? x : x?.name)).filter(Boolean);
  const s = clean(v); // VSPhim trả quốc gia ở danh sách dạng chuỗi "Nhật Bản" thay vì mảng
  return s ? [s] : [];
};
const slugsOf = (v) => (Array.isArray(v) ? v.map((x) => str(x?.slug)).filter(Boolean) : []);
const people = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);

// 'series' | 'single' | null (không rõ → UI không đoán, không hiện nhãn)
function kindOf(it, onlySingle) {
  if (onlySingle) return 'single';
  const t = str(it.type).toLowerCase();
  if (t === 'single' || t === 'series') return t;
  // 'hoathinh', 'tvshows'... không nói rõ bộ hay lẻ: nhìn chuỗi tập, rồi tới loại của TMDB
  if (/tập|episode|\d+\s*\/\s*\d+/i.test(str(it.episode_current))) return 'series';
  const tm = str(it.tmdb?.type).toLowerCase();
  if (tm === 'tv') return 'series';
  if (tm === 'movie') return 'single';
  return null;
}

export function mapCard(it, ctx, base = '') {
  const { id, img } = ctx;
  const kind = kindOf(it, ctx.onlySingle);
  return {
    src: id, slug: str(it.slug), title: clean(it.name), original: clean(it.origin_name), year: it.year || '',
    // thumb_url là ảnh ngang, poster_url là ảnh dọc
    cover: img(it.thumb_url, base) || img(it.poster_url, base),
    poster: img(it.poster_url, base) || img(it.thumb_url, base),
    country: names(it.country), // có thể rỗng: danh sách của KKPhim "mới cập nhật" và VSMov không trả quốc gia
    lang: clean(it.lang), quality: clean(it.quality), episode: clean(it.episode_current), duration: '',
    kind, isSeries: kind === 'series',
  };
}

// Danh sách có 2 kiểu response (ở gốc / bọc trong "data"), gộp về một
export function mapList(d, ctx) {
  const x = d?.data && typeof d.data === 'object' && !Array.isArray(d.data) ? d.data : d || {};
  const p = x.params?.pagination || x.pagination || d?.pagination || {};
  const base = x.pathImage || d?.pathImage || x.APP_DOMAIN_CDN_IMAGE || '';
  if (!Array.isArray(x.items)) warnOnce(ctx.id, 'response danh sách không có mảng items');
  const items = (Array.isArray(x.items) ? x.items : []).filter((it) => str(it?.slug) && clean(it?.name)).flatMap((it) => {
    try { return [mapCard(it, ctx, base)]; } catch (e) { console.error(`[${ctx.id}] bỏ qua phim lỗi dữ liệu: ${it.slug}`, e.message); return []; }
  });
  return toPage(items, int(p.currentPage) || 1, int(p.totalPages));
}

// Link phát: ưu tiên link_m3u8; không có thì lấy từ link embed (nhiều player nhúng m3u8 trong ?url=...)
function streamOf(e) {
  const direct = str(e.link_m3u8);
  if (direct) return direct;
  const emb = str(e.link_embed);
  if (/\.m3u8(\?|#|$)/i.test(emb)) return emb;
  try {
    const u = new URL(emb);
    for (const k of ['url', 'src', 'link', 'file', 'source']) {
      const v = u.searchParams.get(k);
      if (v && /^https?:\/\/[^ ]+\.m3u8/i.test(v)) return v;
    }
  } catch {}
  return '';
}

export function mapDetail(d, ctx) {
  if (!d?.status || !d?.movie) throw new NotFound();
  const m = d.movie;
  const servers = (Array.isArray(d.episodes) ? d.episodes : []).map((s, i) => ({
    name: clean(s?.server_name) || `Server ${i + 1}`, // VSMov trả "Vietsub\r\n    #1"
    episodes: (Array.isArray(s?.server_data) ? s.server_data : []).filter((e) => e && (str(e.slug) || str(e.name))).map((e) => ({
      name: clean(e.name), slug: str(e.slug) || clean(e.name).toLowerCase().replace(/\s+/g, '-'),
      m3u8: streamOf(e), embed: str(e.link_embed),
    })),
  })).filter((s) => s.episodes.length);

  const card = mapCard(m, ctx, d.pathImage || '');
  const many = (servers[0]?.episodes.length || 0) > 1;
  const isSeries = !ctx.onlySingle && (card.kind === 'series' || many);
  const t = clean(m.time);
  return {
    ...card,
    kind: isSeries ? 'series' : card.kind || 'single', isSeries,
    desc: strip(m.content),
    time: /\d/.test(t) ? t : '', // KKPhim đôi khi trả " phút/tập" không có số
    actors: people(m.actor), directors: people(m.director),
    genres: names(m.category), genreSlugs: slugsOf(m.category), countries: names(m.country),
    servers,
  };
}

const rows = (d) => {
  const a = Array.isArray(d) ? d : d?.data?.items ?? d?.items ?? d?.data;
  return Array.isArray(a) ? a : [];
};

// raw = { genre, country, year }: response thô của từng danh sách (nhóm nào nguồn không có thì không có khoá)
export function mapFacets(raw, cfg = {}) {
  const out = [];
  const tags = (d) => uniqOptions(rows(d).map((i) => ({ value: i?.slug, label: i?.name })), { noise: !!cfg.cleanTags });
  if (raw.genre) { const o = tags(raw.genre); if (o.length) out.push(filterGroup('genre', 'Thể loại', o)); }
  if (raw.country) { const o = tags(raw.country); if (o.length) out.push(filterGroup('country', 'Quốc gia', o)); }
  if (raw.year) {
    const o = uniqOptions(rows(raw.year).map((i) => ({ value: String(i?.year ?? ''), label: String(i?.year ?? '') })).filter((x) => /^\d{4}$/.test(x.value)));
    o.sort((a, b) => b.value - a.value);
    if (o.length) out.push(filterGroup('year', 'Năm', o, { searchable: false }));
  }
  return out;
}

// ---------------------------------------------------------------- adapter (có gọi mạng)

export function createKK(id) {
  const S = SOURCES[id];
  const cfg = CFG[id];
  const img = makeImg(S.img);
  const ctx = { id, img, onlySingle: S.kinds.length === 1 && S.kinds[0] === 'single' };
  const get = makeGet(id, S.api, { timeout: S.timeout });
  const enc = encodeURIComponent;

  async function list(page = 1, { feed: f = '', filters = {} } = {}) {
    const fd = cfg.feedPath && cfg.feeds.some((x) => x.id === f) ? f : '';
    const { genre = '', country = '', year = '' } = filters;
    // Đường dẫn chính: loại > thể loại > quốc gia > năm; phần còn lại (nếu nguồn cho kết hợp) gửi dạng query
    let main = null, used = '';
    if (fd) { main = cfg.feedPath(enc(fd)); }
    else if (genre) { main = cfg.genrePath(enc(genre)); used = 'genre'; }
    else if (country) { main = cfg.countryPath(enc(country)); used = 'country'; }
    else if (year && cfg.yearPath) { main = cfg.yearPath(enc(year)); used = 'year'; }

    const q = new URLSearchParams({ page });
    if (main && cfg.combine) {
      if (genre && used !== 'genre') q.set('category', genre);
      if (country && used !== 'country') q.set('country', country);
      if (year && used !== 'year') q.set('year', year);
    }
    try {
      return mapList(await get(`${main || cfg.latest}?${q}`), ctx);
    } catch (e) {
      if (e instanceof NotFound) return toPage([], page, 1); // mã lọc cũ / không còn: coi như rỗng
      throw e;
    }
  }

  const search = async (keyword, page = 1, limit = 24) =>
    mapList(await get(`${cfg.search}?keyword=${enc(keyword)}&page=${page}&limit=${limit}`), ctx);

  const detail = async (slug) => mapDetail(await get(`/phim/${enc(slug)}`), ctx);

  // Các nhóm lọc lấy từ chính API của nguồn (cache 1 giờ)
  const catalog = () => cached(`${id}:catalog`, async () => {
    const raw = {};
    let failed = false;
    await Promise.all(Object.entries(cfg.facets).map(async ([k, path]) => {
      try { raw[k] = await get(path, { revalidate: 3600 }); } catch (e) { failed = true; console.error(`[${id}] không lấy được danh sách ${k}:`, e?.message); }
    }));
    return { value: { filters: mapFacets(raw, cfg) }, ttl: failed ? 60e3 : 3600e3 };
  });

  return {
    id, img, kinds: S.kinds, feeds: cfg.feeds, filterKeys: Object.keys(cfg.facets), exclusive: !cfg.combine,
    list, search, detail, catalog,
  };
}
