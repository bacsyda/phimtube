'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getProgress, isHidden, setHidden } from '@/lib/history';
import { watchHref } from '@/lib/util';
import { SOURCES, srcId } from '@/lib/sources';
import { loadHls, viaProxy, needsProxy, markProxy } from '@/lib/hls';
import { watchCard } from '@/lib/autoplay';
import Icon from './Icon';
import CardMenu from './CardMenu';

const previewCache = new Map(); // slug -> link m3u8 xem trước
// Xem trước = "tóm tắt": nhiều đoạn ngắn rải đều trong phim (chỉnh số đoạn / độ dài mỗi đoạn tại đây)
const PREVIEW = { clips: 6, len: 2.5 };

// showSource: hiện tên nguồn (dùng ở trang Video đã xem / Xem sau, nơi có phim của nhiều nguồn)
export default function MovieCard({ m, showSource = false }) {
  const msrc = srcId(m.src);
  const pk = `${msrc}:${m.slug}`; // khoá cache xem trước
  const [href, setHref] = useState(watchHref(msrc, m.slug));
  const [hover, setHover] = useState(false); // rê chuột (máy tính)
  const [auto, setAuto] = useState(false); // thẻ nằm trọn trong màn hình (điện thoại)
  const [src, setSrc] = useState('');
  const [playing, setPlaying] = useState(false);
  const [gone, setGone] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const vid = useRef(null);
  const thumb = useRef(null);
  const timer = useRef(null);
  const active = hover || auto;

  useEffect(() => {
    const h = getProgress(m);
    if (m.isSeries && h?.ep) setHref(watchHref(msrc, m.slug, h.ep));
    setGone(isHidden(m));
  }, [m]);

  useEffect(() => {
    if (!window.matchMedia('(hover: none)').matches || !thumb.current) return;
    return watchCard(thumb.current, setAuto);
  }, []);

  const loadSrc = async () => {
    if (SOURCES[msrc].preview === false) return; // nguồn chỉ có link embed: không có m3u8 để xem trước
    try {
      if (!previewCache.has(pk)) {
        const r = await fetch(`/api/preview?src=${msrc}&slug=${encodeURIComponent(m.slug)}`);
        previewCache.set(pk, (await r.json()).m3u8 || '');
      }
      setSrc(previewCache.get(pk));
    } catch {}
  };
  const onEnter = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setHover(true); loadSrc(); }, 500);
  };
  const onLeave = () => { clearTimeout(timer.current); setHover(false); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (auto) loadSrc(); }, [auto]);
  useEffect(() => { if (!active) { setSrc(''); setPlaying(false); } }, [active]);

  // Phát xem trước: nhảy qua từng đoạn nhỏ, chất lượng thấp nhất, đệm ngắn cho nhẹ
  useEffect(() => {
    const v = vid.current;
    if (!active || !src || !v) return;
    let hls, dead = false, starts = [], idx = 0;
    v.muted = true;
    const jump = (i) => { idx = i % starts.length; v.currentTime = starts[idx]; };
    const start = () => {
      const d = v.duration;
      if (isFinite(d) && d > 60) {
        const { clips } = PREVIEW;
        starts = Array.from({ length: clips }, (_, i) => d * (0.08 + (0.8 * i) / (clips - 1)));
        jump(0);
      }
      v.play().catch(() => {});
    };
    const tick = () => { if (starts.length && v.currentTime >= starts[idx] + PREVIEW.len) jump(idx + 1); };
    v.addEventListener('loadedmetadata', start, { once: true });
    v.addEventListener('timeupdate', tick);
    loadHls().then((Hls) => {
      if (dead) return;
      if (Hls.isSupported()) {
        hls = new Hls({ startLevel: 0, capLevelToPlayerSize: true, maxBufferLength: 6, maxMaxBufferLength: 8, backBufferLength: 0 });
        hls.on(Hls.Events.ERROR, (_, d) => {
          // Nguồn chặn CORS: nhớ lại và thử lại qua /api/hls
          if (d.fatal && d.type === 'networkError' && !needsProxy(src)) {
            markProxy(src);
            setSrc('');
            setTimeout(() => setSrc(previewCache.get(pk) || ''), 0);
          }
        });
        hls.loadSource(viaProxy(src, msrc));
        hls.attachMedia(v);
      } else v.src = viaProxy(src, msrc);
    }).catch(() => {});
    return () => {
      dead = true;
      v.removeEventListener('loadedmetadata', start);
      v.removeEventListener('timeupdate', tick);
      hls?.destroy();
    };
  }, [active, src]);

  const bg = { backgroundImage: `url(${m.cover})`, backgroundSize: '100% 100%' };
  const badge = m.isSeries ? m.episode || 'Phim bộ' : m.duration || m.quality;

  if (gone) {
    return (
      <div className="pt-2">
        <div className="flex aspect-video items-center justify-center gap-2 rounded-xl bg-black/5 text-sm dark:bg-white/10">
          Đã ẩn phim này.
          <button className="font-medium underline" onClick={() => { setHidden(m, false); setGone(false); }}>Hoàn tác</button>
        </div>
      </div>
    );
  }

  return (
    <div onMouseEnter={onEnter} onMouseLeave={onLeave} className={`group relative isolate pt-2 hover:z-[5] focus-within:z-[5] ${menuOpen ? '!z-[9]' : ''}`}>
      {/* Nền nổi lên khi rê chuột: CSS thuần (group-hover), chạy ngay, không qua JS */}
      <div className={`pointer-events-none absolute -inset-x-3 -bottom-3 -top-1 -z-10 overflow-hidden rounded-2xl bg-[#f2f2f2] transition duration-200 ease-[cubic-bezier(0.2,0.9,0.3,1.15)] dark:bg-[#272727] scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100`}>
        <div className="absolute inset-0 scale-150 opacity-25 blur-2xl" style={bg} />
      </div>

      <Link href={href} className="block">
        <div className="relative">
          {m.isSeries && (
            <>
              <div className="absolute -top-2 inset-x-3 h-full overflow-hidden rounded-xl opacity-50">
                <div className="absolute inset-0 scale-125 blur-2xl" style={bg} />
              </div>
              <div className="absolute -top-1 inset-x-2 h-full overflow-hidden rounded-xl border-t border-white dark:border-[#0f0f0f]">
                <div className="absolute inset-0 scale-125 blur-2xl" style={bg} />
              </div>
            </>
          )}
          <div ref={thumb} className="relative aspect-video overflow-hidden rounded-xl bg-neutral-200 dark:bg-neutral-800">
            <img src={m.cover} alt={m.title} loading="lazy" className="h-full w-full object-cover" />
            {active && src && (
              <video ref={vid} muted loop playsInline onPlaying={() => setPlaying(true)}
                className={`absolute inset-0 h-full w-full bg-black object-cover transition-opacity duration-300 ${playing ? 'opacity-100' : 'opacity-0'}`} />
            )}
            {badge && (
              <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/80 px-1 py-[3px] text-xs font-medium text-white">
                {m.isSeries && <Icon name="playlist" size={16} />}
                {badge}
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="mt-3 flex items-start gap-1">
        <Link href={href} className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base font-medium leading-[22px] text-[#0f0f0f] dark:text-white">{m.title}</h3>
          <p className="mt-1 text-sm leading-5 text-[#606060] dark:text-[#aaa]">{[m.year, (m.country || []).slice(0, 2).join(', ')].filter(Boolean).join(' • ')}</p>
          <p className="text-sm leading-5 text-[#606060] dark:text-[#aaa]">{[m.isSeries ? 'Phim bộ' : 'Phim lẻ', m.lang, showSource && SOURCES[msrc].name].filter(Boolean).join(' • ')}</p>
        </Link>
        <CardMenu m={m} onHide={() => setGone(true)} onToggle={setMenuOpen} />
      </div>
    </div>
  );
}
