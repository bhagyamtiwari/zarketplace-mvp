// What a page shows while it waits, and when waiting has gone wrong.
//
// A spinner on its own never admits defeat: on a dropped connection or a
// stalled request it spins forever over a blank page. This one gives up
// politely after a while and says to reload, and LoadError is the one message
// every page uses when the database or the network has actually failed.
import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { ui } from '../lib/ui';
import { cn } from '../lib/utils';

/** How long before a wait counts as stuck. */
const SLOW_MS = 10_000;

function ReloadButton() {
  return (
    <button type="button" onClick={() => window.location.reload()} className={cn(ui.btnPrimary, 'self-center')}>
      Reload
    </button>
  );
}

export function Loading({ className, iconClassName = 'h-6 w-6', delayMs = 0 }: {
  className?: string;
  iconClassName?: string;
  /** Show nothing at first, so a quick load does not flash a spinner. */
  delayMs?: number;
}) {
  const [visible, setVisible] = React.useState(delayMs === 0);
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    const show = delayMs > 0 ? setTimeout(() => setVisible(true), delayMs) : undefined;
    const stuck = setTimeout(() => setSlow(true), SLOW_MS);
    return () => { if (show) clearTimeout(show); clearTimeout(stuck); };
  }, [delayMs]);

  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center justify-center gap-5 px-4 text-center', className)}>
      {visible && !slow && (
        <>
          <Loader2 aria-hidden className={cn(iconClassName, 'animate-spin')} />
          <span className="sr-only">Loading</span>
        </>
      )}
      {slow && (
        <>
          <p className="text-sm">This is taking longer than usual. Please reload.</p>
          <ReloadButton />
        </>
      )}
    </div>
  );
}

/** A request failed: say so plainly, never as an empty page or "not found". */
export function LoadError({ message = 'We could not load this page.', className }: { message?: string; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-5 px-4 text-center', className)}>
      <p className="text-sm font-bold">{message} Please reload.</p>
      <ReloadButton />
    </div>
  );
}
