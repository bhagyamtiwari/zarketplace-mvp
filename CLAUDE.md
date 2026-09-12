# zarketplace

## Read this first

**[MODEL.md](MODEL.md) is the authoritative business model. Read it in full
before changing anything.**

It supersedes every business-model assumption still lying around in this
codebase. The site was originally built as a peer-to-peer commission
marketplace, and code, copy and schema from that era survive in places. When
this repo and MODEL.md disagree, MODEL.md is right and the repo is stale.

The three things most likely to trip up a new session:

1. **We are a principal, not a marketplace.** We buy items outright and resell
   them in our own name. This is a GST classification requirement, not a
   stylistic preference. MODEL.md §2 lists four hard rules; breaking any of
   them creates retroactive tax liability that attaches to directors
   personally.

2. **Sellers never set a price, and never see a percentage of anything.**
   Natural-sounding marketplace copy ("your sale price", "commission", "we sell
   it for you", "you earn X%") is exactly what violates the legal model. Watch
   for it in new copy.

3. **Patient lane only.** The seller keeps the item until it sells; a prepaid
   label and doorstep pickup follow the sale. The instant lane, where the item
   comes to us first, is deliberately deferred — keep the schema lane-aware,
   but build no instant-lane UI, copy or flow.

## Other conventions

- No em dashes in user-facing copy.
- See [BrandKit.md](BrandKit.md) for voice and visual language, and
  [COPY_RULES.md](COPY_RULES.md) for wording rules.
