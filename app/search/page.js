import InfiniteGrid from '@/components/InfiniteGrid';
import ErrorState from '@/components/ErrorState';
import { source } from '@/lib/adapters';
import { currentSource } from '@/lib/current';

export const metadata = { title: 'Tìm kiếm' };

export default async function SearchPage({ searchParams }) {
  const q = (searchParams.q || '').trim();
  const src = currentSource();
  let r = null, failed = false;
  if (q) {
    try { r = await source(src).search(q); } catch (e) { console.error('[tìm kiếm]', e?.message); failed = true; }
  }
  const endpoint = `/api/search?src=${src}&q=${encodeURIComponent(q)}`;
  return (
    <div className="pt-3">
      {q ? <h1 className="mb-2 text-lg">Kết quả cho “{q}”</h1> : <p className="mt-10 text-center text-neutral-500">Nhập từ khóa để tìm phim.</p>}
      {failed ? (
        <ErrorState message="Không tìm kiếm được lúc này. Máy chủ nguồn có thể đang bận." />
      ) : q ? (
        <InfiniteGrid key={endpoint} initial={r?.items || []} totalPages={r?.pagination.totalPages || 1} endpoint={endpoint} />
      ) : null}
    </div>
  );
}
