// New Year's Day on the planet: lib/new-year.js (the year in lights, fireworks now and then).
import { newYear } from './lib/new-year.js';

export const decorate = (kit) => newYear(kit, { eve: false });
