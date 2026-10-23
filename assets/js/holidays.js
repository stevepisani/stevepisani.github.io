// The holidays the site dresses up for: each on the visitor's own date, and only that day.
// site.js marks the page (`<html data-holiday>`, for the touch beside the name on every page) and
// the planet loads that holiday's decorations (assets/js/world/holidays/<id>.js), so on any other
// day nothing extra is downloaded.
//
// `?holiday=<id>` shows one on any day, to check it; `?holiday=none` shows none.

// Each holiday: its month (1-12) and day in a given year
export const HOLIDAYS = {
  halloween: () => [10, 31],
};

/** The holiday on `date` (the visitor's local date), or null. */
export function holidayOn(date) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  return Object.keys(HOLIDAYS).find((id) => { const [hm, hd] = HOLIDAYS[id](y); return hm === m && hd === d; }) || null;
}

/** Today's holiday here, or the one `?holiday=` asks for. */
export function holidayNow() {
  const asked = new URLSearchParams(location.search).get('holiday');
  if (asked !== null) return Object.hasOwn(HOLIDAYS, asked) ? asked : null;
  return holidayOn(new Date());
}
