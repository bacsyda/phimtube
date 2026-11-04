import { DEFAULT_SOURCE } from './sources';

// Mọi khoá lưu theo "nguồn:slug", vì cùng slug ở hai nguồn có thể có tập khác nhau.
// Lịch sử xem trong localStorage: { [nguồn:slug]: { ep, t, eps: { [epSlug]: 0..1 }, at, m } }
// Dữ liệu cũ (khoá chỉ có slug) tự được hiểu là của KKPhim khi đọc.
// Mọi lần đọc/ghi đi qua một bộ nhớ đệm trong module, để hàng chục thẻ phim
// không phải parse lại cùng một chuỗi JSON mỗi lần hiển thị.
const K = 'phimtube-history';
const LATER = 'phimtube-later';
const HIDDEN = 'phimtube-hidden';

export const movieKey = (src, slug) => `${src || DEFAULT_SOURCE}:${slug}`;
const mk = (m) => movieKey(m.src, m.slug);

const cache = new Map(); // khoá localStorage -> giá trị đã parse (và đã chuyển đổi)
let hiddenSet = null;

if (typeof window !== 'undefined') {
  // Tab khác đổi dữ liệu thì bỏ cache để lần đọc sau lấy bản mới
  window.addEventListener('storage', (e) => {
    if (e.key === null) cache.clear(); else cache.delete(e.key);
    hiddenSet = null;
  });
}

// ---- Chuyển dữ liệu cũ (chưa có nguồn) sang khoá "kkphim:slug" ----
const fixHistory = (h) => {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return {};
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    out[k.includes(':') ? k : movieKey(DEFAULT_SOURCE, k)] = v?.m && !v.m.src ? { ...v, m: { ...v.m, src: DEFAULT_SOURCE } } : v;
  }
  return out;
};
const fixLater = (l) => (Array.isArray(l) ? l.filter((x) => x?.slug).map((x) => (x.src ? x : { ...x, src: DEFAULT_SOURCE })) : []);
const fixHidden = (l) => (Array.isArray(l) ? l.filter((s) => typeof s === 'string').map((s) => (s.includes(':') ? s : movieKey(DEFAULT_SOURCE, s))) : []);

const read = (k, fallback, fix) => {
  if (cache.has(k)) return cache.get(k);
  let v = null;
  try { v = JSON.parse(localStorage.getItem(k)); } catch {}
  v = v == null ? fallback() : fix(v);
  cache.set(k, v);
  return v;
};
const write = (k, v) => {
  cache.set(k, v);
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
};

export const getHistory = () => read(K, () => ({}), fixHistory);
export const getProgress = (m) => getHistory()[mk(m)];

// meta: thông tin phim ({ src, slug, title, cover, ... }), cũng dùng để hiện ở trang Video đã xem
export function saveProgress(meta, ep, t, d, nextEp) {
  try {
    const h = { ...getHistory() };
    const key = mk(meta);
    const prev = h[key] || {};
    const frac = d ? Math.min(t / d, 1) : 0;
    const eps = { ...prev.eps, [ep]: frac };
    // Xem gần hết tập thì lần sau mở thẳng tập kế tiếp
    h[key] = frac > 0.95 && nextEp ? { ep: nextEp, t: 0, eps, at: Date.now(), m: meta } : { ep, t, eps, at: Date.now(), m: meta };
    write(K, h);
  } catch {}
}

// Không truyền src = xóa hết; truyền src = chỉ xóa lịch sử của nguồn đó
export function clearHistory(src) {
  if (!src) {
    cache.set(K, {});
    try { localStorage.removeItem(K); } catch {}
    return;
  }
  const keep = {};
  for (const [k, v] of Object.entries(getHistory())) if (!k.startsWith(`${src}:`)) keep[k] = v;
  write(K, keep);
}

// ---- Danh sách Xem sau + phim đã ẩn ("Không quan tâm") ----
export const getLater = () => read(LATER, () => [], fixLater);
export const isLater = (m) => getLater().some((x) => mk(x) === mk(m));
export function toggleLater(m) {
  const l = getLater();
  const has = isLater(m);
  write(LATER, has ? l.filter((x) => mk(x) !== mk(m)) : [{ ...m, src: m.src || DEFAULT_SOURCE }, ...l]);
  window.dispatchEvent(new Event('phimtube-later'));
  return !has;
}

export const getHidden = () => read(HIDDEN, () => [], fixHidden);
export const isHidden = (m) => (hiddenSet ||= new Set(getHidden())).has(mk(m));
export function setHidden(m, on) {
  const key = mk(m);
  const h = getHidden().filter((s) => s !== key);
  write(HIDDEN, on ? [...h, key] : h);
  hiddenSet = null;
}
