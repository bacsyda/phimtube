import LaterList from '@/components/LaterList';
import { currentSource } from '@/lib/current';

export default function Later() {
  return <LaterList src={currentSource()} />;
}
