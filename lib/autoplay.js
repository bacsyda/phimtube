// Điện thoại: chỉ phát xem trước thẻ nằm trọn trong màn hình (thẻ trên cùng nếu có nhiều thẻ)
const items = new Map(); // phần tử ảnh -> { visible, set }
let io;

function pick() {
  let best = null, top = Infinity;
  for (const [el, it] of items) {
    if (!it.visible) continue;
    const t = el.getBoundingClientRect().top;
    if (t < top) { top = t; best = el; }
  }
  for (const [el, it] of items) it.set(el === best);
}

export function watchCard(el, set) {
  // rootMargin trừ phần header + thanh chip dính ở phía trên
  io ||= new IntersectionObserver((entries) => {
    for (const e of entries) {
      const it = items.get(e.target);
      if (it) it.visible = e.intersectionRatio >= 0.98;
    }
    pick();
  }, { threshold: [0, 0.5, 0.98, 1], rootMargin: '-112px 0px 0px 0px' });
  items.set(el, { visible: false, set });
  io.observe(el);
  return () => { io.unobserve(el); items.delete(el); pick(); };
}
