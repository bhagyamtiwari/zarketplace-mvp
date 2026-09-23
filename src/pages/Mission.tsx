import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageMeta, META } from '../lib/pageMeta';

// Why zarketplace exists. About says what we are; this says what we are for.
//
// The argument is that sustainability should not be one more thing to sell:
// the greenest garment is one that already exists. Every claim about how we
// work is one the model actually delivers (MODEL.md §3, §8): the patient lane
// holds no stock and ships nothing until an item has sold, and measurements
// on every listing exist to cut returns.
//
// The India figures are Fashion for Good's, from Wealth in Waste (2022):
// 7,793 kilotonnes of textile waste a year, about a twelfth of the world's;
// 3,944 kt of it domestic post-consumer, 3,265 kt pre-consumer and 584 kt
// imported. Quote them as they are, with the source on the page, or not at
// all.
export function Mission() {
  usePageMeta(META.mission);

  return (
    <div className="shell-wide pt-24 sm:pt-32 pb-16 sm:pb-20">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-black hover:underline underline-offset-4 mb-12">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-8"
      >
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">Our Mission</h1>
        </div>

        {/* The film goes here, above the prose, once it exists. Until then
            there is no placeholder: an empty frame promising a video reads as
            unfinished. */}

        <div className="flex flex-col gap-12 text-black body-longform [&>p+p]:-mt-8">
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Sustainability is not a product</h2>
            <p>
              Sustainability has become another way to sell things. A new t-shirt made the green way is still a new t-shirt, and if being sustainable means buying more, it is not working.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">India is where clothes end up</h2>
            <p>
              India throws away around 7.8 million tonnes of textiles a year, roughly a twelfth of all the textile waste in the world. Roughly half of it comes from our own homes, and more than half a million tonnes more is shipped in from other countries to be sorted and recycled here. Plenty of what lands in that pile still has years of wear left in it. Its owner simply stopped wearing it.
            </p>
            <p className="text-sm">
              Figures from Fashion for Good,{' '}
              <a href="https://www.fashionforgood.com/report/wealth-in-waste/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                Wealth in Waste
              </a>{' '}
              (2022).
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Keep clothes in use</h2>
            <p>
              The most sustainable piece of clothing is the one that has already been made. In a circular economy, things stay in use for as long as they can, passed from one owner to the next instead of thrown away, and resale is the simplest version of it. So that is all we sell. We buy good clothes from people who have stopped wearing them, check every piece, and pass it on to someone who will. We do not buy new stock from brands or retailers, so every sale here is a piece kept in use rather than a new one made, and one more that stays out of that pile.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">Built in, not sold on top</h2>
            <p>
              We do not charge extra for being sustainable, and we do not ask you to buy more to feel better about it. It is simply how the business works, priced into the item like everything else.
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2">
              <li><strong>Nothing moves until it sells.</strong> An item stays with its owner until someone buys it, so there is no warehouse of unsold stock and no parcel sent anywhere on speculation.</li>
              <li><strong>Two trips, on purpose.</strong> From its owner to our hub, and from our hub to you. Sending it straight from one to the other would save a leg, but checking every item in between means far fewer come back, and every return is two more trips.</li>
              <li><strong>Fewer returns.</strong> Every listing carries its measurements, so you can check the fit before you buy rather than after.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-black uppercase tracking-tight text-black">What we stand for</h2>
            <p>
              Buy less, buy better, and when you are done with something, pass it on. We would rather you owned one good jacket that lasts than five that do not. That is not a slogan for us. It is the whole business.
            </p>
          </section>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/sell" className="bg-black px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-white hover:bg-zinc-800 transition-colors">
            Sell us your item
          </Link>
          <Link to="/browse" className="border border-black px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-colors">
            Browse pre-owned
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
