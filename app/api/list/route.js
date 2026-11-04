import { source, readQuery, listArgs } from '@/lib/adapters';
import { resolveSource } from '@/lib/current';

// Trang kế tiếp của danh sách (kéo vô hạn ở trang chủ). Loại + bộ lọc đọc theo đúng những gì nguồn có.
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  try {
    const S = source(resolveSource(p.get('src')));
    const r = await S.list(Number(p.get('page')) || 1, listArgs(readQuery(S, (k) => p.get(k))));
    return Response.json({ items: r.items, totalPages: r.pagination.totalPages });
  } catch {
    return Response.json({ items: [], totalPages: 1, error: true }, { status: 502 });
  }
}
