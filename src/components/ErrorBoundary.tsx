import React from 'react';
import { log } from '../lib/log';

const elog = log('error-boundary');

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
    elog.error('render crash caught', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8 px-4 text-center">
          <h1 className="text-3xl font-black uppercase tracking-tighter">Something went wrong</h1>
          <p className="max-w-md text-xs font-bold uppercase tracking-widest text-black/60">
            This page hit an unexpected error. Refreshing usually fixes it.
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
