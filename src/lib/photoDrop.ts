// Photos dragged in from a computer. Shared by the sell form and the admin
// listing editor.
//
// The drop is taken anywhere on the element `bind` is spread on, not only on
// an empty box, so a drop that lands a little off still counts. And while the
// hook is mounted, a drop anywhere else on the page does nothing: the
// browser's own response to a missed drop is to open the photo in place of
// the page, which throws away everything typed into the form.
import * as React from 'react';

const carriesFiles = (dt: DataTransfer | null) => !!dt && Array.from(dt.types).includes('Files');

/** `over` is true while files are held over the element `bind` is spread on. */
export function usePhotoDrop(onFiles: (files: File[]) => void, disabled = false) {
  const [over, setOver] = React.useState(false);
  // dragenter and dragleave fire for every child crossed on the way, so
  // count them rather than trusting the last one.
  const depth = React.useRef(0);

  React.useEffect(() => {
    const guard = (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer) || e.defaultPrevented) return;
      // Not over the drop target: refuse the drop, and the browser neither
      // opens the file nor shows a "copy" cursor over the rest of the page.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    const reset = () => { depth.current = 0; setOver(false); };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    window.addEventListener('drop', reset);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
      window.removeEventListener('drop', reset);
    };
  }, []);

  const bind = {
    onDragEnter: (e: React.DragEvent) => {
      if (!carriesFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth.current += 1;
      setOver(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!carriesFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!carriesFiles(e.dataTransfer)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!carriesFiles(e.dataTransfer)) return;
      // Also stops a file input under the pointer from taking the files
      // itself, which would add them a second time.
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      if (disabled) return;
      const files: File[] = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
  };

  return { over: over && !disabled, bind };
}
