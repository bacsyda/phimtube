'use client';
import { Suspense, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Header from './Header';
import Sidebar from './Sidebar';

export default function Shell({ children, src, feeds = [] }) {
  const path = usePathname();
  const watch = !!path?.startsWith('/watch'); // trang xem phim: ẩn cột trái, chỉ mở bằng ngăn kéo
  const [mini, setMini] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { setMini(localStorage.getItem('phimtube-mini') === '1'); }, []);

  const toggle = () => {
    if (!watch && window.matchMedia('(min-width: 768px)').matches) {
      setMini((v) => { localStorage.setItem('phimtube-mini', v ? '0' : '1'); return !v; });
    } else setDrawer(true);
  };

  return (
    <>
      <Header onMenu={toggle} />
      <div className="flex">
        <Suspense fallback={null}>
          <Sidebar src={src} feeds={feeds} mini={mini} drawer={drawer} hideRail={watch} onClose={() => setDrawer(false)} />
        </Suspense>
        <main className="min-w-0 flex-1 px-3 pb-10 sm:px-6">{children}</main>
      </div>
    </>
  );
}
