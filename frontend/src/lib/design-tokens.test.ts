import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Design tokens invariant in islands (S8 / Finding 4)', () => {
  it('ProductPurchaseIsland does not hardcode raw hex colors', () => {
    const fileContent = fs.readFileSync(
      path.resolve(__dirname, '../components/islands/ProductPurchaseIsland.tsx'),
      'utf-8'
    );
    // Find all raw hex color codes like #1B1510, #9B1C1C, etc.
    const hexMatches = fileContent.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    expect(hexMatches, `Found hardcoded hex colors: ${hexMatches.join(', ')}`).toEqual([]);
  });

  it('ListingPriceIsland does not hardcode raw hex colors', () => {
    const fileContent = fs.readFileSync(
      path.resolve(__dirname, '../components/islands/ListingPriceIsland.tsx'),
      'utf-8'
    );
    const hexMatches = fileContent.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    expect(hexMatches, `Found hardcoded hex colors: ${hexMatches.join(', ')}`).toEqual([]);
  });
});
