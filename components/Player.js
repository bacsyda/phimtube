'use client';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { loadHls, viaProxy, needsProxy, markProxy } from '@/lib/hls';
import { epLabel } from '@/lib/util';

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

function Btn({ label, onClick, children }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15 active:bg-white/25 sm:h-10 sm:w-10">
      {children}
    </button>
  );
}

function Row({ label, value, onClick, check, chevron, cls = '' }) {
  return (
    <button type="button" onClick={onClick} className={`flex h-11 w-full items-center gap-3 px-4 text-left hover:bg-white/10 ${cls}`}>
      {check !== undefined && <span className="w-5 shrink-0">{check && <Icon name="check" size={20} />}</span>}
      <span className="flex-1">{label}</span>
      {value && <span className="text-white/70">{value}</span>}
      {chevron && <Icon name="chevR" size={20} />}
    </button>
  );
}

function Head({ onBack, children }) {
  return (
    <button type="button" onClick={onBack} className="flex h-11 w-full items-center gap-2 border-b border-white/10 px-3 font-medium hover:bg-white/10">
      <Icon name="chevL" size={20} />{children}
    </button>
  );
}

// Trình phát kiểu YouTube: timeline có ảnh xem trước, âm lượng, tốc độ, chất lượng, phụ đề/lồng tiếng, rạp chiếu, toàn màn hình, cử chỉ trên điện thoại
export default function Player({
  src, source, retryKey = 0, getStart, autoNext, onAutoNext, showAuto, hasNext, onNext,
  tracks = [], track = 0, onTrack, theater, onTheater, playlist, onPickEp, onSave, onEnded, onError, children,
}) {
  const box = useRef(null), video = useRef(null), hlsRef = useRef(null);
  const stage = useRef(null); // vùng video + điều khiển; thu hẹp lại khi mở bảng danh sách tập
  const tl = useRef(null), pv = useRef(null), pvHls = useRef(null), pvCanvas = useRef(null), pvT = useRef(0);
  const timers = useRef({}), lastTap = useRef(0), lastSave = useRef(0), scrubbing = useRef(false);
  const hov = useRef(false); // chuột đang nằm trên trình phát

  const [rt, setRt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buf, setBuf] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(-1);
  const [autoH, setAutoH] = useState(0);
  const [menu, setMenu] = useState(null);
  const [show, setShow] = useState(true);
  const [fs, setFs] = useState(false);
  const [hover, setHover] = useState(null);
  const [scrub, setScrub] = useState(false);
  const [pvOk, setPvOk] = useState(false);
  const [fx, setFx] = useState(null);
  const [pl, setPl] = useState(false);

  const live = useRef({});
  live.current = { playing, menu, show, dur, vol, muted, pl, fs };

  // ---- Nạp HLS; lỗi mạng (thường là CORS) thì tự thử lại qua /api/hls ----
  useEffect(() => {
    const v = video.current;
    if (!v || !src) return;
    let hls, dead = false, mediaTries = 0, netTries = 0, lastErr = 0;
    const proxied = needsProxy(src);
    const onMeta = () => {
      const t = getStart?.() || 0;
      if (t > 5 && t < v.duration - 5) v.currentTime = t;
      v.play().catch(() => {});
    };
    v.addEventListener('loadedmetadata', onMeta, { once: true });
    loadHls().then((Hls) => {
      if (dead) return;
      if (Hls.isSupported()) {
        hls = new Hls();
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, (_, d) =>
          setLevels(d.levels.map((l, i) => ({ i, h: l.height || 0, br: l.bitrate || 0 })).sort((a, b) => b.h - a.h || b.br - a.br)));
        hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => setAutoH(hls.levels[d.level]?.height || 0));
        hls.on(Hls.Events.ERROR, (_, d) => {
          if (!d.fatal) return;
          if (!proxied && d.type === Hls.ErrorTypes.NETWORK_ERROR) { markProxy(src); setRt((r) => r + 1); return; }
          // Lỗi cách nhau hơn 30 giây thì coi là sự cố mới, cho phép phục hồi lại từ đầu
          const now = Date.now();
          if (now - lastErr > 30000) { mediaTries = 0; netTries = 0; }
          lastErr = now;
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mediaTries < 2) {
            // Lần 2 thử đổi codec âm thanh trước khi phục hồi
            if (mediaTries++ === 1) hls.swapAudioCodec();
            hls.recoverMediaError();
            return;
          }
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR && netTries < 2) { netTries++; hls.startLoad(); return; }
          onError?.({ details: d.details || d.type, code: d.response?.code, url: d.url || src, proxied });
        });
        hls.loadSource(viaProxy(src, source));
        hls.attachMedia(v);
      } else v.src = viaProxy(src, source); // Safari / iOS phát HLS gốc
    }).catch(() => onError?.({ details: 'không tải được hls.js' }));
    return () => {
      dead = true;
      v.removeEventListener('loadedmetadata', onMeta);
      hls?.destroy();
      hlsRef.current = null;
      pvHls.current?.destroy();
      pvHls.current = null;
      setLevels([]); setLevel(-1); setAutoH(0); setPvOk(false);
      setCur(0); setDur(0); setBuf(0); setEnded(false); setWaiting(true);
    };
  }, [src, retryKey, rt]);

  // ---- Âm lượng (nhớ lại) ----
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem('phimtube-vol')); if (s) { setVol(s.v ?? 1); setMuted(!!s.m); } } catch {}
  }, []);
  useEffect(() => { const el = video.current; if (el) { el.volume = vol; el.muted = muted; } }, [vol, muted, src]);
  const saveVol = (v, m) => { try { localStorage.setItem('phimtube-vol', JSON.stringify({ v, m })); } catch {} };

  // ---- Tự ẩn thanh điều khiển ----
  const wake = () => {
    setShow(true);
    clearTimeout(timers.current.hide);
    timers.current.hide = setTimeout(() => { if (live.current.playing && !live.current.menu) setShow(false); }, 2800);
  };
  useEffect(() => { if (playing) wake(); else { clearTimeout(timers.current.hide); setShow(true); } }, [playing]);
  useEffect(() => { if (!menu && playing) wake(); }, [menu]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  // ---- Toàn màn hình ----
  useEffect(() => {
    const f = () => {
      const on = !!document.fullscreenElement;
      setFs(on);
      try { if (on) screen.orientation?.lock?.('landscape')?.catch(() => {}); else screen.orientation?.unlock?.(); } catch {}
    };
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  useEffect(() => { if (!fs) setPl(false); }, [fs]);

  // ---- Hành động ----
  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.ended) el.currentTime = 0;
    if (el.paused) el.play().catch(() => {}); else el.pause();
  };
  const seekTo = (t) => { const el = video.current; if (!el) return; el.currentTime = clamp(t, 0, el.duration || 0); setCur(el.currentTime); };
  const seekBy = (d) => { const el = video.current; if (el) { seekTo(el.currentTime + d); wake(); } };
  const setVolume = (x) => { x = clamp(x, 0, 1); setVol(x); setMuted(x === 0); saveVol(x, x === 0); };
  const toggleMute = () => {
    const m = !live.current.muted;
    if (!m && live.current.vol === 0) setVol(0.5);
    setMuted(m);
    saveVol(live.current.vol || 0.5, m);
  };
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else if (box.current?.requestFullscreen) box.current.requestFullscreen().catch(() => {});
    else video.current?.webkitEnterFullscreen?.();
  };
  const applySpeed = (s) => { const el = video.current; if (el) el.playbackRate = s; setSpeed(s); setMenu(null); };
  const pickLevel = (i) => { if (hlsRef.current) hlsRef.current.currentLevel = i; setLevel(i); setMenu(null); };
  const stepSpeed = (d) => applySpeed(SPEEDS[clamp(SPEEDS.indexOf(speed) + d, 0, SPEEDS.length - 1)] ?? 1);

  // ---- Phím tắt ----
  const act = useRef({});
  act.current = { toggle, seekBy, seekTo, setVolume, toggleMute, toggleFs, onTheater, stepSpeed };
  useEffect(() => {
    const key = (e) => {
      const t = e.target;
      if (/input|textarea|select/i.test(t.tagName) || t.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      const a = act.current, L = live.current;
      // Mũi tên lên/xuống và Home chỉ ăn khi đang tương tác với trình phát, để vẫn cuộn trang bằng phím được
      const own = L.fs || hov.current || !!box.current?.contains(document.activeElement);
      switch (e.key) {
        case ' ': if (/^(button|a)$/i.test(t.tagName)) return; e.preventDefault(); a.toggle(); break;
        case 'k': a.toggle(); break;
        case 'ArrowLeft': e.preventDefault(); a.seekBy(-5); break;
        case 'ArrowRight': e.preventDefault(); a.seekBy(5); break;
        case 'j': a.seekBy(-10); break;
        case 'l': a.seekBy(10); break;
        case 'ArrowUp': if (!own) return; e.preventDefault(); a.setVolume(L.vol + 0.05); break;
        case 'ArrowDown': if (!own) return; e.preventDefault(); a.setVolume(L.vol - 0.05); break;
        case 'm': a.toggleMute(); break;
        case 'f': a.toggleFs(); break;
        case 't': a.onTheater?.(); break;
        case '<': a.stepSpeed(-1); break;
        case '>': a.stepSpeed(1); break;
        case 'Home': if (!own) return; a.seekTo(0); break;
        default: if (/^[0-9]$/.test(e.key) && !e.shiftKey) a.seekTo((L.dur * Number(e.key)) / 10);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  // ---- Sự kiện của <video> ----
  const updBuf = () => {
    const el = video.current;
    if (!el) return;
    let end = 0;
    for (let i = 0; i < el.buffered.length; i++) if (el.buffered.start(i) <= el.currentTime + 0.5 && el.buffered.end(i) >= end) end = el.buffered.end(i);
    setBuf(end);
  };
  const onTime = () => {
    const el = video.current;
    if (!el) return;
    if (!scrubbing.current) setCur(el.currentTime);
    updBuf();
    const now = Date.now();
    if (now - lastSave.current > 5000) { lastSave.current = now; onSave?.(el.currentTime, el.duration); }
  };

  // ---- Ảnh xem trước trên timeline: video thứ hai, chất lượng thấp nhất, vẽ ra canvas ----
  const ensurePv = async () => {
    if (pvHls.current || !pv.current || !src) return;
    try {
      const Hls = await loadHls();
      if (pvHls.current || !Hls.isSupported()) return;
      const h = new Hls({ startLevel: 0, maxBufferLength: 2, maxMaxBufferLength: 4, backBufferLength: 0 });
      pvHls.current = h;
      h.on(Hls.Events.MANIFEST_PARSED, () => { h.currentLevel = 0; });
      h.loadSource(viaProxy(src, source));
      h.attachMedia(pv.current);
    } catch {}
  };
  const seekPv = (t) => {
    pvT.current = t;
    clearTimeout(timers.current.pv);
    timers.current.pv = setTimeout(() => { const p = pv.current; if (p && p.readyState > 0) p.currentTime = t; }, 60);
  };
  const drawPv = () => {
    const p = pv.current, c = pvCanvas.current;
    if (!p || !c || !p.videoWidth) return;
    const h = Math.round((c.width * p.videoHeight) / p.videoWidth);
    if (c.height !== h) c.height = h;
    c.getContext('2d').drawImage(p, 0, 0, c.width, c.height);
    setPvOk(true);
  };

  // ---- Timeline (chuột và cảm ứng) ----
  const at = (e) => {
    const r = tl.current.getBoundingClientRect();
    const x = clamp(e.clientX - r.left, 0, r.width);
    return { t: r.width ? (x / r.width) * (live.current.dur || 0) : 0, x, w: r.width };
  };
  const pct = (t) => `${dur ? clamp((t / dur) * 100, 0, 100) : 0}%`;

  // ---- Chạm / nhấp lên video ----
  const onSurface = (e) => {
    if (e.button > 0) return;
    if (live.current.menu) { setMenu(null); return; }
    const touch = e.pointerType !== 'mouse';
    const now = Date.now();
    const r = (stage.current || box.current).getBoundingClientRect();
    const x = e.clientX - r.left;
    const dbl = now - lastTap.current < 300;
    lastTap.current = dbl ? 0 : now;
    if (!touch) { toggle(); if (dbl) toggleFs(); return; }
    clearTimeout(timers.current.tap);
    if (dbl) {
      const dir = x < r.width / 3 ? -1 : x > (r.width * 2) / 3 ? 1 : 0;
      if (dir) {
        seekBy(dir * 10);
        setFx({ dir, k: now });
        clearTimeout(timers.current.fx);
        timers.current.fx = setTimeout(() => setFx(null), 600);
      } else toggleFs();
      return;
    }
    timers.current.tap = setTimeout(() => { if (live.current.show) setShow(false); else wake(); }, 250);
  };

  const pill = 'flex items-center rounded-full bg-black/40 backdrop-blur-md';
  const curH = level < 0 ? autoH : levels.find((l) => l.i === level)?.h || 0;
  const hdBadge = curH >= 2160 ? '4K' : curH >= 720 ? 'HD' : '';
  const showCtl = show || !playing || !!menu;
  const qs = levels.filter((l, k, a) => l.h && a.findIndex((x) => x.h === l.h) === k);
  const speedLabel = speed === 1 ? 'Bình thường' : `${speed}x`;
  const qualityLabel = level < 0 ? `Tự động${autoH ? ` (${autoH}p)` : ''}` : `${levels.find((l) => l.i === level)?.h || ''}p`;

  return (
    <div ref={box}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') hov.current = true; }}
      onPointerMove={(e) => { if (e.pointerType === 'mouse') { hov.current = true; wake(); } }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return;
        hov.current = false;
        if (live.current.playing && !live.current.menu) setShow(false);
      }}
      className={`relative w-full touch-manipulation select-none overflow-hidden bg-black text-white ${fs ? '' : `aspect-video [@media(max-height:500px)]:max-h-[calc(100dvh-3.5rem)] ${theater ? 'lg:max-h-[calc(100vh-7rem)]' : 'sm:rounded-xl'}`} ${showCtl ? '' : 'cursor-none'}`}>
      <div ref={stage} className="absolute inset-0 transition-[right] duration-200 ease-out"
        style={{ right: pl && fs && playlist ? 'min(360px, 85%)' : 0 }}>
      <video ref={video} playsInline className="absolute inset-0 h-full w-full object-contain"
        onPlay={() => { setPlaying(true); setEnded(false); }}
        onPause={() => { setPlaying(false); const el = video.current; if (el?.duration) onSave?.(el.currentTime, el.duration); }}
        onPlaying={() => setWaiting(false)}
        onWaiting={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        onTimeUpdate={onTime}
        onProgress={updBuf}
        onDurationChange={(e) => setDur(e.target.duration || 0)}
        onRateChange={(e) => setSpeed(e.target.playbackRate)}
        onEnded={() => { setEnded(true); setPlaying(false); onEnded?.(video.current.duration); }} />
      <video ref={pv} muted playsInline preload="auto" onSeeked={drawPv}
        onLoadedMetadata={() => { if (pv.current) pv.current.currentTime = pvT.current; }}
        className="pointer-events-none absolute left-0 top-0 h-[2px] w-[2px] opacity-0" />

      <div className="absolute inset-0" onPointerUp={onSurface} />

      {waiting && <div className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-4 border-white/30 border-t-white" />}
      {!playing && !waiting && (
        <button type="button" aria-label={ended ? 'Xem lại' : 'Phát'} onClick={toggle}
          className={`absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/60 ${ended ? '' : 'md:hidden'}`}>
          <Icon name={ended ? 'replay' : 'play'} size={36} />
        </button>
      )}
      {fx && (
        <div key={fx.k} className={`pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-white/20 px-6 py-8 text-sm font-medium ${fx.dir < 0 ? 'left-[8%]' : 'right-[8%]'}`}>
          {fx.dir < 0 ? '−10 giây' : '+10 giây'}
        </div>
      )}
      {!showCtl && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/30">
          <div className="h-full bg-[#f00]" style={{ width: pct(cur) }} />
        </div>
      )}

      <div className={`absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-2 pt-8 transition-opacity sm:px-3 sm:pt-12 duration-200 ${showCtl ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div ref={tl} className="group/tl relative h-8 cursor-pointer touch-none sm:h-6"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            scrubbing.current = true; setScrub(true);
            const p = at(e); seekTo(p.t); setHover(p); ensurePv(); seekPv(p.t);
          }}
          onPointerMove={(e) => { const p = at(e); setHover(p); ensurePv(); seekPv(p.t); if (scrubbing.current) seekTo(p.t); }}
          onPointerUp={(e) => { scrubbing.current = false; setScrub(false); if (e.pointerType !== 'mouse') setHover(null); }}
          onPointerLeave={() => { if (!scrubbing.current) setHover(null); }}>
          {hover && dur > 0 && (
            <div className="pointer-events-none absolute bottom-9 z-20 sm:bottom-7" style={{ left: clamp(hover.x - 88, 0, Math.max(hover.w - 176, 0)) }}>
              <div className={`overflow-hidden rounded-lg border-2 border-white/90 bg-black ${pvOk ? '' : 'hidden'}`}>
                <canvas ref={pvCanvas} width="172" height="97" className="block w-[172px]" />
              </div>
              <div className="mt-1 text-center text-[13px] font-medium drop-shadow">{fmt(hover.t)}</div>
            </div>
          )}
          <div className={`absolute inset-x-0 bottom-3 rounded-full bg-white/30 transition-[height] sm:bottom-2 ${scrub ? 'h-[5px]' : 'h-[3px] group-hover/tl:h-[5px]'}`}>
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: pct(buf) }} />
            {hover && <div className="absolute inset-y-0 left-0 rounded-full bg-white/50" style={{ width: pct(hover.t) }} />}
            <div className="absolute inset-y-0 left-0 rounded-full bg-[#f00]" style={{ width: pct(cur) }} />
            <div className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f00] transition-transform ${scrub ? 'scale-100' : 'scale-0 group-hover/tl:scale-100'}`} style={{ left: pct(cur) }} />
          </div>
        </div>

        <div className="flex items-center gap-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:gap-2">
          <div className={pill}>
            <Btn label={ended ? 'Xem lại' : playing ? 'Tạm dừng (k)' : 'Phát (k)'} onClick={toggle}>
              <Icon name={ended ? 'replay' : playing ? 'pause' : 'play'} />
            </Btn>
          </div>
          {hasNext && (
            <div className={pill}><Btn label="Tập sau (Shift+N)" onClick={onNext}><Icon name="next" /></Btn></div>
          )}
          <div className={`group/vol hidden md:flex ${pill}`}>
            <Btn label="Tắt tiếng (m)" onClick={toggleMute}>
              <Icon name={muted || vol === 0 ? 'volOff' : vol < 0.5 ? 'volDown' : 'volUp'} />
            </Btn>
            <input type="range" min="0" max="1" step="0.02" value={muted ? 0 : vol} aria-label="Âm lượng"
              onChange={(e) => setVolume(Number(e.target.value))}
              style={{ '--p': `${(muted ? 0 : vol) * 100}%` }}
              className="vol w-0 opacity-0 transition-all duration-200 group-hover/vol:mr-3 group-hover/vol:w-20 group-hover/vol:opacity-100 focus:mr-3 focus:w-20 focus:opacity-100" />
          </div>
          <div className={`${pill} h-9 min-w-0 shrink overflow-hidden whitespace-nowrap px-2 text-xs tabular-nums sm:h-10 sm:px-3 sm:text-[13px]`}>{fmt(cur)} / {fmt(dur)}</div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <div className={pill}>
              {showAuto && (
                <button type="button" role="switch" aria-checked={!!autoNext} title={`Tự động chuyển tập: ${autoNext ? 'Bật' : 'Tắt'}`}
                  onClick={() => onAutoNext?.(!autoNext)} className="hidden h-9 w-11 place-items-center sm:grid sm:h-10 sm:w-12">
                  <span className={`relative h-[14px] w-[34px] rounded-full transition-colors ${autoNext ? 'bg-white/60' : 'bg-white/30'}`}>
                    <span className={`absolute -top-[3px] grid h-5 w-5 place-items-center rounded-full bg-white text-black shadow transition-all ${autoNext ? 'left-[17px]' : 'left-0'}`}>
                      <Icon name={autoNext ? 'play' : 'pause'} size={14} />
                    </span>
                  </span>
                </button>
              )}
              {tracks.length > 1 && (
                <Btn label="Phụ đề / Lồng tiếng" onClick={() => setMenu(menu === 'subs' ? null : 'subs')}><Icon name="cc" /></Btn>
              )}
              <Btn label="Cài đặt" onClick={() => setMenu(menu ? null : 'main')}>
                <span className="relative grid place-items-center">
                  <Icon name="gear" className={`transition-transform duration-200 ${menu === 'main' ? 'rotate-45' : ''}`} />
                  {hdBadge && <span className="absolute -right-2 -top-1 rounded-[3px] bg-[#f00] px-[3px] text-[8px] font-bold leading-[11px] text-white">{hdBadge}</span>}
                </span>
              </Btn>
              {onTheater && (
                <div className="hidden lg:block">
                  <Btn label="Chế độ rạp chiếu (t)" onClick={onTheater}><Icon name={theater ? 'theaterOn' : 'theater'} /></Btn>
                </div>
              )}
            </div>
            <div className={pill}>
              <Btn label="Toàn màn hình (f)" onClick={toggleFs}><Icon name={fs ? 'fsExit' : 'fs'} /></Btn>
            </div>
          </div>
        </div>
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onPointerDown={() => setMenu(null)} />
          <div onPointerDown={(e) => e.stopPropagation()}
            className="z-40 w-64 overflow-hidden rounded-xl bg-[rgba(28,28,28,0.95)] py-2 text-sm shadow-xl backdrop-blur max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[75dvh] max-md:w-full max-md:overflow-y-auto max-md:rounded-b-none max-md:rounded-t-2xl max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))] md:absolute md:bottom-16 md:right-3 md:max-h-[calc(100%-5rem)] md:overflow-y-auto">
            {menu === 'main' && (
              <>
                <Row label="Tốc độ phát" value={speedLabel} chevron onClick={() => setMenu('speed')} />
                {qs.length > 1 && <Row label="Chất lượng" value={qualityLabel} chevron onClick={() => setMenu('quality')} />}
                {/* Điện thoại: công tắc tự chuyển tập nằm trong menu cho thanh điều khiển đỡ chật */}
                {showAuto && <Row cls="sm:hidden" label="Tự động chuyển tập" value={autoNext ? 'Bật' : 'Tắt'} onClick={() => onAutoNext?.(!autoNext)} />}
              </>
            )}
            {menu === 'speed' && (
              <>
                <Head onBack={() => setMenu('main')}>Tốc độ phát</Head>
                {SPEEDS.map((s) => <Row key={s} label={s === 1 ? 'Bình thường' : String(s)} check={speed === s} onClick={() => applySpeed(s)} />)}
              </>
            )}
            {menu === 'quality' && (
              <>
                <Head onBack={() => setMenu('main')}>Chất lượng</Head>
                <Row label="Tự động" value={level < 0 && autoH ? `${autoH}p` : ''} check={level < 0} onClick={() => pickLevel(-1)} />
                {qs.map((l) => <Row key={l.i} label={`${l.h}p`} check={level === l.i} onClick={() => pickLevel(l.i)} />)}
              </>
            )}
            {menu === 'subs' && (
              <>
                <div className="flex h-11 items-center border-b border-white/10 px-4 font-medium">Phụ đề / Lồng tiếng</div>
                {tracks.map((n, i) => (
                  <Row key={i} label={n} check={i === track}
                    onClick={() => { setMenu(null); if (i !== track) onTrack?.(i, video.current?.currentTime || 0); }} />
                ))}
              </>
            )}
          </div>
        </>
      )}

      </div>

      {fs && playlist && !pl && (
        <div className={`absolute right-3 top-3 z-20 transition-opacity ${showCtl ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
          <div className={pill}>
            <Btn label="Danh sách tập" onClick={() => setPl(true)}><Icon name="playlist" /></Btn>
          </div>
        </div>
      )}
      {pl && fs && playlist && (
        <div onPointerDown={(e) => e.stopPropagation()}
          className="slide-in-r absolute inset-y-0 right-0 z-30 flex w-[360px] max-w-[85%] flex-col bg-[#212121]/95 text-white shadow-2xl backdrop-blur">
          <div className="flex items-start gap-2 border-b border-white/10 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{playlist.title}</p>
              <p className="text-xs text-white/60">{playlist.sub}</p>
            </div>
            <button type="button" aria-label="Đóng" onClick={() => setPl(false)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15">
              <Icon name="close" />
            </button>
          </div>
          <ol className="flex-1 overflow-y-auto">
            {playlist.items.map((it, i) => (
              <li key={it.slug}>
                <button type="button" onClick={() => onPickEp?.(i)}
                  className={`flex w-full items-center gap-3 p-2 text-left ${i === playlist.current ? 'bg-white/15' : 'hover:bg-white/10'}`}>
                  <span className="flex w-5 justify-center text-xs text-white/60">{i === playlist.current ? <Icon name="play" size={16} /> : i + 1}</span>
                  <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-black">
                    <img src={playlist.cover} alt="" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 grid place-items-center bg-black/40 text-sm font-semibold">{epLabel(it.name)}</span>
                    <span className="absolute bottom-0 left-0 h-1 bg-red-600" style={{ width: `${(it.p || 0) * 100}%` }} />
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="line-clamp-2 block">{playlist.title}</span>
                    <span className="text-xs text-white/60">{epLabel(it.name)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {children}
    </div>
  );
}
