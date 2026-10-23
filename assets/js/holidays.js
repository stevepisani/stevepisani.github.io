// The holidays the site dresses up for: each on the visitor's own date, and only that day.
// site.js marks the page (`<html data-holiday>`, for the touch beside the name on every page) and
// the planet loads that holiday's decorations (assets/js/world/holidays/<id>.js), so on any other
// day nothing extra is downloaded.
//
// `?holiday=<id>` shows one on any day, to check it; `?holiday=none` shows none.

// the nth (1-4) weekday (0 Sunday … 6 Saturday) of a month (1-12): its day
const nth = (y, m, weekday, n) => 1 + ((weekday - new Date(y, m - 1, 1).getDay() + 7) % 7) + 7 * (n - 1);

// Each holiday: its month (1-12) and day in a given year
export const HOLIDAYS = {
  'new-years-day': () => [1, 1],
  halloween: () => [10, 31],
  thanksgiving: (y) => [11, nth(y, 11, 4, 4)], // the fourth Thursday of November
  'christmas-eve': () => [12, 24],
  christmas: () => [12, 25],
  'new-years-eve': () => [12, 31],
};

/** The holiday on `date` (the visitor's local date), or null. */
export function holidayOn(date) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  return Object.keys(HOLIDAYS).find((id) => { const [hm, hd] = HOLIDAYS[id](y); return hm === m && hd === d; }) || null;
}

/** Is the holiday the one `?holiday=` asked for (a preview), not today's? */
export const holidayAsked = () => new URLSearchParams(location.search).has('holiday');

/** Today's holiday here, or the one `?holiday=` asks for. */
export function holidayNow() {
  const asked = new URLSearchParams(location.search).get('holiday');
  if (asked !== null) return Object.hasOwn(HOLIDAYS, asked) ? asked : null;
  return holidayOn(new Date());
}
