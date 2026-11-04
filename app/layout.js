import './globals.css';
import { Roboto } from 'next/font/google';
import Shell from '@/components/Shell';
import { currentSource } from '@/lib/current';
import { source } from '@/lib/adapters';

const roboto = Roboto({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '700'], display: 'swap' });

export const metadata = {
  title: { default: 'PhimTube', template: '%s – PhimTube' },
  description: 'Xem phim online giao diện gọn nhẹ: tìm kiếm nhanh, xem trước, nhớ tập đang xem.',
};

// Chạy trước khi vẽ trang để áp dụng theme đã lưu (hoặc theo hệ thống), tránh bị chớp
const THEME_JS = "try{var t=localStorage.getItem('phimtube-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}";

export default function RootLayout({ children }) {
  const src = currentSource();
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        {/* Thêm vào Màn hình chính trên iOS: mở toàn màn hình, thanh trạng thái trong suốt */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script dangerouslySetInnerHTML={{ __html: THEME_JS }} />
      </head>
      <body className={roboto.className}>
        <Shell src={src} feeds={source(src).feeds}>{children}</Shell>
      </body>
    </html>
  );
}
