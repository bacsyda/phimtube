import { ENABLED, SOURCES, srcId } from '@/lib/sources';
import { source } from '@/lib/adapters';

// Tìm cùng một phim ở các nguồn khác (khi link video nguồn hiện tại hỏng).
// Khớp theo tên gốc (hoặc tên Việt) và năm, nên chỉ trả kết quả chắc chắn đúng phim.
const norm = (s = '') =>
  String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '');

export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const from = srcId(p.get('src'));
  const title = (p.get('title') || '').trim().slice(0, 200);
  const original = (p.get('original') || '').trim().slice(0, 200);
  const year = (p.get('year') || '').trim();
  const keyword = original || title;
  if (!keyword || SOURCES[from].alt === false) return Response.json({ items: [] }); // nguồn tách riêng không tìm sang nguồn khác

  const want = [original, title].map(norm).filter(Boolean);
  const found = await Promise.all(
    ENABLED.filter((s) => s.alt !== false).map((s) => s.id).filter((id) => id !== from).map(async (id) => {
      try {
        const { items } = await source(id).search(keyword, 1, 24);
        const hit = items.find(
          (x) => (!year || !x.year || String(x.year) === year) && [x.original, x.title].map(norm).some((n) => n && want.includes(n)),
        );
        return hit ? { src: id, slug: hit.slug, title: hit.title, year: hit.year } : null;
      } catch {
        return null; // nguồn đó đang lỗi thì bỏ qua
      }
    }),
  );
  return Response.json({ items: found.filter(Boolean) }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
