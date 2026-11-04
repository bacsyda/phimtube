'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getProgress, isHidden } from '@/lib/history';
import { watchHref } from '@/lib/util';
import Icon from './Icon';
import CardMenu from './CardMenu';

// Thẻ gọn kiểu danh sách đề xuất của YouTube: ảnh nhỏ bên trái, chữ bên phải
export default function RelatedCard({ m }) {
  const [href, setHref] = useState(watchHref(m.src, m.slug));
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const h = getProgress(m);
    if (m.isSeries && h?.ep) setHref(watchHref(m.src, m.slug, h.ep));
    setGone(isHidden(m));
  }, [m]);
  if (gone) return null;

  const badge = m.isSeries ? m.episode || 'Phim bộ' : m.duration || m.quality;
  return (
    <div className="group relative flex gap-2">
      <Link href={href} className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-800">
        <img src={m.cover} alt={m.title} loading="lazy" className="h-full w-full object-cover" />
        {badge && (
          <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/80 px-1 py-[2px] text-[11px] font-medium text-white">
            {m.isSeries && <Icon name="playlist" size={14} />}
            {badge}
          </span>
        )}
      </Link>
      <Link href={href} className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm font-medium leading-5 text-[#0f0f0f] dark:text-white">{m.title}</h3>
        <p className="mt-1 text-xs leading-[18px] text-[#606060] dark:text-[#aaa]">{[m.year, (m.country || []).slice(0, 2).join(', ')].filter(Boolean).join(' • ')}</p>
        <p className="text-xs leading-[18px] text-[#606060] dark:text-[#aaa]">{[m.isSeries ? 'Phim bộ' : 'Phim lẻ', m.lang].filter(Boolean).join(' • ')}</p>
      </Link>
      <CardMenu m={m} onHide={() => setGone(true)} />
    </div>
  );
}
