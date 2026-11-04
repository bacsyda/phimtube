// Chỉ dùng phía server: đọc nguồn đang duyệt từ cookie
import { cookies } from 'next/headers';
import { COOKIE, srcId } from './sources';

export const currentSource = () => srcId(cookies().get(COOKIE)?.value);
// Tham số ?src= nếu hợp lệ, không thì dùng cookie (cho các API route)
export const resolveSource = (param) => srcId(param || cookies().get(COOKIE)?.value);
