// New Year's Eve on the planet: lib/new-year.js (the countdown to midnight, then fireworks).
import { newYear } from './lib/new-year.js';

export const decorate = (kit) => newYear(kit, { eve: true });
