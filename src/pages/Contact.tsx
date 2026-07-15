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

        <div className="max-w-md">
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
            <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Operated by ADNIZ Private Limited</p>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
