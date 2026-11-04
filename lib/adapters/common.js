// Phần dùng chung của các adapter: kiểu lỗi, làm sạch chuỗi, ghép URL ảnh, gọi API, bộ nhớ đệm.
// Mọi adapter trả về cùng một "mô hình chuẩn" (xem docs ở đầu README mục "Mô hình dữ liệu").

// Phim không tồn tại (khác với lỗi mạng / nguồn sập)
export class NotFound extends Error {}

export const str = (v) => (typeof v === 'string' ? v.trim() : '');
export const clean = (v) => str(v).replace(/\s+/g, ' '); // gộp khoảng trắng, xuống dòng
export const strip = (html) => str(html).replace(/<[^>]*>/g, '').trim();
export const int = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : 0; }; // "5" -> 5

// Cảnh báo một lần cho mỗi (nguồn, nội dung) để log không bị ngập
const warned = new Set();
export function warnOnce(src, what) {
  const k = `${src}|${what}`;
  if (warned.has(k)) return;
  warned.add(k);
  console.warn(`[${src}] ${what}`);
}

// Một số nguồn trả {} hoặc null thay vì chuỗi (vd VSMov có phim poster_url = {}), nên chỉ nhận chuỗi.
// `base` là tiền tố ảnh do chính response trả về; không có thì dùng địa chỉ ảnh trong cấu hình nguồn.
export function makeImg(IMG) {
  return (p, base = '') => {
    if (typeof p !== 'string' || !(p = p.trim())) return '';
    if (/^https?:\/\//i.test(p)) return p;
    if (p.startsWith('//')) return 'https:' + p;
    const b = typeof base === 'string' && /^https?:\/\//i.test(base) ? base.replace(/\/*$/, '/') : `${IMG}/`;
    return b + p.replace(/^\/+/, '');
  };
}

// Trang kết quả chuẩn. Nguồn không trả tổng số trang thì coi như còn trang sau cho tới khi gặp trang rỗng,
// để cuộn vô hạn không dừng sớm.
export function toPage(items, page, totalPages) {
  const p = page > 0 ? page : 1;
  return { items, pagination: { page: p, totalPages: totalPages > 0 ? totalPages : items.length ? p + 1 : p } };
}

// Tên thể loại/quốc gia kiểu thẻ SEO rác (bắt đầu bằng số/ký tự lạ, quá dài) — dùng cho nguồn có facet bẩn
export const isNoise = (name) => name.length > 40 || !/^\p{L}/u.test(name);

// Bỏ mục trống, trùng; giữ thứ tự gốc
export function uniqOptions(list, { noise = false } = {}) {
  const seen = new Set();
  const out = [];
  for (const o of list) {
    const value = str(o?.value), label = clean(o?.label);
    if (!value || !label || seen.has(value) || (noise && isNoise(label))) continue;
    seen.add(value);
    out.push({ value, label });
  }
  return out;
}

// Một nhóm lọc cho FilterBar. Nhóm dài thì cho phép tìm trong nhóm.
export const filterGroup = (key, label, options, { searchable } = {}) =>
  ({ key, label, options, searchable: searchable ?? options.length > 40 });

// Bộ nhớ đệm trong tiến trình: fn trả { value, ttl } (ttl mili giây) để lần lỗi một phần chỉ nhớ ngắn
const memo = new Map();
export async function cached(key, fn) {
  const hit = memo.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const { value, ttl } = await fn();
  memo.set(key, { value, until: Date.now() + ttl });
  return value;
}

// Gọi API JSON: timeout, cache của Next, 404 -> NotFound, lỗi khác -> Error (kèm log rõ nguồn nào, URL nào)
export function makeGet(id, BASE, { timeout = 12000, revalidate = 600, headers = {} } = {}) {
  return async function get(path, opt = {}) {
    let r;
    try {
      r = await fetch(BASE + path, {
        headers: { Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(timeout),
        next: { revalidate: opt.revalidate ?? revalidate },
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
  };
}
