import { Suspense } from 'react';
import FilterBar from '@/components/FilterBar';
import InfiniteGrid from '@/components/InfiniteGrid';
import ErrorState from '@/components/ErrorState';
import { source, readQuery, listArgs } from '@/lib/adapters';
import { currentSource } from '@/lib/current';

// Nhóm lọc lấy từ API của nguồn và có thể chậm (TOPXX phải tải nhiều trang thể loại ở lần đầu),
// nên dựng riêng trong Suspense: danh sách phim hiện ngay, thanh lọc đầy đủ đến sau.
async function Filters({ S, cur }) {
  const { filters } = await S.catalog().catch((e) => { console.error('[catalog]', e?.message); return { filters: [] }; });
  return <FilterBar feeds={S.feeds} filters={filters} exclusive={S.exclusive} cur={cur} />;
}

export default async function Home({ searchParams }) {
  const src = currentSource();
  const S = source(src);
  // Chỉ nhận loại / bộ lọc mà nguồn đang chọn thực sự có
  const cur = readQuery(S, (k) => searchParams[k]);
  const res = await S.list(1, listArgs(cur)).catch((e) => { console.error('[trang chủ]', e?.message); return null; });
  const endpoint = `/api/list?${Object.entries({ src, ...cur }).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;

  return (
    <div>
      <Suspense fallback={<FilterBar feeds={S.feeds} filters={[]} exclusive={S.exclusive} cur={cur} />}>
        <Filters S={S} cur={cur} />
      </Suspense>
      {res ? (
        <InfiniteGrid key={endpoint} initial={res.items} totalPages={res.pagination.totalPages} endpoint={endpoint} />
      ) : (
        <ErrorState message="Không tải được danh sách phim từ nguồn. Máy chủ nguồn có thể đang bận hoặc mất kết nối." />
      )}
    </div>
  );
}
