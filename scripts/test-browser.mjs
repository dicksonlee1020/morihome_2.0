// Separate test build: exposes fixture controls only in test-browser mode.
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
for (const script of [
  'scripts/build-single.mjs',
  'tests/browser/business.cjs',
  'tests/browser/ui.cjs',
]) {
  execFileSync(process.execPath, [script], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      TZ: 'Asia/Hong_Kong',
      MORI_BUILD_MODE: 'test-browser',
    },
  });
}
