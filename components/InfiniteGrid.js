'use client';
import { useEffect, useRef, useState } from 'react';
import MovieCard from './MovieCard';

// Lưới phim kéo vô hạn: cuộn gần cuối thì tải trang kế tiếp từ `endpoint` (?page=N)
export default function InfiniteGrid({ initial, totalPages, endpoint }) {
  const [items, setItems] = useState(initial);
  const [page, setPage] = useState(1);
  const [done, setDone] = useState(totalPages <= 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const end = useRef(null);

  const more = async () => {
    if (done || busy) return;
    setBusy(true);
    setError(false);
    try {
      // Trang đã lọc có thể rỗng: thử tiếp vài trang cho tới khi có phim mới
      let p = page, got = [], last = totalPages;
      for (let i = 0; i < 3 && !got.length; i++) {
        p += 1;
        const r = await fetch(`${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${p}`);
        const d = await r.json();
        if (!r.ok || d.error) throw new Error('upstream');
        last = d.totalPages || last;
        got = d.items || [];
        if (p >= last) break;
      }
      if (p >= last) setDone(true);
      setPage(p);
      setItems((cur) => {
        const seen = new Set(cur.map((x) => x.slug));
        return [...cur, ...got.filter((x) => !seen.has(x.slug))];
      });
    } catch {
      // Lỗi mạng / nguồn: giữ nguyên trang hiện tại, cho người dùng bấm thử lại
      setError(true);
    }
    setBusy(false);
  };

  // Mỗi lần tải xong thì quan sát lại; nếu mốc cuối vẫn trong tầm nhìn sẽ tải tiếp ngay
  useEffect(() => {
    if (done || busy || error || !end.current) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) more(); }, { rootMargin: '800px' });
    io.observe(end.current);
    return () => io.disconnect();
  }, [done, busy, error, page]);

  return (
    <>
      <div className="mt-2 grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((m) => <MovieCard key={m.slug} m={m} />)}
      </div>
      {!items.length && done && <p className="mt-10 text-center text-neutral-500">Không có phim nào để hiển thị.</p>}
      {error && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-neutral-600 dark:text-neutral-400">Không tải được thêm phim. Máy chủ nguồn có thể đang bận.</p>
          <button onClick={more} className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">Thử lại</button>
        </div>
      )}
      {!done && !error && (
        <div ref={end} className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-black/10 border-t-neutral-500 dark:border-white/10 dark:border-t-neutral-400" />
        </div>
      )}
    </>
  );
}
