import { source } from '@/lib/adapters';
import { srcId } from '@/lib/sources';

// Trả link m3u8 của tập đầu tiên để thẻ phim phát xem trước khi rê chuột
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  try {
    const d = await source(srcId(p.get('src'))).detail(p.get('slug'));
    const m3u8 = d.servers[0]?.episodes[0]?.m3u8 || '';
    return Response.json({ m3u8 }, { headers: { 'Cache-Control': 'public, max-age=600' } });
  } catch {
    return Response.json({ m3u8: '' });
  }
}
