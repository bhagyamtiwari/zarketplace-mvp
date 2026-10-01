// Any address the shop does not know, typed wrong or out of date. Before this
// page existed such a link rendered nothing between the header and footer.
import { Link } from 'react-router-dom';
import { usePageMeta } from '../lib/pageMeta';

export function NotFound() {
  usePageMeta({ title: 'Page not found', description: 'This page does not exist.', noIndex: true });
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-start justify-center gap-6 px-4 pt-28 pb-20">
      <span className="text-[10px] font-black uppercase tracking-[0.3em]">Error 404</span>
      <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter leading-[0.95]">
        This page does not exist.
      </h1>
      <p className="text-sm sm:text-base">The link may be mistyped or out of date. Everything we have for sale is in the shop.</p>
      <div className="flex flex-wrap gap-3">
        <Link to="/browse" className="bg-black px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white hover:bg-zinc-800">
          Go to the shop
        </Link>
        <Link to="/" className="border border-black px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-black hover:text-white">
          Home
        </Link>
      </div>
    </div>
  );
}
