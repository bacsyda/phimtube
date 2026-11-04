'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MovieCard from './MovieCard';
import RelatedCard from './RelatedCard';
import Icon from './Icon';
import Player from './Player';
import { getProgress, saveProgress } from '@/lib/history';
import { SOURCES } from '@/lib/sources';
import { hostOf } from '@/lib/hls';
import { epLabel, watchHref } from '@/lib/util';

const btn = 'flex items-center gap-1 rounded-full bg-black/5 px-3 py-1.5 text-sm sm:px-4 font-medium hover:bg-black/10 disabled:opacity-40 dark:bg-white/10 dark:hover:bg-white/20';
const btnRed = 'rounded-full bg-red-600 px-3 py-1.5 sm:px-4 text-sm font-medium text-white hover:bg-red-700';
// Gợi ý nguyên nhân từ mã lỗi của hls.js (HTTP 0 = không kết nối được, thường do máy chủ video chặn CORS)
const why = (e) => {
  if (e.details === 'không tải được hls.js') return 'Không tải được thư viện phát video. Kiểm tra kết nối mạng rồi thử lại.';
  if (e.proxied) return 'Máy chủ trung gian cũng không lấy được video từ nguồn (nguồn có thể đã chết hoặc chặn truy cập).';
  if (e.code === 0 || e.code === undefined) return 'Không tải được danh sách phát. Thường do máy chủ video chặn truy cập từ trang web khác (CORS) hoặc không kết nối được.';
  if (e.code === 404 || e.code === 410) return 'Link video này đã hết hạn hoặc không còn trên máy chủ nguồn.';
  if (e.code === 429) return 'Đang tải quá nhiều trong thời gian ngắn. Đợi một lát rồi thử lại.';
  if (e.code === 403) return 'Máy chủ video từ chối truy cập (có thể chặn theo trang gọi hoặc theo khu vực).';
  if (e.code >= 500) return 'Máy chủ video đang lỗi. Thử lại sau hoặc đổi server.';
  return 'Nguồn video không phản hồi đúng. Thử player dự phòng hoặc đổi server.';
};

export default function Watch({ m, tap, related, latest = [] }) {
  const router = useRouter();
  const resume = useRef(null);
  const keep = useRef(0);
  const [si, setSi] = useState(0);
  const [auto, setAuto] = useState(true);
  const [theater, setTheater] = useState(false);
  const [hist, setHist] = useState({});
  const [err, setErr] = useState(null);
  const [retry, setRetry] = useState(0);
  const [useEmbed, setUseEmbed] = useState(false);
  const [alts, setAlts] = useState(null); // null: chưa tìm | 'loading' | mảng phim cùng tên ở nguồn khác

  const eps = m.servers[si]?.episodes || [];
  const found = eps.findIndex((e) => e.slug === tap);
  const idx = Math.max(0, found >= 0 ? found : Math.min(keep.current, eps.length - 1));
  keep.current = idx;
  const ep = eps[idx], next = eps[idx + 1], prev = eps[idx - 1];
  const go = (e) => router.push(watchHref(m.src, m.slug, e.slug));
  const meta = { src: m.src, slug: m.slug, title: m.title, cover: m.cover, poster: m.poster, year: m.year, lang: m.lang, quality: m.quality, episode: m.episode, duration: m.duration, isSeries: m.isSeries, country: m.country };

  useEffect(() => {
    setAuto(localStorage.getItem('phimtube-auto') !== '0');
    setTheater(localStorage.getItem('phimtube-theater') === '1');
  }, []);
  const setAutoP = (v) => { setAuto(v); try { localStorage.setItem('phimtube-auto', v ? '1' : '0'); } catch {} };
  const toggleTheater = () => setTheater((v) => { try { localStorage.setItem('phimtube-theater', v ? '0' : '1'); } catch {} return !v; });

  // Đọc lịch sử; vào /watch/slug không có ?tap thì chuyển tới tập đang xem dở
  useEffect(() => {
    const h = getProgress(m) || {};
    setHist(h);
    if (!tap && h.ep && h.ep !== eps[0]?.slug) router.replace(watchHref(m.src, m.slug, h.ep));
  }, [tap]);

  // Sang phim khác thì bỏ kết quả tìm nguồn khác của phim trước
  useEffect(() => { setAlts(null); }, [m.src, m.slug]);

  // Phím tắt Shift+N / Shift+P
  useEffect(() => {
    const k = (e) => {
      if (!e.shiftKey || /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'N' && next) go(next);
      if (e.key === 'P' && prev) go(prev);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const save = (t, d) => { if (ep && d) saveProgress(meta, ep.slug, t, d, next?.slug); };
  const onEnded = (d) => {
    saveProgress(meta, ep.slug, d, d, next?.slug);
    if (auto && next) go(next);
  };
  // Đổi bản (Vietsub / Thuyết minh...) nhưng giữ nguyên vị trí đang xem
  const pickTrack = (i, t) => { resume.current = t; setErr(null); setSi(i); };
  const getStart = () => {
    if (resume.current != null) { const t = resume.current; resume.current = null; return t; }
    const h = getProgress(m);
    return h?.ep === ep?.slug ? h.t : 0;
  };

  // Tìm cùng phim ở các nguồn khác (khớp tên gốc + năm)
  const findAlts = async () => {
    setAlts('loading');
    try {
      const q = new URLSearchParams({ src: m.src, title: m.title || '', original: m.original || '', year: m.year || '' });
      const r = await fetch(`/api/alt?${q}`);
      setAlts((await r.json()).items || []);
    } catch {
      setAlts([]);
    }
  };

  const popup = err && (
    <div className="absolute inset-0 z-30 flex overflow-y-auto bg-black/75 p-2 sm:p-4">
      <div className="m-auto w-full max-w-md rounded-2xl bg-white p-3 text-center text-black shadow-xl dark:bg-[#212121] dark:text-white sm:p-5">
        <h2 className="text-base font-semibold sm:text-lg">Không phát được video</h2>
        <p className="mt-1 text-xs text-[#606060] dark:text-[#aaa] sm:text-sm">{why(err)}</p>
        <p className="mt-1 break-all text-[11px] text-[#606060] dark:text-[#aaa] sm:mt-2 sm:text-xs">
          Mã lỗi: {err.details}{err.code !== undefined ? ` (HTTP ${err.code})` : ''}{hostOf(err.url) ? ` • ${hostOf(err.url)}` : ''}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:mt-4 sm:gap-2">
          {ep?.embed && <button className={btnRed} onClick={() => setUseEmbed(true)}>Dùng player dự phòng</button>}
          <button className={btn} onClick={() => { setErr(null); setRetry((r) => r + 1); }}>Thử lại</button>
          {m.servers.map((s, i) => i !== si && (
            <button key={i} className={btn} onClick={() => { setErr(null); setSi(i); }}>Thử {s.name}</button>
          ))}
          {alts === null && <button className={btn} onClick={findAlts}>Thử nguồn khác</button>}
        </div>
        {alts === 'loading' && <p className="mt-3 text-xs text-[#606060] dark:text-[#aaa] sm:text-sm">Đang tìm phim này ở các nguồn khác…</p>}
        {Array.isArray(alts) && (
          alts.length ? (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:gap-2">
              {alts.map((a) => (
                <button key={a.src} className={btnRed} onClick={() => { setErr(null); router.push(watchHref(a.src, a.slug)); }}>
                  Xem ở {SOURCES[a.src]?.name || a.src}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-[#606060] dark:text-[#aaa] sm:text-sm">Không tìm thấy phim này ở nguồn khác.</p>
          )
        )}
      </div>
    </div>
  );

  const player = ep?.m3u8 && !useEmbed ? (
    <Player src={ep.m3u8} source={m.src} retryKey={retry} getStart={getStart}
      autoNext={auto} onAutoNext={setAutoP} showAuto={m.isSeries}
      hasNext={!!next} onNext={() => next && go(next)}
      tracks={m.servers.map((s) => s.name)} track={si} onTrack={pickTrack}
      theater={theater} onTheater={toggleTheater}
      playlist={m.isSeries ? {
        title: m.title, cover: m.cover, current: idx,
        sub: `${epLabel(ep?.name)} / ${eps.length}${m.servers[si] ? ` • ${m.servers[si].name}` : ''}`,
        items: eps.map((e) => ({ slug: e.slug, name: e.name, p: hist.eps?.[e.slug] || 0 })),
      } : null}
      onPickEp={(i) => eps[i] && go(eps[i])}
      onSave={save} onEnded={onEnded} onError={setErr}>
      {popup}
    </Player>
  ) : (
    <div className="aspect-video overflow-hidden bg-black sm:rounded-xl">
      {ep?.embed ? <iframe src={ep.embed} allowFullScreen className="h-full w-full" />
        : <p className="grid h-full place-items-center text-white">Không có nguồn phát</p>}
    </div>
  );

  return (
    <div className="mx-auto grid max-w-[1700px] gap-x-6 gap-y-3 pt-2 lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className={`-mx-3 sm:mx-0 ${theater ? 'lg:col-span-2 lg:row-start-1' : 'lg:col-start-1 lg:row-start-1'}`}>
        {player}
        {useEmbed && ep?.m3u8 && (
          <button className="mt-2 text-sm underline" onClick={() => { setUseEmbed(false); setRetry((r) => r + 1); }}>Quay lại player chính</button>
        )}
      </div>

      <div className="min-w-0 lg:col-start-1 lg:row-start-2">
        <h1 className="text-xl font-semibold">{m.title}{m.isSeries && ep ? ` – ${epLabel(ep.name)}` : ''}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {m.isSeries && (
            <>
              <button className={btn} disabled={!prev} onClick={() => go(prev)}><Icon name="prev" size={20} />Tập trước</button>
              <button className={btn} disabled={!next} onClick={() => go(next)}>Tập sau<Icon name="next" size={20} /></button>
            </>
          )}
          <span className="text-sm text-neutral-500">{[m.year, m.lang, m.quality, m.time, SOURCES[m.src]?.name].filter(Boolean).join(' • ')}</span>
        </div>
        <div className="mt-3 space-y-1 rounded-xl bg-neutral-100 p-3 text-sm dark:bg-neutral-800">
          {m.original && <p className="font-medium">{m.original}</p>}
          <p className="whitespace-pre-line">{m.desc}</p>
          {m.genres.length > 0 && <p className="text-neutral-500">Thể loại: {m.genres.join(', ')}</p>}
          {m.countries.length > 0 && <p className="text-neutral-500">Quốc gia: {m.countries.join(', ')}</p>}
          {m.actors.length > 0 && <p className="text-neutral-500">Diễn viên: {m.actors.join(', ')}</p>}
        </div>
        {latest.length > 0 && (
          <section className="mt-8 hidden lg:block">
            <h2 className="mb-2 text-lg font-semibold">Phim mới cập nhật</h2>
            <div className="grid gap-x-4 gap-y-8 lg:grid-cols-2 xl:grid-cols-3">
              {latest.map((r) => <MovieCard key={r.slug} m={r} />)}
            </div>
          </section>
        )}
      </div>

      <aside className={theater ? 'lg:col-start-2 lg:row-start-2' : 'lg:col-start-2 lg:row-span-2 lg:row-start-1'}>
        {m.isSeries && (
          <div className="mb-4 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
            <div className="bg-neutral-100 p-3 dark:bg-neutral-800">
              <p className="font-semibold">{m.title}</p>
              <p className="text-xs text-neutral-500">{epLabel(ep?.name)} / {eps.length}{m.servers[si] ? ` • ${m.servers[si].name}` : ''}</p>
            </div>
            <ol className="max-h-[480px] overflow-y-auto">
              {eps.map((e, i) => (
                <li key={e.slug}>
                  <button onClick={() => go(e)}
                    className={`flex w-full items-center gap-3 p-2 text-left ${i === idx ? 'bg-neutral-200 dark:bg-neutral-700' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>
                    <span className="flex w-5 justify-center text-xs text-neutral-500">{i === idx ? <Icon name="play" size={16} /> : i + 1}</span>
                    <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-neutral-300 dark:bg-neutral-700">
                      <img src={m.cover} alt="" className="h-full w-full object-cover" />
                      <span className="absolute inset-0 grid place-items-center bg-black/40 text-sm font-semibold text-white">{epLabel(e.name)}</span>
                      <span className="absolute bottom-0 left-0 h-1 bg-red-600" style={{ width: `${(hist.eps?.[e.slug] || 0) * 100}%` }} />
                    </span>
                    <span className="text-sm">{m.title}<br /><span className="text-xs text-neutral-500">{epLabel(e.name)}</span></span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
        {related.length > 0 && <h2 className="mb-1 text-base font-semibold">Phim cùng thể loại</h2>}
        <div className="hidden gap-3 lg:grid">
          {related.map((r) => <RelatedCard key={r.slug} m={r} />)}
        </div>
        <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:hidden">
          {related.map((r) => <MovieCard key={r.slug} m={r} />)}
        </div>
      </aside>
    </div>
  );
}
