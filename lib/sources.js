// Danh sách nguồn phim (chỉ cấu hình, không chứa logic đọc dữ liệu).
// Logic đọc/chuẩn hóa dữ liệu của từng nguồn nằm ở lib/adapters/.
// Thêm nguồn mới: thêm một mục ở đây + một adapter (hoặc một mục CFG trong adapters/kk.js nếu cùng kiểu).
//
//   adapter : 'kk' (họ KKPhim/OPhim: items + pagination) | 'topxx' (kiểu Laravel: data + meta)
//   kinds   : loại phim nguồn có. ['single'] = chỉ phim lẻ → UI không hiện tập, tự chuyển tập, lọc theo loại.
//   alt     : false = không tham gia "Thử nguồn khác" (không tìm sang, không được tìm tới).
//   logo    : ảnh logo hiện ở mục "Nguồn phim" (đặt trong public/sources/); không có thì hiện tên chữ.
//   miniLogo: logo riêng cho thanh bên thu gọn (rất hẹp); không có thì dùng `logo`.
//   adult   : true = nguồn có nội dung 18+, hiện nhãn đỏ "18+" cạnh nguồn (chỉ để hiển thị).
//   preview : false = nguồn chỉ có link embed (không có m3u8) nên bỏ qua xem trước khi rê chuột.
//   referer : gửi kèm khi proxy video (để trống = không gửi). Có thể đổi địa chỉ bằng biến môi trường <ID>_API / <ID>_IMG.
export const DEFAULT_SOURCE = 'kkphim';
export const COOKIE = 'phimtube-src'; // cookie lưu nguồn đang duyệt

const url = (key, fallback) => (process.env[key] || fallback).replace(/\/+$/, '');

export const SOURCES = {
  kkphim: {
    id: 'kkphim', name: 'KKPhim', short: 'KK', adapter: 'kk', kinds: ['series', 'single'], logo: '/sources/kkphim.png', miniLogo: '/sources/kkphim-icon.png', // logo ngang quá dài cho thanh thu gọn nên dùng riêng biểu tượng clapper
    api: url('KKPHIM_API', 'https://phimapi.com'),
    img: url('KKPHIM_IMG', 'https://phimimg.com'),
    referer: '',
  },
  vsmov: {
    id: 'vsmov', name: 'VSMov', short: 'VM', adapter: 'kk', kinds: ['series', 'single'], logo: '/sources/vsmov.png',
    api: url('VSMOV_API', 'https://vsmov.com/api'),
    img: url('VSMOV_IMG', 'https://vsmov.com'),
    referer: 'https://vsmov.com/',
    preview: false, // chỉ có link embed
  },
  vsphim: {
    id: 'vsphim', name: 'VSPhim', short: 'VP', adapter: 'kk', kinds: ['single'], logo: '/sources/vsphim.png', adult: true,
    api: url('VSPHIM_API', 'https://nguon.vsphim.com/api'), // lưu ý: bỏ "/api" là 404
    img: url('VSPHIM_IMG', 'https://nguon.vsphim.com'),
    referer: 'https://nguon.vsphim.com/',
    preview: false, alt: false,
  },
  topxx: {
    id: 'topxx', name: 'TOPXX', short: 'TX', adapter: 'topxx', kinds: ['single'], logo: '/sources/topxx.png', adult: true,
    api: url('TOPXX_API', 'https://topxx.vip/api/v1'), // phải có "/v1"
    img: url('TOPXX_IMG', 'https://topxx.vip'),
    referer: 'https://topxx.vip/',
    timeout: 20000, // máy chủ này chậm (tìm kiếm từng mất ~7s)
    preview: false, alt: false,
  },
};

// Nguồn đang bật (hiện trong nút chọn nguồn)
export const ENABLED = Object.values(SOURCES).filter((s) => s.enabled !== false);

// Giá trị lạ / thiếu / nguồn đang tắt thì quay về nguồn mặc định
export const srcId = (id) =>
  typeof id === 'string' && Object.prototype.hasOwnProperty.call(SOURCES, id) && SOURCES[id].enabled !== false ? id : DEFAULT_SOURCE;
