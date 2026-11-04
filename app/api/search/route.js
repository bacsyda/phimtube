import { source } from '@/lib/adapters';
import { resolveSource } from '@/lib/current';

// Trang kế tiếp của kết quả tìm kiếm (kéo vô hạn)
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  try {
    const r = await source(resolveSource(p.get('src'))).search((p.get('q') || '').trim(), Number(p.get('page')) || 1);
    return Response.json({ items: r.items, totalPages: r.pagination.totalPages });
  } catch {
    return Response.json({ items: [], totalPages: 1, error: true }, { status: 502 });
  }
}
