import WatchedList from '@/components/WatchedList';
import { currentSource } from '@/lib/current';

export default function Watched() {
  return <WatchedList src={currentSource()} />;
}
