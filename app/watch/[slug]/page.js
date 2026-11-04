import { notFound } from 'next/navigation';
import Watch from '@/components/Watch';
import ErrorState from '@/components/ErrorState';
import { source } from '@/lib/adapters';
import { NotFound } from '@/lib/adapters';
import { srcId } from '@/lib/sources';

// Tiêu đề tab theo tên phim (detail() được Next gộp chung một lần gọi với trang bên dưới)
export async function generateMetadata({ params, searchParams }) {
  try {
    const m = await source(srcId(searchParams.src)).detail(params.slug);
    return { title: m.title, description: m.desc.slice(0, 160) };
  } catch {
    return {};
  }
}

export default async function WatchPage({ params, searchParams }) {
  // Link xem phim luôn mang ?src=; link cũ không có thì hiểu là KKPhim
  const S = source(srcId(searchParams.src));
  let m;
  try {
    m = await S.detail(params.slug);
  } catch (e) {
    if (e instanceof NotFound) notFound();
    return <ErrorState message="Không tải được thông tin phim. Máy chủ nguồn có thể đang bận, hãy thử lại." />;
  }

  // Bên phải: phim cùng thể loại (tối đa 2 thể loại đầu); bên dưới trình phát: phim mới cập nhật
  const empty = { items: [] };
  const [latest, ...byGenre] = await Promise.all([
    S.list(1).catch(() => empty),
    ...m.genreSlugs.slice(0, 2).map((g) => S.list(1, { filters: { genre: g } }).catch(() => empty)),
  ]);
  const uniq = (arr) => {
    const seen = new Set([m.slug]);
    return arr.filter((x) => !seen.has(x.slug) && seen.add(x.slug));
  };
  const related = uniq(byGenre.flatMap((r) => r.items)).slice(0, 12);
  const latestItems = uniq(latest.items).slice(0, 12);

  return <Watch m={m} tap={searchParams.tap} related={related} latest={latestItems} />;
}
