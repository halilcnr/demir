import { LiveCommandCenter } from '@/components/live-command-center';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function LiveEnginePage() {
  return <LiveCommandCenter />;
}
