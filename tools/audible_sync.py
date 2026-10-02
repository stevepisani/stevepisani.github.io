"""Steve's Audible library -> _data/audible.json, for /bookshelf, the listening sky on the planet
(/listening.json) and the bartender.

Only books he's finished or is partway through are kept (nothing he hasn't started), minus any in
_data/audible_hide.yml. Podcasts are skipped. Run by .github/workflows/audible.yml once a day:

    AUDIBLE_AUTH='<the auth file's JSON>' python tools/audible_sync.py

The auth file comes from `audible quickstart` (audible-cli), run once on Steve's own machine; it's a
device registration, so it refreshes its own access token and never needs his password here. To try
the transform without an account: python tools/audible_sync.py --from tools/fixtures/audible-library.json
(a saved API response), which writes to stdout instead.

The Audible API isn't public; this uses the same endpoints as Audible's apps, through the
`audible` package (pinned in the workflow). If its shape changes, the sync fails loudly and the
site keeps the last good data.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "_data" / "audible.json"
HIDE = ROOT / "_data" / "audible_hide.yml"
GROUPS = ", ".join([
    "contributors", "media", "product_attrs", "product_desc", "product_extended_attrs", "series",
    "sample", "category_ladders", "is_finished", "percent_complete", "listening_status",
])
BOOK_TYPES = {"SinglePartBook", "MultiPartBook"}


def hidden() -> set[str]:
    """ASINs and lower-cased titles listed in _data/audible_hide.yml (one `- ` item per line)."""
    if not HIDE.exists():
        return set()
    out = set()
    for line in HIDE.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line.startswith("- "):
            out.add(line[2:].strip().strip("'\"").lower())
    return out


def fetch() -> tuple[list[dict], dict[str, str]]:
    import audible  # only needed for the real thing

    auth = audible.Authenticator.from_dict(json.loads(os.environ["AUDIBLE_AUTH"]))
    with audible.Client(auth=auth) as client:
        items, page = [], 1
        while True:
            r = client.get("1.0/library", num_results=1000, page=page, response_groups=GROUPS, sort_by="-PurchaseDate")
            batch = r.get("items", [])
            items += batch
            if len(batch) < 1000:
                break
            page += 1
        # when each was marked finished (the library itself only says whether)
        finished = {}
        try:
            r = client.get("1.0/stats/status/finished", start_date="2000-01-01T00:00:00Z")
            for e in r.get("mark_as_finished_status_list", []):
                if e.get("is_marked_as_finished") and e.get("asin"):
                    finished[e["asin"]] = e.get("event_timestamp")
        except Exception as e:  # the dates are a nicety; the library is what matters
            print(f"no finish dates: {e}", file=sys.stderr)
    return items, finished


def names(people) -> list[str]:
    return [p.get("name") for p in (people or []) if p.get("name")]


def day(ts) -> str | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return None


def book(item: dict, finished_at: dict[str, str]) -> dict | None:
    if item.get("content_delivery_type") not in BOOK_TYPES:
        return None  # podcasts, episodes, periodicals
    status = item.get("listening_status") or {}
    done = bool(item.get("is_finished") or status.get("is_finished"))
    pct = item.get("percent_complete")
    if pct is None:
        pct = status.get("percent_complete")
    pct = round(float(pct or 0))
    if not done and pct <= 0:
        return None  # never started: stays private
    series = (item.get("series") or [{}])[0]
    ladder = ((item.get("category_ladders") or [{}])[0].get("ladder") or [])
    images = item.get("product_images") or {}
    return {
        "asin": item.get("asin"),
        "title": item.get("title"),
        "subtitle": item.get("subtitle"),
        "authors": names(item.get("authors")),
        "narrators": names(item.get("narrators")),
        "series": series.get("title"),
        "seq": series.get("sequence"),
        "genre": ladder[0].get("name") if ladder else None,
        "minutes": item.get("runtime_length_min"),
        "released": item.get("release_date"),
        "cover": images.get("500") or next(iter(images.values()), None),
        "sample": item.get("sample_url"),
        "finished": done,
        "finished_on": day(finished_at.get(item.get("asin")) or status.get("finished_at_timestamp")) if done else None,
        "percent": 100 if done else min(pct, 99),
        "added": day(item.get("purchase_date") or (item.get("library_status") or {}).get("date_added")),
    }


def transform(items: list[dict], finished_at: dict[str, str], hide: set[str]) -> dict:
    books = [b for b in (book(i, finished_at) for i in items) if b]
    books = [b for b in books if b["asin"].lower() not in hide and (b["title"] or "").lower() not in hide]
    listening = sorted((b for b in books if not b["finished"]), key=lambda b: -b["percent"])
    done = sorted((b for b in books if b["finished"]), key=lambda b: b["finished_on"] or b["added"] or "", reverse=True)
    return {"listening": listening, "finished": done}


def main() -> None:
    args = sys.argv[1:]
    if args[:1] == ["--from"]:
        raw = json.loads(pathlib.Path(args[1]).read_text())
        data = transform(raw.get("items", []), raw.get("finished", {}), hidden())
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return
    if not os.environ.get("AUDIBLE_AUTH"):
        sys.exit("AUDIBLE_AUTH isn't set: see the comment at the top of this file")
    items, finished_at = fetch()
    if not items:
        sys.exit("the library came back empty; keeping the last good data")
    data = transform(items, finished_at, hidden())
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    if {k: old.get(k) for k in data} == data:
        print("no change")
        return
    data["updated"] = datetime.now(timezone.utc).date().isoformat()
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(data['finished'])} finished, {len(data['listening'])} listening now")


if __name__ == "__main__":
    main()
