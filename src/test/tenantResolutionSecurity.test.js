import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relPath) {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8');
}

describe('tenant resolution security', () => {
  it('does not use email fallback to decide restaurant access in frontend tenant loading', () => {
    const store = read('src/lib/store.jsx');
    const restaurantData = read('src/lib/useRestaurantData.js');

    expect(store).not.toMatch(/Restaurant\.filter\(\{\s*owner_email\b/);
    expect(store).not.toMatch(/TeamMember\.filter\(\{\s*email\b/);
    expect(restaurantData).not.toMatch(/\.eq\(\s*['"]owner_email['"]/);
  });

  it('keeps public kitchen device-token calls compatible with Supabase gateway and cleans setup URLs', () => {
    const publicKitchen = read('src/pages/public/Cocina.jsx');

    expect(publicKitchen).toContain("'apikey': SUPABASE_ANON_KEY");
    expect(publicKitchen).toContain("clean.searchParams.delete('token')");
    expect(publicKitchen).toContain('isValidDeviceToken');
  });
});
