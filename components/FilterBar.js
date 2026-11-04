'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from './Icon';

// Thanh lọc không biết trước có những bộ lọc nào: mọi thứ lấy từ nguồn đang chọn.
//   feeds   : các "loại" của nguồn (Phim bộ, Phim lẻ, Hôm nay...), khoá URL là `feed`
//   filters : [{ key, label, options: [{ value, label }], searchable }] lấy từ API của nguồn
//   exclusive: nguồn không kết hợp được nhiều bộ lọc → chọn một cái thì bỏ các cái khác
//   cur     : giá trị đang chọn { feed, genre, country, year... }
const pill = 'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium';
const idle = 'bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20';
const on = 'bg-black text-white dark:bg-white dark:text-black';
const SHOWN = 80; // nhóm dài chỉ vẽ tối đa chừng này mục, còn lại tìm bằng ô nhập

const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();

function makeHref(cur, exclusive) {
  return (patch) => {
    const p = { ...cur, ...patch };
    const [k, v] = Object.entries(patch)[0] || [];
    if (exclusive && v) for (const o of Object.keys(p)) if (o !== k) p[o] = '';
    const qs = Object.entries(p).filter(([, x]) => x).map(([a, x]) => `${a}=${encodeURIComponent(x)}`).join('&');
    return qs ? `/?${qs}` : '/';
  };
}

function Group({ title, list, k, cur, href, searchable }) {
  const [q, setQ] = useState('');
  const shown = q ? list.filter((x) => fold(x.label).includes(fold(q))) : list;
  // Mục đang chọn luôn hiện, dù nằm ngoài phần được vẽ
  const picked = list.find((x) => x.value === cur[k]);
  const cut = shown.slice(0, SHOWN);
  if (picked && !cut.includes(picked)) cut.unshift(picked);
  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {searchable && (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Tìm trong ${list.length} mục`}
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 sm:max-w-xs" />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {cut.map((x) => (
          <Link key={x.value} href={href({ [k]: cur[k] === x.value ? '' : x.value })} className={`${pill} ${cur[k] === x.value ? on : idle}`}>{x.label}</Link>
        ))}
        {shown.length > cut.length && <span className="px-1 py-1.5 text-sm text-neutral-500">…còn {shown.length - cut.length} mục, gõ để tìm</span>}
        {!shown.length && <span className="py-1.5 text-sm text-neutral-500">Không có mục nào khớp.</span>}
      </div>
    </div>
  );
}

export default function FilterBar({ feeds = [], filters = [], exclusive = false, cur }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const href = makeHref(cur, exclusive);
  const keys = Object.keys(cur);
  const n = keys.filter((k) => cur[k]).length;
  const clearAll = Object.fromEntries(keys.map((k) => [k, '']));
  const genre = filters.find((f) => f.key === 'genre'); // hàng nút nhanh phía trên

  return (
    <div ref={box} className="sticky top-14 z-10 bg-white dark:bg-[#0f0f0f]">
      <div className="flex gap-3 overflow-x-auto py-3">
        <button onClick={() => setOpen(!open)} className={`${pill} flex items-center gap-1.5 ${open || n ? on : idle}`}>
          <Icon name="tune" size={18} />Bộ lọc{n ? ` (${n})` : ''}
        </button>
        {genre && <Link href={href({ genre: '' })} className={`${pill} ${!cur.genre ? on : idle}`}>Tất cả</Link>}
        {genre?.options.slice(0, 14).map((g) => (
          <Link key={g.value} href={href({ genre: g.value })} className={`${pill} ${cur.genre === g.value ? on : idle}`}>{g.label}</Link>
        ))}
      </div>
      {open && (
        <div className="absolute inset-x-0 top-full max-h-[60vh] space-y-5 overflow-y-auto rounded-xl bg-white p-5 shadow-[0_4px_32px_rgba(0,0,0,0.2)] dark:bg-[#212121]">
          {feeds.length > 0 && <Group title="Danh mục" list={feeds.map((f) => ({ value: f.id, label: f.label }))} k="feed" cur={cur} href={href} />}
          {filters.map((f) => <Group key={f.key} title={f.label} list={f.options} k={f.key} cur={cur} href={href} searchable={f.searchable} />)}
          {!feeds.length && !filters.length && <p className="text-sm text-neutral-500">Nguồn này không có bộ lọc.</p>}
          {n > 0 && <Link href={href(clearAll)} className="inline-block text-sm font-medium text-blue-600 dark:text-blue-400">Xóa bộ lọc</Link>}
        </div>
      )}
    </div>
  );
}
