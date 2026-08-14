// First-visit "which state are you in?" prompt.
//
// It explains before it asks. A bare state dropdown on arrival reads as a
// tracking question and gets dismissed; the reason - that a seller can only
// ship within their own state until GST compliance is finished - is the whole
// point, and it is short enough to say up front.
//
// Not a wall. The buyer can skip and browse the whole catalogue, and every
// listing still says which state it ships from. A hard gate would show an
// empty site to anyone outside Delhi, which is where all current stock is:
// the visitor would conclude the marketplace has nothing rather than that it
// has nothing *nearby*, and there would be no way to tell the difference.

import * as React from 'react';
import { MapPin, X } from 'lucide-react';
import { type IndianState } from '../lib/states';
import { StateSelect } from './StateSelect';
import { useBuyerState, hasBeenAsked, markAsked } from '../lib/buyerState';
import { CoverageNote } from './CoverageNote';

export function StatePrompt() {
  const [buyerState, setBuyerState] = useBuyerState();
  const [asked, setAsked] = React.useState(hasBeenAsked);
  const [choice, setChoice] = React.useState('');

  if (buyerState || asked) return null;

  const skip = () => {
    markAsked();
    setAsked(true);
  };

  const confirm = () => {
    if (!choice) return;
    setBuyerState(choice as IndianState);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 sm:p-6">
      <div aria-hidden className="absolute inset-0 bg-black/50" onClick={skip} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="state-prompt-title"
        className="relative w-full max-w-lg border border-black bg-white p-6 sm:p-8 flex flex-col gap-5"
      >
        <button
          type="button"
          onClick={skip}
          aria-label="Skip for now"
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center text-black/40 hover:text-black"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col gap-3 pr-8">
          <div className="flex items-center gap-2.5">
            <MapPin className="h-5 w-5 shrink-0" strokeWidth={2} />
            <h2 id="state-prompt-title" className="text-lg sm:text-xl font-black uppercase tracking-tighter">
              We are live in Delhi first
            </h2>
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest leading-[1.9] text-black/60">
            Sellers ship within their own state while we work through the GST
            system to make selling on an enrolment number simple for them. Every
            listing on zarketplace is in Delhi right now, and more states open as
            we allow listings from them.
          </p>
          {/* Said here rather than discovered at checkout. NCR is one city to
              everyone who lives in it and three states to GST, and a Gurgaon
              buyer picking Delhi is the single likeliest way to end up
              refused without understanding why. */}
          <p className="text-[10px] font-bold uppercase tracking-widest leading-[1.9] text-black/40">
            Gurgaon and Noida are separate states for GST, so they are not live
            yet either. You can still browse everything.
          </p>
        </div>

        <StateSelect
          value={choice}
          onChange={(v) => setChoice(v ?? '')}
          placeholder="Select your state"
          aria-label="Your state"
          serviceableOnly
          className="border-b border-black/15 bg-transparent py-4 text-sm font-bold focus:border-black focus:outline-none"
        />

        <CoverageNote state={choice || null} />

        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            onClick={skip}
            className="border border-black/15 px-6 py-4 text-[10px] font-black uppercase tracking-[0.25em] text-black/50 hover:border-black hover:text-black"
          >
            Browse everything
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!choice}
            className="flex-1 bg-black py-4 text-[10px] font-black uppercase tracking-[0.25em] text-white disabled:opacity-30"
          >
            I am in Delhi
          </button>
        </div>

        <p className="text-[9px] font-bold uppercase tracking-widest text-black/35 leading-relaxed">
          Stored on this device only. Change it any time. We are going pan-India
          as soon as our registration allows it.
        </p>
      </div>
    </div>
  );
}
