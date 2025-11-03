import { createBrowserClient } from '../src/arc-raiders/browser-client';

async function example() {
  const client = createBrowserClient({
    headless: true,
    browser: 'chromium',
  });

  try {
    await client.init();

    const items = await client.getItems({ page: 1, pageSize: 10 });
    console.log(`Found ${items.data.length} items`);

    const weapons = await client.getWeapons({ rarity: 'legendary' });
    console.log(`Found ${weapons.data.length} legendary weapons`);
  } finally {
    await client.close();
  }
}

example().catch(console.error);

