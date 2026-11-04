import { source } from '@/lib/adapters';
import { resolveSource } from '@/lib/current';

// Gợi ý phim khi gõ ở thanh tìm kiếm (theo nguồn đang duyệt)
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const q = (p.get('q') || '').trim();
  if (!q) return Response.json({ items: [] });
  try {
    const { items } = await source(resolveSource(p.get('src'))).search(q, 1, 6);
    return Response.json({
      items: items.slice(0, 6).map(({ src, slug, title, year, poster, isSeries }) => ({ src, slug, title, year, poster, isSeries })),
    });
  } catch {
    return Response.json({ items: [] });
  }
}
