# Email rendering

## The problem this documents

Our wordmark is pure black glyphs on transparency. A mail client in dark mode
composites that against its own near-black page, so the logo rendered as
black on black and disappeared. The primary button had the same shape of
fault: a styled `<a>` whose background is dropped wherever inline styles on
inline elements are stripped, leaving near-black text on a dark ground.

Neither is a CSS problem. A transparent black PNG carries no light of its own,
and no stylesheet recovers pixels that are not there.

## The rules

1. **The logo is a PNG with the background baked into the pixels.**
   `public/images/email-wordmark.png`, 338x70 for a 169x35 display box, 5.7 KB.
   Not SVG: clients strip it. Not transparent: that is the bug.
   `width` and `height` are set as HTML attributes as well as CSS, because
   Outlook will not infer them.
2. **Every button is a table with `bgcolor`**, not a styled anchor. The
   `bgcolor` attribute survives clients that strip style attributes.
3. **Every block declares its own background and text colour.** Backgrounds are
   set both as CSS and as the `bgcolor` attribute. Nothing inherits, because a
   client in dark mode supplies its own default underneath anything that does
   not.
4. **Every email is a full document** with `<body bgcolor>` and
   `color-scheme: light only`, not a bare `<div>`. A bare div leaves the page
   background entirely to the client.
5. `prefers-color-scheme` may be added on top, never as the only defence.
   Gmail is inconsistent about it and Outlook ignores it.

## What is verified, and what is reasoned about

`npm run test:email` renders all 21 templates in Chromium against a white
ground and a near-black one, and fails if any text falls below WCAG AA or sits
on no declared background at all. It stages the template sources fresh on
every run.

**Verified mechanically:** that every template declares its own colours, that
nothing depends on an inherited background, and that all text clears AA when a
client paints a dark page behind our markup. Shown failing before being
trusted: stripping the background declarations produces failures across most
templates on the dark ground.

**Reasoned about, NOT verified:** the style-stripping behaviour itself.
Chromium does not strip inline styles, so no browser test can prove the
bulletproof button is more robust than the styled anchor it replaced. That
defence is structural, based on documented client behaviour, and confirmed only
by inspecting the markup. The same applies to Gmail's CSS proxy rewriting and
Outlook's Word rendering engine.

**Not verified at all:** no email was sent to a real Gmail, Outlook, Apple Mail
or Yahoo account as part of this work. Before relying on these in anger, send
one of each to a real inbox on a real phone in dark mode.
