import dns from 'node:dns/promises';
import net from 'node:net';
import { SOURCES, srcId } from '@/lib/sources';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_REDIRECTS = 5;
const MAX_PLAYLIST = 2 * 1024 * 1024; // m3u8 lớn hơn mức này là bất thường
const CONNECT_TIMEOUT = 15000; // chờ nguồn phản hồi (không tính thời gian tải phân đoạn)
const RATE = Number(process.env.HLS_RATE_LIMIT || 600); // số yêu cầu / phút / IP

// (Tuỳ chọn) chỉ cho phép proxy tới các host này, vd: HLS_ALLOWED_HOSTS=cdn1.example.com,example.net
// Mục khớp chính xác host hoặc mọi tên miền con của nó.
const ALLOWED = (process.env.HLS_ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

// Bảo mật cho mọi phản hồi: không cho trình duyệt đoán kiểu nội dung, và có chạy HTML cũng bị cô lập (sandbox)
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox' };
const text = (msg, status = 400) =>
  new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SEC } });

class Bad extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

// ---- Chặn địa chỉ nội bộ / dành riêng (IPv4 + IPv6) ----
function privateV4(ip) {
  const [a, b, c] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, metadata cloud
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
function privateV6(ip) {
  const x = ip.toLowerCase();
  const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4 nhúng trong IPv6
  if (mapped) return privateV4(mapped[1]);
  return (
    x === '::' || x === '::1' || x.startsWith('::ffff:') || x.startsWith('64:ff9b:') ||
    /^f[cd]/.test(x) || // fc00::/7
    /^fe[89ab]/.test(x) || // fe80::/10
    x.startsWith('ff') // multicast
  );
}
const ipBlocked = (ip) => {
  const v = net.isIP(ip);
  return v === 4 ? privateV4(ip) : v === 6 ? privateV6(ip) : true;
};

// Kiểm tra từng địa chỉ (kể cả sau mỗi lần chuyển hướng): giao thức, host, và IP thật sau khi phân giải DNS
async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol)) throw new Bad('Giao thức không được phép');
  if (u.username || u.password) throw new Bad('URL không được phép');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Bad('URL không được phép');
  }
  if (ALLOWED.length && !ALLOWED.some((a) => host === a || host.endsWith('.' + a))) throw new Bad('Máy chủ nguồn không nằm trong danh sách cho phép', 403);
  if (net.isIP(host)) {
    if (ipBlocked(host)) throw new Bad('URL không được phép');
    return;
  }
  let addrs;
  try { addrs = await dns.lookup(host, { all: true, verbatim: true }); } catch { throw new Bad('Không phân giải được tên miền nguồn', 502); }
  if (!addrs.length || addrs.some((a) => ipBlocked(a.address))) throw new Bad('URL không được phép');
}

// fetch tự theo dõi chuyển hướng để kiểm tra lại từng chặng (redirect: 'follow' sẽ bỏ qua bước này)
async function fetchSafe(start, headers) {
  let u = start;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublic(u);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), CONNECT_TIMEOUT);
    let res;
    try {
      res = await fetch(u, { headers, redirect: 'manual', cache: 'no-store', signal: ctl.signal });
    } finally {
      clearTimeout(timer);
    }
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      res.body?.cancel().catch(() => {});
      try { u = new URL(loc, u); } catch { throw new Bad('Chuyển hướng không hợp lệ', 502); }
      continue;
    }
    return { res, url: u };
  }
  throw new Bad('Quá nhiều lần chuyển hướng', 502);
}

// ---- Chỉ nhận yêu cầu từ chính trang này, và giới hạn tốc độ theo IP ----
function sameSite(req) {
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  const ref = req.headers.get('origin') || req.headers.get('referer'); // trình duyệt cũ chưa có Sec-Fetch-Site
  if (!ref) return false;
  try { return new URL(ref).host === req.headers.get('host'); } catch { return false; }
}
const hits = new Map(); // ip -> { n, reset }
function limited(req) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  let h = hits.get(ip);
  if (!h || now > h.reset) { h = { n: 0, reset: now + 60000 }; hits.set(ip, h); }
  return ++h.n > RATE;
}

// `s` = id nguồn phim, được giữ lại ở mọi đường dẫn con để chặng sau vẫn gửi đúng Referer
const prox = (abs, s) => `/api/hls?u=${encodeURIComponent(abs)}${s ? `&s=${s}` : ''}`;
const toProxy = (u, base, s) => {
  try {
    const x = new URL(u, base);
    return /^https?:$/.test(x.protocol) ? prox(x.href, s) : null; // giữ nguyên data:, skd:...
  } catch { return null; }
};

// Viết lại mọi đường dẫn trong m3u8 (phân đoạn, khoá, danh sách con) để cũng đi qua proxy này
function rewrite(body, base, s) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (m, u) => { const p = toProxy(u, base, s); return p ? `URI="${p}"` : m; });
      return toProxy(t, base, s) || line;
    })
    .join('\n');
}

// Máy chủ trung gian: lấy video thay trình duyệt để tránh lỗi CORS của nguồn phát
export async function GET(req) {
  if (!sameSite(req)) return text('Chỉ phục vụ yêu cầu từ chính trang này', 403);
  if (limited(req)) return text('Quá nhiều yêu cầu, thử lại sau ít phút', 429);

  let target;
  try { target = new URL(new URL(req.url).searchParams.get('u') || ''); } catch { return text('URL không hợp lệ', 400); }

  // Nguồn phim (chỉ nhận id có trong registry); Referer lấy từ cấu hình, không nhận từ người dùng
  const sp = new URL(req.url).searchParams.get('s');
  const sid = sp ? srcId(sp) : '';
  const headers = { 'User-Agent': UA, Accept: '*/*' };
  if (sid && SOURCES[sid].referer) headers.Referer = SOURCES[sid].referer;
  const range = req.headers.get('range');
  if (range) headers.Range = range;

  let hop;
  try {
    hop = await fetchSafe(target, headers);
  } catch (e) {
    if (e instanceof Bad) return text(e.message, e.status);
    return text('Không kết nối được tới nguồn video', 502);
  }
  const { res: up, url: finalUrl } = hop;
  if (!up.ok) { up.body?.cancel().catch(() => {}); return text('Nguồn video trả lỗi ' + up.status, up.status); }

  const type = up.headers.get('content-type') || '';
  // Không phục vụ trang web / SVG qua domain của mình (tránh bị lợi dụng để chạy script)
  if (/html|svg/i.test(type)) { up.body?.cancel().catch(() => {}); return text('Nguồn trả về nội dung không phải video', 502); }

  if (/mpegurl/i.test(type) || /\.m3u8$/i.test(finalUrl.pathname)) {
    if (Number(up.headers.get('content-length') || 0) > MAX_PLAYLIST) { up.body?.cancel().catch(() => {}); return text('Danh sách phát quá lớn', 502); }
    const body = await up.text();
    if (body.length > MAX_PLAYLIST || !body.trimStart().startsWith('#EXTM3U')) return text('Nguồn trả về danh sách phát không hợp lệ', 502);
    return new Response(rewrite(body, finalUrl.href, sid), {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store', ...SEC },
    });
  }

  // Phân đoạn video / khoá: chuyển tiếp nguyên dạng (có hỗ trợ Range)
  const out = new Headers(SEC);
  for (const h of ['content-type', 'content-range', 'accept-ranges']) {
    if (up.headers.get(h)) out.set(h, up.headers.get(h));
  }
  return new Response(up.body, { status: up.status, headers: out });
}
