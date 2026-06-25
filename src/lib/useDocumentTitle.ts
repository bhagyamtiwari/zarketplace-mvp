// Sets a unique document title per page. The app has a single static
// <title> in index.html shared across every route; this hook overrides it
// on mount so each page is distinguishable in browser tabs, history, and
// bookmarks, and restores the default on unmount.
import { useEffect } from 'react';

const DEFAULT_TITLE = 'zarketplace - secondhand fashion resale buy and sell';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | zarketplace`;
    return () => {
      document.title = previous || DEFAULT_TITLE;
    };
  }, [title]);
}
