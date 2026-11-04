// Adapter TOPXX (https://topxx.vip/api/v1). Schema khác hẳn họ KKPhim (đã đo bằng mẫu thật):
//   - mã phim là `code` (không có slug phim); tên/mô tả nằm trong `trans[]` theo locale
//   - phân trang kiểu Laravel: { data: [...], meta: { current_page, last_page }, links }
//   - chỉ có phim lẻ, chỉ có link embed (không m3u8, không tập); link có token nằm ở `sources` cấp ngoài của /movies/{code}
//   - tìm kiếm dùng tham số `q` (keyword/query/s/name đều trả 422)
//   - danh sách thể loại có ~1.300 mục chia 50/trang, gần hết `movies_count = 0`
// Các hàm parse là hàm thuần để test bằng fixture.
import { SOURCES } from '../sources.js';
import { NotFound, str, clean, strip, int, makeImg, makeGet, toPage, uniqOptions, filterGroup, cached } from './common.js';

const FEEDS = [{ id: 'today', label: 'Hôm nay', icon: 'tv' }];

// Bản dịch ưu tiên tiếng Việt → tiếng Anh → bản đầu tiên. Thẻ phim dùng `trans`, danh sách facet dùng `translations`.
const tr = (x) => {
  const a = Array.isArray(x?.trans) ? x.trans : Array.isArray(x?.translations) ? x.translations : [];
  return a.find((t) => t?.locale === 'vi') || a.find((t) => t?.locale === 'en') || a[0] || {};
};
const namesOf = (v) => (Array.isArray(v) ? v.map((x) => clean(tr(x).name)).filter(Boolean) : []);

// "00:18:13" -> "18:13", "01:07:38" -> "1:07:38"
export function fmtDuration(s) {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(str(s));
  if (!m) return '';
  const h = Number(m[1]);
  return h ? `${h}:${m[2]}:${m[3]}` : `${Number(m[2])}:${m[3]}`;
}

export function mapCard(it, ctx) {
  const t = tr(it);
  const code = str(it.code);
  const { img } = ctx;
  return {
    src: ctx.id, slug: code, title: clean(t.title) || code, original: '', year: '', // nguồn không có năm phát hành
    cover: img(it.thumbnail) || img(it.poster) || img(it.backdrop),
    poster: img(it.poster) || img(it.thumbnail) || img(it.backdrop),
    country: namesOf(it.countries),
    lang: '', quality: clean(it.quality), episode: '', duration: fmtDuration(it.duration),
    kind: 'single', isSeries: false,
  };
}

export function mapList(d, ctx) {
  const meta = d?.meta || {};
  const items = (Array.isArray(d?.data) ? d.data : []).filter((it) => str(it?.code)).flatMap((it) => {
    try { return [mapCard(it, ctx)]; } catch (e) { console.error(`[${ctx.id}] bỏ qua phim lỗi dữ liệu: ${it.code}`, e.message); return []; }
  });
  return toPage(items, int(meta.current_page) || 1, int(meta.last_page));
}

const isHls = (s) => s?.type === 'm3u8' || s?.type === 'hls' || /\.m3u8(\?|#|$)/i.test(str(s?.link));

export function mapDetail(d, ctx) {
  const m = d?.data;
  if (!str(m?.code)) throw new NotFound();
  // `sources` cấp ngoài mang token của đúng lần gọi này nên ưu tiên hơn `data.sources`
  const outer = Array.isArray(d.sources) ? d.sources : [];
  const inner = Array.isArray(m.sources) ? m.sources : [];
  const links = (outer.length ? outer : inner).filter((s) => str(s?.link));
  const servers = links.length
    ? [{ name: 'Phim', episodes: links.map((s, i) => ({
        name: links.length > 1 ? `Link ${i + 1}` : 'Full', slug: links.length > 1 ? `link-${i + 1}` : 'full',
        m3u8: isHls(s) ? str(s.link) : '', embed: isHls(s) ? '' : str(s.link),
      })) }]
    : [];
  const t = tr(m);
  const card = mapCard(m, ctx);
  return {
    ...card,
    desc: strip(t.content) || strip(t.description),
    time: card.duration,
    actors: namesOf(m.actors), directors: [],
    genres: namesOf(m.genres), genreSlugs: (m.genres || []).map((g) => str(g?.code)).filter(Boolean),
    countries: card.country,
    servers,
  };
}

// Chỉ giữ mục có phim (movies_count > 0), nhiều phim nhất lên đầu
const withMovies = (rows) =>
  rows.filter((x) => str(x?.code) && Number(x.movies_count) > 0 && clean(tr(x).name))
    .sort((a, b) => b.movies_count - a.movies_count)
    .map((x) => ({ value: str(x.code), label: clean(tr(x).name) }));

export function mapFacets({ genres = [], countries = [] }) {
  const out = [];
  const g = uniqOptions(withMovies(genres));
  const c = uniqOptions(withMovies(countries));
  if (g.length) out.push(filterGroup('genre', 'Thể loại', g));
  if (c.length) out.push(filterGroup('country', 'Quốc gia', c));
  return out;
}

export function createTopxx(id) {
  const S = SOURCES[id];
  const img = makeImg(S.img);
  const ctx = { id, img };
  // Khoá tài khoản (tuỳ chọn, chỉ dùng phía máy chủ) giúp gắn mã tài khoản vào link embed
  const headers = {};
  if (process.env.TOPXX_API_KEY) headers['X-API-Key'] = process.env.TOPXX_API_KEY;
  if (process.env.TOPXX_API_SECRET) headers['X-API-Secret'] = process.env.TOPXX_API_SECRET;
  const get = makeGet(id, S.api, { timeout: S.timeout, headers });
  const enc = encodeURIComponent;

  async function list(page = 1, { feed = '', filters = {} } = {}) {
    const { genre = '', country = '' } = filters;
    // Thứ tự ưu tiên: hôm nay > thể loại > quốc gia; nguồn không kết hợp được các bộ lọc
    const path = feed === 'today' ? '/movies/today'
      : genre ? `/genres/${enc(genre)}/movies`
      : country ? `/countries/${enc(country)}/movies`
      : '/movies/latest';
    try {
      return mapList(await get(`${path}?page=${page}`), ctx);
    } catch (e) {
      if (e instanceof NotFound) return toPage([], page, 1);
      throw e;
    }
  }

  // `limit` không được nguồn hỗ trợ nên bỏ qua (nơi gọi tự cắt bớt)
  const search = async (keyword, page = 1) =>
    mapList(await get(`/movies/search?q=${enc(keyword)}&page=${page}`), ctx);

  // Link embed mang token riêng cho từng lần gọi nên không cache chi tiết phim
  const detail = async (code) => mapDetail(await get(`/movies/${enc(code)}`, { revalidate: 0 }), ctx);

  // Thể loại chia nhiều trang (50/trang): lấy trang 1 để biết tổng số trang, rồi lấy phần còn lại song song có giới hạn
  async function allPages(path) {
    const first = await get(`${path}?page=1`, { revalidate: 3600 });
    const rows = [...(Array.isArray(first?.data) ? first.data : [])];
    const last = Math.min(int(first?.meta?.last_page) || 1, 60);
    let failed = false;
    const pages = Array.from({ length: Math.max(0, last - 1) }, (_, i) => i + 2);
    for (let i = 0; i < pages.length; i += 6) {
      const got = await Promise.all(pages.slice(i, i + 6).map((p) => get(`${path}?page=${p}`, { revalidate: 3600 }).catch((e) => { failed = true; console.error(`[${id}] ${path} trang ${p}:`, e?.message); return null; })));
      for (const g of got) if (Array.isArray(g?.data)) rows.push(...g.data);
    }
    return { rows, failed };
  }

  const catalog = () => cached(`${id}:catalog`, async () => {
    let failed = false;
    const one = async (path) => {
      try { const r = await allPages(path); failed ||= r.failed; return r.rows; } catch (e) { failed = true; console.error(`[${id}] không lấy được ${path}:`, e?.message); return []; }
    };
    const [genres, countries] = await Promise.all([one('/genres'), one('/countries')]);
    return { value: { filters: mapFacets({ genres, countries }) }, ttl: failed ? 60e3 : 3600e3 };
  });

  return { id, img, kinds: S.kinds, feeds: FEEDS, filterKeys: ['genre', 'country'], exclusive: true, list, search, detail, catalog };
}
