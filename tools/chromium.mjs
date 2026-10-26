// Playwright's Chromium, or, when the one this Playwright expects isn't installed, a newer one
// already on the machine (a Claude Code cloud session has its own in /opt/pw-browsers). Every
// tool that opens a browser imports `chromium` from here instead of from 'playwright'.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium as playwright } from 'playwright';

const SHELLS = '/opt/pw-browsers';

function fallback() {
  if (!existsSync(SHELLS)) return undefined;
  const dir = readdirSync(SHELLS).filter((d) => d.startsWith('chromium_headless_shell-')).sort().pop();
  const bin = dir && join(SHELLS, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
  return bin && existsSync(bin) ? bin : undefined;
}

const own = (() => { try { return playwright.executablePath(); } catch { return ''; } })();
const executablePath = existsSync(own) ? undefined : fallback();

export const chromium = {
  launch: (options = {}) => playwright.launch(executablePath ? { executablePath, ...options } : options),
};
