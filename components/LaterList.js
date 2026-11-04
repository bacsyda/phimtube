'use client';
import { useEffect, useState } from 'react';
import MovieCard from './MovieCard';
import { getLater } from '@/lib/history';
import { SOURCES, srcId } from '@/lib/sources';

// Xem sau: mặc định chỉ hiện phim của nguồn đang chọn, có nút xem cả nguồn khác
export default function LaterList({ src }) {
  const [all, setAll] = useState(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    const load = () => setAll(getLater());
    load();
    window.addEventListener('phimtube-later', load);
    return () => window.removeEventListener('phimtube-later', load);
  }, []);

  const mine = (all || []).filter((m) => srcId(m.src) === src);
  const others = (all || []).length - mine.length;
  const items = showAll ? all : mine;

  return (
    <div className="pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Xem sau <span className="text-base font-normal text-neutral-500">{showAll ? '• mọi nguồn' : `• ${SOURCES[src].name}`}</span></h1>
        {(others > 0 || showAll) && (
          <button className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Chỉ ${SOURCES[src].name}` : `Hiện cả nguồn khác (${others})`}
          </button>
        )}
      </div>
      {items && !items.length && (
        <p className="text-neutral-500">Chưa có phim nào{showAll ? '' : ` của ${SOURCES[src].name}`}. Bấm nút ba chấm trên thẻ phim và chọn “Lưu vào danh sách Xem sau”.</p>
      )}
      <div className="grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {(items || []).map((m) => <MovieCard key={`${m.src}:${m.slug}`} m={m} showSource={showAll} />)}
      </div>
    </div>
  );
}
