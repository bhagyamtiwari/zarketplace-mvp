import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Instagram, MessageCircle } from 'lucide-react';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { InfoPageNav } from '../components/InfoPageNav';

export function Contact() {
  useDocumentTitle('Contact');

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-black hover:text-black/80 mb-8 lg:mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to Home
      </Link>

      <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
        <InfoPageNav />

        <div className="flex flex-col gap-16 flex-1 min-w-0">
        <div className="flex flex-col gap-4">
          <h1 className="text-5xl sm:text-6xl font-black tracking-tighter uppercase">Get in touch</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20">
          <div className="flex flex-col gap-12">
            <div className="flex flex-col gap-6">
              <h2 className="text-xs font-black uppercase tracking-widest border-b border-black pb-4">Direct Channels</h2>
              <div className="flex flex-col gap-6">
                <a href="mailto:contact@zarketplace.com" className="flex items-center gap-4 group">
                  <div className="h-10 w-10 bg-zinc-50 flex items-center justify-center border border-black/5 group-hover:border-black transition-colors">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-widest text-black/40">Email</span>
                    <span className="text-sm font-bold">contact@zarketplace.com</span>
                  </div>
                </a>
                <a href="https://instagram.com/zarketplace" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 group">
                  <div className="h-10 w-10 bg-zinc-50 flex items-center justify-center border border-black/5 group-hover:border-black transition-colors">
                    <Instagram className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-widest text-black/40">Instagram</span>
                    <span className="text-sm font-bold">@zarketplace</span>
                  </div>
                </a>
                <a href="https://wa.me/918505927538" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 group">
                  <div className="h-10 w-10 bg-zinc-50 flex items-center justify-center border border-black/5 group-hover:border-black transition-colors">
                    <MessageCircle className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-widest text-black/40">WhatsApp</span>
                    <span className="text-sm font-bold">+91 8505-ZARKET</span>
                    <span className="text-sm font-bold text-black/40">or +91 8505-927538</span>
                  </div>
                </a>
              </div>
            </div>
          </div>

          <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black uppercase tracking-widest">Inquiry Type</label>
              <select defaultValue="feedback" className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none bg-transparent" required>
                <option value="feedback">Customer Feedback</option>
                <option value="seller">Seller Support</option>
                <option value="buyer">Buyer Support</option>
                <option value="investors">Investors</option>
                <option value="legal">Legal</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black uppercase tracking-widest">Full Name</label>
              <input type="text" className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all" placeholder="Your Name" required />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black uppercase tracking-widest">Email Address</label>
              <input type="email" className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none transition-all" placeholder="you@example.com" required />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black uppercase tracking-widest">Message</label>
              <textarea
                className="border border-black/10 p-4 text-sm font-bold focus:border-black focus:outline-none transition-all min-h-[150px] resize-none"
                placeholder="How can we help?"
                required
              ></textarea>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled
                className="w-full bg-zinc-200 text-zinc-500 py-4 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 cursor-not-allowed"
              >
                Form Temporarily Paused
              </button>
              <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 text-center">
                Please email <a href="mailto:contact@zarketplace.com" className="underline text-black/60 hover:text-black">contact@zarketplace.com</a> for now
              </p>
            </div>
          </form>
        </div>
        </div>
      </div>
    </div>
  );
}
