// Tên tập từ API thường đã có chữ "Tập" ("Tập 01"), nên chỉ thêm tiền tố khi còn thiếu
export const epLabel = (name = '') => (/^\s*(tập|tap|ep|episode|phần|full)/i.test(name) ? String(name).trim() : `Tập ${name}`);

// Link trang xem phim luôn mang nguồn của phim (link chia sẻ vẫn đúng nguồn).
// Link cũ không có ?src= được hiểu là KKPhim.
export const watchHref = (src, slug, tap) =>
  `/watch/${slug}?src=${src || 'kkphim'}${tap ? `&tap=${encodeURIComponent(tap)}` : ''}`;
