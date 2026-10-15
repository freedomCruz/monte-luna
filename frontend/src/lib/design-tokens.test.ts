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

  it('scans frontend/src for colour utilities and fails when token is not declared in global.css @theme', () => {
    const globalCssPath = path.resolve(__dirname, '../styles/global.css');
    const globalCssContent = fs.readFileSync(globalCssPath, 'utf-8');

    // Extract all declared --color-<name> in global.css @theme
    const themeMatch = globalCssContent.match(/@theme\s+inline\s*\{([^}]+)\}/);
    expect(themeMatch, 'global.css must have @theme inline block').not.toBeNull();
    const themeBlock = themeMatch ? themeMatch[1] : '';

    const declaredTokens = new Set<string>();
    const tokenRegex = /--color-([a-z0-9-]+)\s*:/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(themeBlock)) !== null) {
      declaredTokens.add(match[1]);
    }

    // Standard Tailwind CSS built-in colors / keywords
    const standardTailwindColors = new Set([
      'inherit',
      'current',
      'transparent',
      'black',
      'white',
      'slate',
      'gray',
      'zinc',
      'neutral',
      'stone',
      'red',
      'orange',
      'amber',
      'yellow',
      'lime',
      'green',
      'emerald',
      'teal',
      'cyan',
      'sky',
      'blue',
      'indigo',
      'violet',
      'purple',
      'fuchsia',
      'pink',
      'rose',
    ]);

    // Recursively collect all files under frontend/src (excluding styles/global.css itself and generated files)
    const srcDir = path.resolve(__dirname, '..');
    const sourceFiles: string[] = [];

    function walkDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'generated') {
            walkDir(fullPath);
          }
        } else if (/\.(astro|tsx|jsx|ts|js|html)$/.test(entry.name)) {
          if (!fullPath.endsWith('.test.ts') && !fullPath.endsWith('.test.tsx')) {
            sourceFiles.push(fullPath);
          }
        }
      }
    }
    walkDir(srcDir);

    // Regex for colour utility classes:
    // Only match utility prefixes followed by dash and colour name:
    // (bg|text|border|ring|outline|from|to|via|fill|stroke)-([a-zA-Z0-9-]+)
    const utilityPrefixes = ['bg', 'text', 'border', 'ring', 'outline', 'from', 'to', 'via', 'fill', 'stroke'];
    const utilityRegex = new RegExp(`\\b(?:${utilityPrefixes.join('|')})-([a-z0-9-]+)(?:\\/[a-z0-9.]+)?\\b`, 'g');

    const undeclaredUses: { file: string; token: string; classMatch: string }[] = [];

    // Ignored utility words that are not colors (e.g. text-left, bg-cover, border-collapse, stroke-width, etc.)
    const nonColorUtilities = new Set([
      // text
      'left', 'center', 'right', 'justify', 'start', 'end',
      'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
      'wrap', 'nowrap', 'balance', 'pretty', 'ellipsis', 'clip',
      // bg
      'bottom', 'top', 'auto', 'cover', 'contain', 'fixed', 'local', 'scroll', 'repeat', 'no-repeat',
      // border
      'solid', 'dashed', 'dotted', 'double', 'hidden', 'none',
      'collapse', 'separate', 'spacing',
      // outline
      'offset',
      // ring
      'inset',
      // stroke
      'width', 'linecap', 'linejoin', 'dasharray', 'dashoffset', 'miterlimit',
      // to / from / via (gradient directions)
      't', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl',
      // not colors (e.g. data attributes, aria, or IDs like to-cart)
      'cart',
    ]);

    for (const file of sourceFiles) {
      const relPath = path.relative(srcDir, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf-8');
      let uMatch: RegExpExecArray | null;
      while ((uMatch = utilityRegex.exec(content)) !== null) {
        const fullClass = uMatch[0];
        let tokenName = uMatch[1];

        // Strip numbers from border widths like border-2, border-4, border-t, border-b, ring-2, etc.
        if (/^\d+$/.test(tokenName) || /^(t|b|l|r|x|y)(-\d+)?$/.test(tokenName)) {
          continue;
        }

        if (nonColorUtilities.has(tokenName)) {
          continue;
        }

        // If it starts with brand-* or is a custom name
        // Check if tokenName is in standard Tailwind colors or declared tokens
        const baseColor = tokenName.split('-')[0];
        if (standardTailwindColors.has(tokenName) || standardTailwindColors.has(baseColor)) {
          continue;
        }

        if (!declaredTokens.has(tokenName)) {
          undeclaredUses.push({ file: relPath, token: tokenName, classMatch: fullClass });
        }
      }
    }

    expect(
      undeclaredUses,
      `Found undeclared colour tokens in frontend/src:\n` +
        undeclaredUses.map((u) => `  ${u.file}: class "${u.classMatch}" uses undeclared token "${u.token}"`).join('\n')
    ).toEqual([]);
  });
});

