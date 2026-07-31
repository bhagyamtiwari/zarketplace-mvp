"""Single source of copy for both seller documents.

The PDF and the Word version are generated from this file, so the two can never
drift. Every fact here is checked against the live product: shipping rates from
the shipping_categories migration, the 72h/48h windows from docs/PAYMENTS.md,
the photo slots and banned phrases from src/pages/Sell.tsx, and the Seller Tools
label from src/pages/SellerPortal.tsx.

Three things the first draft claimed that the product does not do, corrected
here: listings cannot be edited (only deleted and recreated), payouts are paid
by hand after the review window rather than automatically, and the in-product
button is "Generate Instagram image".
"""

WHATSAPP = "+91 85059 27538"
EMAIL = "contact@zarketplace.com"
INSTAGRAM = "@zarketplace"

# --- Document 1: welcome pack ------------------------------------------------

D1_TITLE = "Welcome to selling on zarketplace"
D1_KICKER = "WELCOME PACK"
D1_HEAD = "WELCOME TO SELLING"
D1_WHISPER = "sell your clothes. keep 100%."
D1_INTRO = "Thanks for selling on zarketplace. Here is everything, once."

PROMISES = [
    ("BadgePercent", "No selling fees", "We take 0%. Not a launch offer."),
    ("Wallet", "You keep 100%", "Your asking price is your payout."),
    ("Truck", "You pick who ships", "Buyer pays, we cover it, or you do."),
    ("ShieldCheck", "We handle the rest", "Secure payments and delivery."),
]

HOW_SELLING = [
    ("Create your listing", "Photos, details, condition, price."),
    ("A buyer purchases", "Their money is held, not sent to you."),
    ("It gets shipped", "We collect from your door, or you post it."),
    ("Your item is delivered", "Tracked the whole way."),
    ("48-hour review", "The buyer checks it over."),
    ("Payout released", "To your UPI."),
]

KEEP_HEAD = "100%"
KEEP_LINES = [
    "You receive 100% of your listing price.",
    "No listing fees. No selling fees. No hidden commissions.",
    "The only deduction is shipping, and only if we arrange it for you.",
]

ALLOWED = ["One hoodie", "One pair of shoes", "One jacket"]
NOT_ALLOWED = [
    '"Available in all sizes"',
    '"DM for colours"',
    '"Message for price"',
    "Several different items bundled into one listing",
]
ONE_ITEM_NOTE = ("Got five identical tees? Create five listings. The system rejects "
                 "bundle phrasing automatically.")

# (caption under the frame, subject printed inside an empty slot, required)
PHOTO_SLOTS = [
    ("Front", "Front of the garment", True),
    ("Back", "Back of the garment", True),
    ("Brand label", "Brand label close-up", False),
    ("Size tag", "Size tag close-up", False),
    ("Detail", "Fabric or stitching detail", False),
    ("Flaw", "A flaw, shown honestly", False),
]
PHOTO_USE = ["Natural light", "Clean plain background", "The whole item in frame",
             "Front and back", "Close-ups of tags", "Close-ups of every flaw"]
PHOTO_SKIP = ["Screenshots", "Stock images", "Heavy filters", "Dark rooms",
              "Busy backgrounds", "Angles that hide damage"]
PHOTO_NOTE = "Honest listings build trust and come back less often."

COMPARE = [("This sells", "Flat, lit, plain background, whole garment."),
           ("This doesn't", "Dim, cluttered, cropped, filtered.")]

DESCRIBE_CHIPS = ["Brand", "Size", "Colour", "Condition", "Any flaws"]
DESCRIBE_NOTE = "Damage, stains or wear go in the photos and the description. Both."

PRICE_NOTE = ("Realistically priced items sell much faster. Check similar listings "
              "on zarketplace before you decide.")

HELP_HEAD = "MESSAGE US ON WHATSAPP"
HELP_LINES = ["Listings, pickups, deliveries, payments, disputes.",
              "Just reply to the chat."]

# --- Document 2: guide and FAQ -----------------------------------------------

D2_TITLE = "Seller guide and FAQ"
D2_KICKER = "SELLER GUIDE"
D2_HEAD = "YOUR ITEM SOLD."
D2_WHISPER = "now what."

AFTER_SALE = [
    ("We notify you", "Straight away."),
    ("Pack it securely", "You have 72 hours."),
    ("It goes out", "We collect, or you post it and add tracking."),
    ("Track it", "Seller Portal, then Sales."),
    ("48-hour review", "Starts on delivery."),
    ("Payout released", "To your UPI, no open claim."),
]
DEADLINE_NOTE = ("The 72-hour window is the one deadline that matters. Miss it "
                 "repeatedly and you lose selling access.")

PACK_SLOTS = ["Folded neatly", "Wrapped and taped", "Labelled and ready"]
PACK_TIPS = ["Fold clothing neatly.",
             "Clean packaging, nothing reused and grubby.",
             "Protect shoes and accessories.",
             "Include everything shown in the listing.",
             "Ship the exact item in your photos."]

PAYOUT_HELD = ["The buyer has received the item.",
               "The 48-hour review window has closed."]
PAYOUT_THEN = ["Paid to the UPI ID on your listing. No open claim, no delay.",
               "Your payout is your full asking price."]

EDIT_NOTE = ("There is no edit button yet. Delete the listing and create it again "
             "with the fix. If the item has already sold, message us on WhatsApp "
             "straight away and we will sort it with the buyer.")

BANNED = ["Counterfeit items", "Misleading descriptions", "Photos that are not your item",
          "Stolen goods", "Prohibited products"]
BANNED_NOTE = ("Not sure whether something is allowed? Ask before you list. Asking is "
               "free, a suspension isn't.")

FAQ = [
    ("When do I get paid?",
     "After delivery and the 48-hour buyer review window."),
    ("Who pays shipping?",
     "You choose per listing. The buyer at checkout, or you can offer free "
     "shipping and we take the flat rate out of your payout, or you can ship it "
     "yourself, pay your own courier and keep your full price."),
    ("Are there selling fees?",
     "No. You keep 100% of your asking price."),
    ("What if my item doesn't sell?",
     "Better photos, a fairer price, and share it. Seller Portal, then Seller Tools, "
     "generates a branded Instagram image for any listing in one click."),
    ("What if I need help?",
     "Reply to the WhatsApp chat. Any time."),
]

CHECKLIST = ["Clean your item", "Take great photos", "Mention every flaw",
             "Price it fairly", "Double-check the description", "One item per listing"]

CLOSING_HEAD = "YOU'RE READY TO SELL."
CLOSING_WHISPER = "start at zarketplace.com/sell"

# Shipping rates, mirrored from the shipping_categories migration.
SHIPPING = [("Accessories & small items", "Rs. 79"), ("T-shirts & tops", "Rs. 80"),
            ("Jeans & bottoms", "Rs. 99"), ("Footwear", "Rs. 129"),
            ("Jackets & heavy items", "Rs. 149")]
