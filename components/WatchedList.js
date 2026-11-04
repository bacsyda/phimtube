'use client';
import { useEffect, useState } from 'react';
import MovieCard from './MovieCard';
import { getHistory, clearHistory } from '@/lib/history';
import { SOURCES, srcId } from '@/lib/sources';

// Lịch sử xem: mặc định chỉ hiện phim của nguồn đang chọn (mỗi nguồn là một "ruột" riêng), có nút xem cả nguồn khác
export default function WatchedList({ src }) {
  const [all, setAll] = useState(null); // null: chưa đọc localStorage
  const [showAll, setShowAll] = useState(false);
  const load = () => setAll(Object.values(getHistory()).filter((h) => h.m).sort((a, b) => b.at - a.at).map((h) => h.m));
  useEffect(load, []);

  const mine = (all || []).filter((m) => srcId(m.src) === src);
  const others = (all || []).length - mine.length;
  const items = showAll ? all : mine;
  const btn = 'rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10';

  return (
    <div className="pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Video đã xem <span className="text-base font-normal text-neutral-500">{showAll ? '• mọi nguồn' : `• ${SOURCES[src].name}`}</span></h1>
        <div className="flex gap-1">
          {(others > 0 || showAll) && <button className={btn} onClick={() => setShowAll((v) => !v)}>{showAll ? `Chỉ ${SOURCES[src].name}` : `Hiện cả nguồn khác (${others})`}</button>}
          {items?.length > 0 && (
            <button className={btn} onClick={() => { clearHistory(showAll ? undefined : src); load(); }}>
              {showAll ? 'Xóa lịch sử xem' : `Xóa lịch sử ${SOURCES[src].name}`}
            </button>
          )}
        </div>
      </div>
      {items && !items.length && <p className="text-neutral-500">Chưa có phim nào trong lịch sử{showAll ? '' : ` của ${SOURCES[src].name}`}. Phim bạn xem sẽ xuất hiện ở đây.</p>}
      <div className="grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {(items || []).map((m) => <MovieCard key={`${m.src}:${m.slug}`} m={m} showSource={showAll} />)}
      </div>
    </div>
  );
}
