import React from 'react';
import { log } from '../lib/log';
import { reportError } from '../lib/errorReport';

const elog = log('error-boundary');

// A page's code is fetched when the page is first opened. After a deploy, a
// tab opened before it asks for files that no longer exist, and the import
// fails. Reloading picks up the new files, so that one case reloads by itself,
// at most once a minute so a real outage cannot loop.
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|ChunkLoadError/i;
const RELOADED_AT = 'zk-chunk-reload-at';

function reloadForNewVersion(error: Error): boolean {
  if (!CHUNK_ERROR.test(String(error?.message ?? error))) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch { return false; }
  window.location.reload();
  return true;
}

interface Props {
  children: React.ReactNode;
  // No @types/react in this repo, so JSX's special `key` prop isn't known
  // to TS for class components - declared explicitly so `key={...}` usage
  // (remounting the boundary on route change) type-checks.
  key?: React.Key;
}

interface State {
  hasError: boolean;
}

// Catches render-time crashes anywhere in the tree below it so one broken
// component (e.g. a hook-order bug) can't blank the entire site. Without
// this, React unmounts the whole app on an uncaught render error.
//
// Written with an explicit constructor (rather than relying on inherited
// `this.props`/`this.state` typing) because this repo has no @types/react
// installed - React resolves as `any`, so a class extending React.Component
// gets no inherited member types from TS's point of view.
export class ErrorBoundary extends React.Component<Props, State> {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);
    this.props = props;
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (reloadForNewVersion(error)) return;
    elog.error('render crash caught', error, info.componentStack);
    reportError('react', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8 px-4 text-center">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Something went wrong</h1>
          <p className="max-w-md text-sm">
            This page did not load properly. Please reload.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-black px-12 py-5 text-xs font-black uppercase tracking-[0.4em] text-white hover:bg-zinc-800"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
