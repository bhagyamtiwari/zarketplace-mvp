import React from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Instagram, Send } from 'lucide-react';

export function Contact() {
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-40 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <h1 className="text-5xl font-black tracking-tighter uppercase">Message Sent</h1>
          <p className="text-sm font-black uppercase tracking-widest text-black max-w-md">
            We've received your inquiry. Our team will get back to you shortly.
          </p>
          <Link 
            to="/" 
            className="mt-8 bg-black text-white px-12 py-4 text-[10px] font-black uppercase tracking-[0.2em] hover:scale-105 transition-transform"
          >
            Back to Home
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-32 pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black hover:text-black/80 mb-12">
        <ArrowLeft className="h-3 w-3" /> Back to Home
      </Link>

      <div className="flex flex-col gap-16">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 mb-2">
            <img src="/images/zarketplace-tp.png" alt="Zarketplace" className="h-6 w-auto" referrerPolicy="no-referrer" />
            <span className="lowercase font-black tracking-tighter text-2xl">zarketplace</span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-black">Contact</span>
          <h1 className="text-6xl font-black tracking-tighter uppercase">Get in touch</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
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
              </div>
            </div>

          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <label className="text-[9px] font-black uppercase tracking-widest">Inquiry Type</label>
              <select className="border-b border-black/10 py-3 text-sm font-bold focus:border-black focus:outline-none bg-transparent" required>
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

            <button 
              type="submit"
              className="bg-black text-white py-4 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform"
            >
              <Send className="h-3 w-3" /> Send Message
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
