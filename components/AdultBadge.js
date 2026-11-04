// Nhãn đỏ "18+" cho nguồn có nội dung người lớn (đặt `adult: true` trong lib/sources.js)
export default function AdultBadge({ className = '' }) {
  return (
    <span title="Nội dung 18+" className={`inline-flex shrink-0 items-center rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white ${className}`}>
      18+
    </span>
  );
}
