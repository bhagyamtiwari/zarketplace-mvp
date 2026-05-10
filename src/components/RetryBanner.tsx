// Reusable "facing issues? tap to reload" banner. Pages mount it with an
// 8-second `delayMs` so it only appears when the page actually feels stuck.

import * as React from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  show?: boolean;
  delayMs?: number;
  onRetry?: () => void;
  message?: string;
}

export function RetryBanner({ show = true, delayMs = 0, onRetry, message }: Props) {
  const [visible, setVisible] = React.useState(delayMs === 0);

  React.useEffect(() => {
    if (delayMs === 0) return;
    const t = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  if (!show || !visible) return null;

  const handle = () => {
    if (onRetry) onRetry();
    else window.location.reload();
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-black text-white px-5 py-3 flex items-center gap-3 shadow-lg">
      <span className="text-[10px] font-black uppercase tracking-widest">
        {message ?? 'Facing issues?'}
      </span>
      <button
        onClick={handle}
        className="inline-flex items-center gap-2 bg-white text-black px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200"
      >
        <RefreshCw className="h-3 w-3" /> Tap to reload
      </button>
    </div>
  );
}
