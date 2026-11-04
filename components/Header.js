'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { watchHref } from '@/lib/util';

const roundBtn = 'grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-black/10 dark:hover:bg-white/10';

export default function Header({ onMenu }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(-1);
  const [listening, setListening] = useState(false);
  const [canVoice, setCanVoice] = useState(false);
  const [dark, setDark] = useState(false);
  const [mSearch, setMSearch] = useState(false); // điện thoại: thanh tìm kiếm toàn header
  const boxD = useRef(null), boxM = useRef(null), inpD = useRef(null), inpM = useRef(null), rec = useRef(null);

  useEffect(() => {
    setCanVoice(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('phimtube-theme', next ? 'dark' : 'light'); } catch {}
    setDark(next);
  };

  // Gợi ý khi gõ (debounce 250ms, huỷ yêu cầu cũ)
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setItems([]); return; }
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(t)}`, { signal: ctl.signal });
        setItems((await r.json()).items || []);
        setSel(-1);
      } catch {}
    }, 250);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q]);

  // Bấm ra ngoài thì đóng gợi ý
  useEffect(() => {
    const close = (e) => {
      if (!boxD.current?.contains(e.target) && !boxM.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (path) => { setOpen(false); setMSearch(false); router.push(path); };
  const submit = (e) => {
    e.preventDefault();
    if (sel >= 0 && items[sel]) return go(watchHref(items[sel].src, items[sel].slug));
    if (q.trim()) go('/search?q=' + encodeURIComponent(q.trim()));
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); setMSearch(false); }
    if (!open || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % items.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s <= 0 ? items.length - 1 : s - 1)); }
  };

  // Tìm bằng giọng nói (Web Speech API, tiếng Việt); bấm lần nữa để dừng
  const voice = () => {
    if (listening) return rec.current?.stop();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    rec.current = r;
    r.lang = 'vi-VN';
    r.interimResults = true;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0].transcript).join('');
      setQ(text);
      if (e.results[e.results.length - 1].isFinal && text.trim()) go('/search?q=' + encodeURIComponent(text.trim()));
    };
    r.start();
  };

  const micBtn = canVoice && (
    <button type="button" aria-label="Tìm bằng giọng nói" title="Tìm bằng giọng nói" onClick={voice}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${listening ? 'animate-pulse bg-red-600 text-white' : 'bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20'}`}>
      <Icon name="mic" />
    </button>
  );

  // Ô nhập + nút xoá (X) + nút tìm; dùng cho cả máy tính và điện thoại
  const form = (mobile) => {
    const inp = mobile ? inpM : inpD;
    return (
      <form onSubmit={submit} className="flex">
        <div className="relative min-w-0 flex-1">
          <input ref={inp} name="q" value={q} autoComplete="off" autoFocus={mobile} placeholder="Tìm kiếm"
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)} onKeyDown={onKey}
            className="w-full rounded-l-full border border-neutral-300 bg-transparent py-1.5 pl-4 pr-9 outline-none focus:border-blue-500 dark:border-neutral-700" />
          {q && (
            <button type="button" aria-label="Xóa văn bản" title="Xóa"
              onClick={() => { setQ(''); setItems([]); inp.current?.focus(); }}
              className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full hover:bg-black/10 dark:hover:bg-white/10">
              <Icon name="close" size={18} />
            </button>
          )}
        </div>
        <button className="rounded-r-full border border-l-0 border-neutral-300 bg-neutral-100 px-5 dark:border-neutral-700 dark:bg-neutral-800" aria-label="Tìm kiếm">
          <Icon name="search" size={22} />
        </button>
      </form>
    );
  };

  const dropdown = (cls) =>
    open && items.length > 0 && (
      <ul className={cls}>
        {items.map((s, i) => (
          <li key={`${s.src}:${s.slug}`}>
            <button type="button" onMouseEnter={() => setSel(i)} onClick={() => go(watchHref(s.src, s.slug))}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left ${i === sel ? 'bg-black/5 dark:bg-white/10' : ''}`}>
              <img src={s.poster} alt="" className="h-14 w-10 shrink-0 rounded bg-neutral-200 object-cover dark:bg-neutral-700" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 block text-sm font-medium">{s.title}</span>
                <span className="block text-xs text-[#606060] dark:text-[#aaa]">
                  {[s.year, s.isSeries ? 'Phim bộ' : 'Phim lẻ'].filter(Boolean).join(' • ')}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-white px-3 dark:bg-[#0f0f0f] md:gap-4 md:px-4">
      <button aria-label="Menu" onClick={onMenu} className={roundBtn}><Icon name="menu" /></button>
      <Link href="/" className="-ml-1 flex shrink-0 items-center gap-1.5 text-xl font-bold tracking-tight md:w-44">
        <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true"><rect width="28" height="20" rx="6" fill="#f00" /><path d="M11 5.5v9l8-4.5z" fill="#fff" /></svg>PhimTube
      </Link>

      {/* Máy tính: thanh tìm kiếm luôn hiển thị */}
      <div ref={boxD} className="mx-auto hidden w-full min-w-0 max-w-xl items-center gap-3 md:flex">
        <div className="relative min-w-0 flex-1">
          {form(false)}
          {dropdown('absolute left-0 top-12 z-30 w-full overflow-hidden rounded-xl bg-white py-2 shadow-[0_4px_32px_rgba(0,0,0,0.2)] dark:bg-[#212121]')}
        </div>
        {micBtn}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0 md:w-44 md:justify-end">
        <button aria-label="Tìm kiếm" onClick={() => { setMSearch(true); setOpen(true); }} className={`${roundBtn} md:hidden`}>
          <Icon name="search" />
        </button>
        <button aria-label="Đổi giao diện sáng/tối" title={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} onClick={toggleTheme} className={roundBtn}>
          <Icon name={dark ? 'sun' : 'moon'} />
        </button>
      </div>

      {/* Điện thoại: bấm biểu tượng tìm kiếm thì thanh tìm kiếm phủ kín header */}
      {mSearch && (
        <div ref={boxM} className="absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-2 bg-white px-2 dark:bg-[#0f0f0f] md:hidden">
          <button aria-label="Quay lại" onClick={() => { setMSearch(false); setOpen(false); }} className={roundBtn}><Icon name="back" /></button>
          <div className="min-w-0 flex-1">{form(true)}</div>
          {micBtn}
          {dropdown('absolute inset-x-0 top-full z-30 max-h-[calc(100vh-3.5rem)] overflow-y-auto bg-white py-2 shadow-lg dark:bg-[#212121]')}
        </div>
      )}
    </header>
  );
}
