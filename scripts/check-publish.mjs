// Runs `npm publish --dry-run` and fails when npm would silently change the
// package on publish (e.g. drop a `bin` entry). publint and `npm pack` do not
// catch these, only the real publish path does. The 2.0.0 publish flagged the
// `bin` path this way, so CI now checks it on every push.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['publish', '--dry-run', '--access', 'public'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
const output = `${result.stdout}\n${result.stderr}`;

const problems = [
  /auto-corrected some errors/i,
  /was invalid and removed/i,
  /No bin file found/i,
].filter((pattern) => pattern.test(output));

const pkg = JSON.parse(
  (await import('node:fs')).readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
const missing = Object.values(pkg.bin ?? {}).filter((file) => !output.includes(file));

if (problems.length || missing.length) {
  console.error(output);
  if (problems.length)
    console.error(`\nnpm would modify package.json on publish: ${problems.join(', ')}`);
  if (missing.length) console.error(`\nbin files missing from the tarball: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(
  `Publish dry run clean (npm ${spawnSync('npm', ['--version'], { encoding: 'utf8' }).stdout.trim()}).`
);
