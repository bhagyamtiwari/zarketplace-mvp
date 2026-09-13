// The page behind the "do you still have it?" buttons in a possession-check
// email. MODEL.md §5.
//
// Deliberately outside the signed-in area. The whole value of the check is that
// answering costs one tap from an inbox; putting a login in front of it would
// turn a five-second yes into a task, and an unanswered check eventually takes
// a listing down. The token in the URL is the authorisation, it answers exactly
// one question about one item, and it grants nothing else.
//
// The answer is submitted on arrival rather than behind another button. The
// vendor has already made their choice - they clicked Yes or No in the email -
// and asking them to confirm it would be asking twice.

import React from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Loader2, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { log } from '../lib/log';

const plog = log('possession');

type State =
  | { kind: 'working' }
  | { kind: 'done'; answer: 'yes' | 'no'; title: string | null; already: boolean }
  | { kind: 'unknown' }
  | { kind: 'error'; message: string };

export function PossessionCheck() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const answer = params.get('a') === 'no' ? 'no' : 'yes';
  const [state, setState] = React.useState<State>({ kind: 'working' });

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) { setState({ kind: 'unknown' }); return; }
      const { data, error } = await supabase.rpc('respond_to_possession_check', {
        p_token: token,
        p_response: answer,
      });
      if (!alive) return;
      if (error) {
        plog.warn('possession response failed', error);
        setState({ kind: 'error', message: 'We could not record that just now.' });
        return;
      }
      const r = data as { ok: boolean; already?: boolean; item_title?: string | null };
      if (!r?.ok) { setState({ kind: 'unknown' }); return; }
      setState({
        kind: 'done',
        answer,
        title: r.item_title ?? null,
        already: !!r.already,
      });
    })();
    return () => { alive = false; };
  }, [token, answer]);

  return (
    <div className="mx-auto max-w-xl px-4 pt-28 sm:pt-32 pb-24 flex flex-col items-center text-center">
      {state.kind === 'working' && (
        <>
          <Loader2 className="h-8 w-8 animate-spin ink-low" />
          <p className="mt-6 text-xs font-black uppercase tracking-widest ink-low">
            One moment
          </p>
        </>
      )}

      {state.kind === 'done' && state.answer === 'yes' && (
        <>
          <div className="flex h-16 w-16 items-center justify-center bg-black text-white">
            <Check className="h-8 w-8" strokeWidth={3} />
          </div>
          <h1 className="mt-8 text-3xl sm:text-4xl font-black tracking-tighter uppercase leading-[0.95]">
            {state.already ? 'Already noted.' : 'Thanks, noted.'}
          </h1>
          <p className="mt-4 body-copy max-w-[46ch]">
            {state.title ? <>Your {state.title} stays listed. </> : <>Your item stays listed. </>}
            Nothing else to do. We will ask again in a few weeks, and we will be in touch the
            moment it sells.
          </p>
        </>
      )}

      {state.kind === 'done' && state.answer === 'no' && (
        <>
          <div className="flex h-16 w-16 items-center justify-center border-2 border-black text-black">
            <X className="h-8 w-8" strokeWidth={3} />
          </div>
          <h1 className="mt-8 text-3xl sm:text-4xl font-black tracking-tighter uppercase leading-[0.95]">
            Taken down.
          </h1>
          <p className="mt-4 body-copy max-w-[46ch]">
            {state.title ? <>Your {state.title} is off the site. </> : <>Your item is off the site. </>}
            You owe us nothing and nothing else is needed from you.
          </p>
          <p className="mt-3 body-copy ink-mid max-w-[46ch]">
            Thanks for telling us. It is much better to hear it now than to have a courier
            turn up for something that is no longer there.
          </p>
        </>
      )}

      {state.kind === 'unknown' && (
        <>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase leading-[0.95]">
            That link has expired.
          </h1>
          <p className="mt-4 body-copy max-w-[46ch]">
            It may have been replaced by a newer one. Check for a more recent email from us,
            or open your dashboard to see where your items stand.
          </p>
        </>
      )}

      {state.kind === 'error' && (
        <>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase leading-[0.95]">
            Something went wrong.
          </h1>
          <p className="mt-4 body-copy max-w-[46ch]">
            {state.message} Try the link again, or reply to the email and we will sort it out.
          </p>
        </>
      )}

      {state.kind !== 'working' && (
        <Link
          to="/vendor-portal"
          className="mt-10 bg-black px-8 py-4 text-[11px] font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800"
        >
          Your items
        </Link>
      )}
    </div>
  );
}
