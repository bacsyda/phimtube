// Nạp hls.js bằng thẻ <script> (CDN, pin version) để tránh lỗi ChunkLoadError của webpack dev
let hlsPromise;
export const loadHls = () => {
  if (typeof window !== 'undefined' && window.Hls) return Promise.resolve(window.Hls);
  hlsPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
    s.onload = () => resolve(window.Hls);
    s.onerror = () => { hlsPromise = null; reject(new Error('hls.js')); };
    document.head.appendChild(s);
  });
  return hlsPromise;
};

// ---- Nguồn phát chặn CORS: ghi nhớ máy chủ cần đi qua /api/hls ----
const KEY = 'phimtube-proxy-hosts';
let hosts;
const load = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY)) || []); } catch { return new Set(); } };
export const hostOf = (u) => { try { return new URL(u).host; } catch { return ''; } };
export const needsProxy = (u) => { hosts ||= load(); return hosts.has(hostOf(u)); };
export const markProxy = (u) => {
  hosts ||= load();
  hosts.add(hostOf(u));
  try { localStorage.setItem(KEY, JSON.stringify([...hosts])); } catch {}
};
// `source` = id nguồn phim, để proxy gửi đúng Referer của nguồn đó
export const viaProxy = (u, source) => (needsProxy(u) ? `/api/hls?u=${encodeURIComponent(u)}${source ? `&s=${source}` : ''}` : u);
