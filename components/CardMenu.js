'use client';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { isLater, toggleLater, setHidden } from '@/lib/history';
import { watchHref } from '@/lib/util';

export default function CardMenu({ m, onHide, onToggle }) {
  const [open, setOpen] = useState(false);
  const [later, setLater] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef(null);
  useEffect(() => { onToggle?.(open); }, [open]);

  // Mở menu: đọc trạng thái Xem sau; bấm ra ngoài thì đóng
  useEffect(() => {
    if (!open) return;
    setLater(isLater(m));
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const item = 'flex h-10 w-full items-center gap-4 px-4 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10';

  const share = () => {
    navigator.clipboard?.writeText(`${location.origin}${watchHref(m.src, m.slug)}`);
    setCopied(true);
    setTimeout(() => { setCopied(false); setOpen(false); }, 1200);
  };

  return (
    <div ref={box} className="relative -mr-2 shrink-0">
      <button aria-label="Thao tác" onClick={() => setOpen(!open)}
        className={`grid h-10 w-10 place-items-center rounded-full transition-opacity hover:bg-black/10 dark:hover:bg-white/10 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${open ? 'bg-black/10 !opacity-100 dark:bg-white/10' : ''}`}>
        <Icon name="more" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-64 rounded-xl bg-white py-2 shadow-[0_4px_32px_rgba(0,0,0,0.2)] dark:bg-[#282828]">
          <button className={item} onClick={() => { toggleLater(m); setOpen(false); }}>
            <Icon name="watchlater" />{later ? 'Bỏ khỏi danh sách Xem sau' : 'Lưu vào danh sách Xem sau'}
          </button>
          <button className={item} onClick={share}>
            <Icon name="share" className="-scale-x-100" />{copied ? 'Đã sao chép liên kết' : 'Chia sẻ'}
          </button>
          <button className={item} onClick={() => { setHidden(m, true); setOpen(false); onHide(); }}>
            <Icon name="block" />Không quan tâm
          </button>
        </div>
      )}
    </div>
  );
}
