/**
 * Backfill script for global arbitrage fields.
 * Run with: npx tsx prisma/backfill-global-groups.ts
 *
 * Populates:
 *  - ProductVariant.globalGroupId  (from family.brand + family.name + storageGb)
 *  - ProductVariant.semanticColorGroup (from color → semantic group)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Semantic Color Map (same as packages/shared/src/utils/color-groups.ts) ──
const SEMANTIC_COLOR_MAP: Record<string, string> = {
  'Black': 'dark', 'Black Titanium': 'dark', 'Space Black': 'dark',
  'Midnight': 'dark', 'Graphite': 'dark', 'Obsidian': 'dark',
  'White': 'light', 'White Titanium': 'light', 'Starlight': 'light', 'Silver': 'light',
  'Blue': 'blue', 'Blue Titanium': 'blue', 'Fog Blue': 'blue', 'Ultramarine': 'blue',
  'Gold': 'gold', 'Desert Titanium': 'gold', 'Cosmic Orange': 'gold',
  'Natural Titanium': 'natural', 'Sage': 'natural', 'Lavender': 'natural',
  'Green': 'green', 'Pink': 'pink', 'Red': 'red',
  'Purple': 'purple', 'Deep Purple': 'purple',
  'Yellow': 'yellow', 'Teal': 'teal', 'Orange': 'orange',
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  const variants = await prisma.productVariant.findMany({
    include: { family: { select: { brand: true, name: true } } },
  });

  console.log(`Backfilling ${variants.length} variants...`);

  let updated = 0;
  for (const v of variants) {
    const globalGroupId = slugify(`${v.family.brand} ${v.family.name} ${v.storageGb}gb`);
    const semanticColorGroup = SEMANTIC_COLOR_MAP[v.color] ?? v.color.toLowerCase().replace(/\s+/g, '-');

    await prisma.productVariant.update({
      where: { id: v.id },
      data: { globalGroupId, semanticColorGroup },
    });
    updated++;
  }

  console.log(`✓ Updated ${updated} variants with globalGroupId + semanticColorGroup`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
