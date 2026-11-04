'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

// Thông báo lỗi tải dữ liệu từ nguồn, có nút thử lại (render lại trang phía server)
export default function ErrorState({ message = 'Có lỗi xảy ra.' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="mt-16 flex flex-col items-center gap-3 px-4 text-center">
      <p className="max-w-sm text-neutral-600 dark:text-neutral-400">{message}</p>
      <button disabled={pending} onClick={() => start(() => router.refresh())}
        className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
        {pending ? 'Đang tải…' : 'Thử lại'}
      </button>
    </div>
  );
}
