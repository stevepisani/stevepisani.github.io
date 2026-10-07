# The vision for the private apps

The apps at `/apps` began as a wardrobe and a recipe list. They're becoming a private record of
Steve's life: what he owns, where he goes, what he wears, eats, reads and saves. The app is one
way in (for Steve) and SJPJr, the MCP server, is the other (for any AI model). Wardrobe and trips
are first; places, recipes and books come next.

**The test for every change: when a better model arrives, the app gets better that day, with no
rebuild.** That holds only if the app keeps the facts and the model does the thinking. Six rules
follow from it.

## 1. Keep the evidence, not just the answer

Every fact keeps what it came from: the photo, the hang tag, the receipt, the shop page, the
Takeout file, and who read it, how and how sure they were. SJPJr already does this for clothes
(`sources`, `confidence`, photos with roles). A better model can then read old evidence again and
improve old records, not only new ones. Raw evidence is never thrown away just because a fact was
taken from it, except where privacy says so (a camera frame).

## 2. Record what happens, and do it passively

Owning things is a snapshot; what happens is history: wore it, visited, ate at, cooked, bought,
packed, returned. History is what compounds, and better models get much more from a long, honest
record. It should be gathered without Steve typing it: the app notices, and Steve confirms or
corrects. Typing is the fallback.

- **Outfits:** a frame from the office camera once a morning, matched against the catalog photos
  by a vision model; the frame is deleted after the match, only the outfit kept.
- **Food:** emailed grocery receipts read nightly; card transactions (a monthly export first, a
  bank connection later); a photo of a paper receipt.
- **Places:** Google Maps saved lists and starred places (Takeout first, an API later); visits
  from card transactions at restaurants.
- **Photos:** later, an iOS Shortcut that sends picked photos to the inbox.

## 3. Tools, not features

Every ability is a small, clear SJPJr tool (find, add, plan, check) that any model can use. Then
each new model, in ChatGPT, Claude or whatever comes next, uses the same tools better. The app's
screens are for seeing and correcting; judgement belongs to the model. Hand-written rules (today's
"maybe not suede in the rain") are a stopgap until the model makes that call from the facts.
Deterministic facts (the weather, counts, dates, what's packed) stay as code and are checked.

## 4. One inbox

Everything not yet filed goes into one inbox, raw: photos, links, screenshots, receipts, files.
It's processed now, or overnight in a batch for pennies (half price on the batch APIs), or later
by a better model. Nothing is lost while it waits. Sources feed the inbox; the inbox becomes
events and records; Steve reviews what the model isn't sure of.

## 5. Trust on a dial, privacy on every record

Changes the AI suggests go through a review queue (the places import is the first). As a model
proves itself at a kind of task, that task can run without asking; Steve sets the dial per task.
Every record carries who may see it: private, shared (Lexi), or public. Only Steve moves it, and
some things can never be public whatever is ticked: home, work, any hotel or lodging, anything
near home. The public site reads only what's marked public.

## 6. Measure before switching

A dozen real tasks with known good answers ("pack for Florence in November", "what goes with the
Whiting overshirt", "which saved places are near the hotel") run against any new model before it
takes over. Cheap, and it makes upgrading safe instead of a hope.

## What this means for building

In order (`docs/roadmap.md` has the detail):

1. **Events**, with "wore it today" first (then visits, cooking, buying).
2. **The inbox and evidence**, used first by the places import (the Takeout file is the evidence).
3. **Visibility on every record**, needed first by places and the public map.
4. **A small test set for SJPJr**, run whenever the model behind it changes.
5. **Passive sources** one at a time, each landing in the inbox: Takeout, the office camera,
   grocery emails, the card export.

Running costs stay inside the site's $20 a month, each with a cap in code.
