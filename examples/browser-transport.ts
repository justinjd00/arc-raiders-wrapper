/**
 * Only needed when Cloudflare blocks plain HTTP from your network.
 *
 *   npm install playwright && npx playwright install chromium
 *   npx tsx examples/browser-transport.ts
 */
import { createBrowserClient } from '../src/browser';

const client = createBrowserClient({ headless: true });

try {
  const arcs = await client.arcs.all();
  console.log(arcs.map((a) => a.name).join(', '));
} finally {
  await client.close();
}
