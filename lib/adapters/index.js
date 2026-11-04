// Cửa vào duy nhất của lớp dữ liệu: source('vsmov').list(...). Giao diện chỉ làm việc với "mô hình chuẩn"
// mà adapter trả về, không biết nguồn nào có trường gì.
//
// Giao diện một adapter:
//   id, kinds, feeds[{id,label,icon}], filterKeys[], exclusive   — thông tin tĩnh, dùng được ngay (không gọi mạng)
//   list(page, { feed, filters })    → { items, pagination: { page, totalPages } }
//   search(keyword, page, limit)     → như trên
//   detail(slug)                     → Card + { desc, time, actors, directors, genres, genreSlugs, countries, servers }
//   catalog()                        → { filters: [{ key, label, options: [{ value, label }], searchable }] }
// Card: { src, slug, title, original, year, cover, poster, country[], lang, quality, episode, duration, kind, isSeries }
// (`slug` là mã phim dạng chuỗi mờ: slug với KKPhim/VSMov/VSPhim, `code` với TOPXX.)
import { SOURCES, srcId } from '../sources.js';
import { createKK } from './kk.js';
import { createTopxx } from './topxx.js';

export { NotFound } from './common.js';

const made = new Map();
// Lấy adapter của một nguồn (id lạ / thiếu thì dùng nguồn mặc định)
export function source(id) {
  const k = srcId(id);
  if (!made.has(k)) made.set(k, SOURCES[k].adapter === 'topxx' ? createTopxx(k) : createKK(k));
  return made.get(k);
}

// Đọc loại + bộ lọc từ query string theo đúng những gì nguồn có. get: (khoá) => giá trị.
// Giá trị không thuộc nguồn này bị bỏ; nguồn không kết hợp được bộ lọc thì chỉ giữ một giá trị (ưu tiên loại).
export function readQuery(S, get) {
  const cur = { feed: '' };
  for (const k of S.filterKeys) cur[k] = '';
  const feed = String(get('feed') || '');
  if (S.feeds.some((f) => f.id === feed)) cur.feed = feed;
  for (const k of S.filterKeys) cur[k] = String(get(k) || '').slice(0, 120);
  if (S.exclusive) {
    const first = Object.keys(cur).find((k) => cur[k]);
    for (const k of Object.keys(cur)) if (k !== first) cur[k] = '';
  }
  return cur;
}
export const listArgs = ({ feed, ...filters }) => ({ feed, filters });
