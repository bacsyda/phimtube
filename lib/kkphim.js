// Adapter phim: chuyển dữ liệu API (schema KKPhim) về dạng gọn cho giao diện.
// Một factory dùng chung cho mọi nguồn trong lib/sources.js: source('vsmov').list(...)
import { SOURCES, srcId } from './sources';

// Phim không tồn tại (khác với lỗi mạng / nguồn sập)
export class NotFound extends Error {}

export const CATS = [
  ['', 'Tất cả', 'home'], ['phim-bo', 'Phim bộ', 'library'], ['phim-le', 'Phim lẻ', 'movie'],
  ['hoat-hinh', 'Hoạt hình', 'anime'], ['tv-shows', 'TV Shows', 'tv'],
];

const TYPES = ['phim-bo', 'phim-le', 'hoat-hinh', 'tv-shows'];
const TIMEOUT = 12000; // nguồn treo thì báo lỗi thay vì chờ mãi

// Danh sách thể loại / quốc gia cho bộ lọc
const arr = (d) => {
  const a = Array.isArray(d) ? d : d?.data?.items || d?.items || d?.data;
  return Array.isArray(a) ? a : [];
};

function create(id) {
  const { api: BASE, img: IMG } = SOURCES[id];

  // Một số nguồn trả {} hoặc null thay vì chuỗi (vd VSMov có phim poster_url = {}), nên chỉ nhận chuỗi
  // base: tiền tố ảnh do chính response trả về (pathImage); không có thì dùng cấu hình của nguồn
  const img = (p, base = '') => {
    if (typeof p !== 'string' || !(p = p.trim())) return '';
    if (/^https?:\/\//i.test(p)) return p;
    if (p.startsWith('//')) return 'https:' + p;
    const b = typeof base === 'string' && /^https?:\/\//i.test(base) ? base.replace(/\/*$/, '/') : `${IMG}/`;
    return b + p.replace(/^\/+/, '');
  };

  async function get(path) {
    let r;
    try {
      r = await fetch(BASE + path, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT),
        next: { revalidate: 600 }, // cache 10 phút
      });
    } catch (e) {
      console.error(`[${id}] không kết nối được ${BASE + path}:`, e?.cause?.code || e?.name || e?.message);
      throw e;
    }
    if (r.status === 404) throw new NotFound();
    if (!r.ok) {
      console.error(`[${id}] HTTP ${r.status} ${BASE + path}`);
      throw new Error(`${id} ${r.status}`);
    }
    return r.json();
  }

  // Mỗi nguồn có thể đặt endpoint khác nhau (/v1/api/... hay không có tiền tố): thử lần lượt,
  // nhớ đường nào chạy được để các lần sau không phải thử lại đường hỏng.
  const worked = new Map();
  async function getAny(paths) {
    const key = paths[0].split('?')[0]; // khoá theo đường dẫn, không tính ?page=...
    const first = worked.get(key) ?? 0;
    const order = [paths[first], ...paths.filter((_, i) => i !== first)];
    let err;
    for (const p of order) {
      try {
        const d = await get(p);
        worked.set(key, paths.indexOf(p));
        return d;
      } catch (e) { err = e; }
    }
    throw err;
  }
  const both = (p) => [`/v1/api${p}`, p];

  // Link phát: ưu tiên link_m3u8; không có thì lấy từ link embed (nhiều player nhúng m3u8 trong ?url=...)
  const streamOf = (e) => {
    const direct = typeof e.link_m3u8 === 'string' ? e.link_m3u8.trim() : '';
    if (direct) return direct;
    const emb = typeof e.link_embed === 'string' ? e.link_embed.trim() : '';
    if (/\.m3u8(\?|#|$)/i.test(emb)) return emb;
    try {
      const u = new URL(emb);
      for (const k of ['url', 'src', 'link', 'file', 'source']) {
        const v = u.searchParams.get(k);
        if (v && /^https?:\/\/[^ ]+\.m3u8/i.test(v)) return v;
      }
    } catch {}
    return '';
  };

  function card(it, base = '') {
    const str = (v) => (typeof v === 'string' ? v : '');
    const ep = str(it.episode_current);
    return {
      src: id, slug: it.slug, title: it.name, original: it.origin_name, year: it.year,
      // thumb_url là ảnh ngang, poster_url là ảnh dọc
      cover: img(it.thumb_url, base) || img(it.poster_url, base),
      poster: img(it.poster_url, base) || img(it.thumb_url, base),
      country: (it.country || []).map((c) => c.name),
      catSlugs: (it.category || []).map((c) => c.slug),
      countrySlugs: (it.country || []).map((c) => c.slug),
      lang: str(it.lang), quality: str(it.quality), episode: ep,
      isSeries: it.type === 'series' || it.tmdb?.type === 'tv' || /tập|episode/i.test(ep),
    };
  }

  // Danh sách có 2 kiểu response (ở gốc / bọc trong "data"), gộp về một
  function unwrap(d) {
    const x = d.data || d;
    const p = x.params?.pagination || x.pagination || {};
    const base = x.pathImage || d.pathImage || '';
    return {
      // Bỏ qua từng phim lỗi dữ liệu thay vì làm hỏng cả danh sách
      items: (x.items || []).filter((it) => it?.slug).flatMap((it) => {
        try { return [card(it, base)]; } catch (e) { console.error(`[${id}] bỏ qua phim lỗi dữ liệu: ${it.slug}`, e.message); return []; }
      }),
      pagination: { page: p.currentPage || 1, totalPages: p.totalPages || 1 },
    };
  }

  // Bộ lọc: loại > thể loại > quốc gia làm đường dẫn chính, phần còn lại gửi dạng query.
  // Sau đó lọc lại phía server để kết quả vẫn đúng nếu API bỏ qua tham số.
  async function list(page = 1, f = {}) {
    const { type = '', category = '', country = '', year = '' } = f;
    if (!type && !category && !country && !year) return unwrap(await get(`/danh-sach/phim-moi-cap-nhat?page=${page}`));

    const q = new URLSearchParams({ page });
    if (category && type) q.set('category', category);
    if (country && (type || category)) q.set('country', country);
    if (year) q.set('year', year);
    const one = async (p) => unwrap(await getAny(both(p).map((u) => `${u}?${q}`)));

    let res;
    if (type) res = await one(`/danh-sach/${type}`);
    else if (category) res = await one(`/the-loai/${category}`);
    else if (country) res = await one(`/quoc-gia/${country}`);
    else {
      // Chỉ chọn năm: gộp cả 4 loại phim
      const empty = { items: [], pagination: { page, totalPages: 1 } };
      const rs = await Promise.all(TYPES.map((t) => one(`/danh-sach/${t}`).catch(() => empty)));
      res = { items: rs.flatMap((r) => r.items), pagination: { page, totalPages: Math.max(...rs.map((r) => r.pagination.totalPages)) } };
    }
    const ok = (x) =>
      (!category || !x.catSlugs.length || x.catSlugs.includes(category)) &&
      (!country || !x.countrySlugs.length || x.countrySlugs.includes(country)) &&
      (!year || !x.year || String(x.year) === String(year));
    return { ...res, items: res.items.filter(ok) };
  }

  const search = async (keyword, page = 1, limit = 24) =>
    unwrap(await getAny(both('/tim-kiem').map((u) => `${u}?keyword=${encodeURIComponent(keyword)}&page=${page}&limit=${limit}`)));

  async function detail(slug) {
    const d = await get(`/phim/${encodeURIComponent(slug)}`);
    if (!d.status || !d.movie) throw new NotFound();
    const m = d.movie;
    const servers = (d.episodes || []).map((s) => ({
      name: s.server_name,
      episodes: (s.server_data || []).map((e) => ({
        name: e.name, slug: e.slug, m3u8: streamOf(e), embed: typeof e.link_embed === 'string' ? e.link_embed.trim() : '',
      })),
    }));
    return {
      ...card(m, d.pathImage || ''),
      isSeries: m.type === 'series' || (servers[0]?.episodes.length || 0) > 1,
      desc: (m.content || '').replace(/<[^>]*>/g, '').trim(),
      time: m.time || '',
      actors: m.actor || [], directors: m.director || [],
      genres: (m.category || []).map((c) => c.name),
      genreSlugs: (m.category || []).map((c) => c.slug),
      countries: (m.country || []).map((c) => c.name),
      servers,
    };
  }

  async function facets() {
    try {
      const [g, c] = await Promise.all([getAny(both('/the-loai')), getAny(both('/quoc-gia'))]);
      const f = (x) => [...new Map(arr(x).filter((i) => i?.slug && i?.name?.trim()).map((i) => [i.slug, { name: i.name.trim(), slug: i.slug }])).values()];
      return { genres: f(g), countries: f(c) };
    } catch (e) {
      console.error(`[${id}] không lấy được danh sách thể loại / quốc gia:`, e?.message);
      return { genres: [], countries: [] };
    }
  }

  return { id, img, list, search, detail, facets };
}

const made = new Map();
// Lấy adapter của một nguồn (id lạ / thiếu thì dùng nguồn mặc định)
export function source(id) {
  const k = srcId(id);
  if (!made.has(k)) made.set(k, create(k));
  return made.get(k);
}
