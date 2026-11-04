'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import Icon from './Icon';
import { COOKIE, ENABLED } from '@/lib/sources';
import AdultBadge from './AdultBadge';

// Mục cố định; các mục "loại" (Phim bộ, Phim lẻ, Hôm nay...) do từng nguồn khai báo (adapter.feeds)
const navOf = (feeds) => [
  ['/', 'Trang chủ', 'home'],
  ...feeds.map((f) => [`/?feed=${encodeURIComponent(f.id)}`, f.label, f.icon || 'playlist']),
  null,
  ['/da-xem', 'Video đã xem', 'history'],
  ['/xem-sau', 'Xem sau', 'watchlater'],
];

// Màn hình rộng: cột bên trái (đầy đủ hoặc thu gọn). Màn hình nhỏ: ngăn kéo mở bằng nút ba gạch.
export default function Sidebar({ src, feeds = [], mini, drawer, hideRail, onClose }) {
  const NAV = navOf(feeds);
  const path = usePathname();
  const params = useSearchParams();
  const active = (href) => {
    const [p, qs] = href.split('?');
    if (path !== p) return false;
    return p !== '/' || (params.get('feed') || '') === (new URLSearchParams(qs).get('feed') || '');
  };

  useEffect(() => { onClose?.(); }, [path, params.toString()]);
  useEffect(() => {
    if (!drawer) return;
    const esc = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [drawer]);

  const items = (isMini, close) =>
    NAV.map((n, k) =>
      n ? (
        <Link key={n[0]} href={n[0]} onClick={close}
          className={`${isMini ? 'flex h-[74px] flex-col items-center justify-center gap-1.5 text-[10px]' : 'flex h-10 items-center gap-6 px-3 text-sm'} rounded-[10px] transition active:scale-[0.98] ${active(n[0]) ? 'bg-black/10 font-medium dark:bg-white/15' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>
          <Icon name={n[2]} />
          <span className="max-w-full truncate">{n[1]}</span>
        </Link>
      ) : (
        <hr key={k} className="my-2 border-black/10 dark:border-white/15" />
      )
    );

  // Đổi nguồn: lưu cookie rồi tải lại để server render theo nguồn mới.
  // Loại / thể loại / quốc gia / năm là của riêng từng nguồn nên không mang sang nguồn mới (về trang chủ);
  // đang xem phim cũng về trang chủ (phim đó chưa chắc có ở nguồn kia). Tìm kiếm thì giữ từ khóa.
  const pick = (id) => {
    if (id === src) return;
    document.cookie = `${COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
    const qs = params.toString();
    window.location.assign(path === '/search' ? path + (qs ? `?${qs}` : '') : path === '/da-xem' || path === '/xem-sau' ? path : '/');
  };

  const picker = (isMini) => (
    <div role="group" aria-label="Nguồn phim">
      <hr className="my-2 border-black/10 dark:border-white/15" />
      {!isMini && <p className="px-3 pb-1 pt-1 text-xs font-medium text-neutral-500">Nguồn phim</p>}
      {ENABLED.map((s) => (
        <button key={s.id} type="button" title={s.adult ? `${s.name} (18+)` : s.name} aria-label={s.adult ? `${s.name}, nội dung 18+` : s.name}
          aria-pressed={s.id === src} onClick={() => pick(s.id)}
          className={`relative ${isMini ? 'flex h-10 w-full items-center justify-center text-xs font-medium' : 'flex h-10 w-full items-center gap-3 px-3 text-sm'} rounded-[10px] transition active:scale-[0.98] ${s.id === src ? 'bg-black/10 font-medium dark:bg-white/15' : 'hover:bg-black/5 dark:hover:bg-white/10'}`}>
          {isMini ? (
            // Thanh thu gọn (và màn hình nhỏ) chỉ hiện logo; chưa có logo thì rơi về mã chữ. Nguồn 18+ có nhãn nhỏ ở góc
            <>
              {s.logo ? (
                <img src={s.miniLogo || s.logo} alt={s.name} draggable={false} className="h-auto max-h-[18px] w-auto max-w-[56px] select-none object-contain" />
              ) : (
                s.short
              )}
              {s.adult && <AdultBadge className="absolute right-0.5 top-0.5 !px-1 !py-px !text-[8px]" />}
            </>
          ) : (
            <>
              <span className="flex min-w-0 items-center gap-2">
                {s.logo && (
                  // Logo rộng tối đa 60px, đặt trên nền mờ (cùng màu với chip ở FilterBar) để nổi bật cả sáng lẫn tối
                  <span className="flex h-7 w-[68px] shrink-0 items-center justify-center rounded-md bg-black/5 p-1 dark:bg-white/10">
                    <img src={s.logo} alt="" draggable={false} className="max-h-full max-w-full select-none object-contain" />
                  </span>
                )}
                {/* Từ tablet trở xuống (dưới 1024px) chỉ hiện logo + badge */}
                <span className={`truncate ${s.logo ? 'hidden lg:inline' : ''}`}>{s.name}</span>
                {s.adult && <AdultBadge />}
              </span>
            </>
          )}
        </button>
      ))}
    </div>
  );

  return (
    <>
      {!hideRail && (
      <aside className={`sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col gap-1 overflow-y-auto transition-[width] duration-200 md:flex ${mini ? 'w-[72px] px-1' : 'w-60 px-3'}`}>
        {items(mini)}
        {picker(mini)}
      </aside>
      )}
      {drawer && (
        <div className={`fixed inset-0 z-40 ${hideRail ? '' : 'md:hidden'}`}>
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <aside className="slide-in absolute left-0 top-0 flex h-full w-64 flex-col gap-1 overflow-y-auto bg-white p-3 shadow-xl dark:bg-[#0f0f0f]">
            <div className="mb-2 flex h-10 items-center gap-2">
              <button aria-label="Đóng menu" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/10 dark:hover:bg-white/10">
                <Icon name="menu" />
              </button>
              <span className="text-lg font-bold">PhimTube</span>
            </div>
            {items(false, onClose)}
            {picker(false)}
          </aside>
        </div>
      )}
    </>
  );
}
