/**
 * Semantic Color Grouping — treats cosmetically similar colors as interchangeable.
 *
 * "Midnight", "Space Black", "Graphite", "Black Titanium" → same group "dark"
 * This allows the arbitrage engine to compare across colors for the same hardware.
 */

// ─── Semantic Color → Group Mapping ─────────────────────────────
const SEMANTIC_COLOR_MAP: Record<string, string> = {
  // Dark group
  'Black': 'dark',
  'Black Titanium': 'dark',
  'Space Black': 'dark',
  'Midnight': 'dark',
  'Graphite': 'dark',
  'Obsidian': 'dark',
  'Titanium Black': 'dark',
  'Navy': 'dark',

  // Light group
  'White': 'light',
  'White Titanium': 'light',
  'Starlight': 'light',
  'Silver': 'light',
  'Titanium White': 'light',
  'Titanium Silver': 'light',
  'Gray': 'light',
  'Titanium Gray': 'light',

  // Blue group
  'Blue': 'blue',
  'Blue Titanium': 'blue',
  'Fog Blue': 'blue',
  'Ultramarine': 'blue',
  'Titanium Blue': 'blue',
  'Titanium Silverblue': 'blue',
  'Silverblue': 'blue',

  // Gold/Warm group
  'Gold': 'gold',
  'Desert Titanium': 'gold',
  'Cosmic Orange': 'gold',
  'Titanium Orange': 'gold',

  // Natural/Neutral group
  'Natural Titanium': 'natural',
  'Sage': 'natural',
  'Lavender': 'natural',

  // Standalone groups
  'Green': 'green',
  'Titanium Green': 'green',
  'Pink': 'pink',
  'Red': 'red',
  'Purple': 'purple',
  'Deep Purple': 'purple',
  'Violet': 'purple',
  'Titanium Violet': 'purple',
  'Yellow': 'yellow',
  'Titanium Yellow': 'yellow',
  'Teal': 'teal',
  'Orange': 'orange',
  'Lilac': 'purple',
};

/**
 * Get the semantic color group for a given color name.
 * Falls back to lowercased color as its own group if not mapped.
 */
export function getSemanticColorGroup(color: string): string {
  return SEMANTIC_COLOR_MAP[color] ?? color.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Check if two colors are semantically equivalent (same group).
 */
export function areColorsSemanticallyEqual(colorA: string, colorB: string): boolean {
  return getSemanticColorGroup(colorA) === getSemanticColorGroup(colorB);
}

/**
 * Generate the global group ID for a product variant.
 * Format: slugify(brand-model-storageGb) → "apple-iphone-15-pro-max-256gb"
 * All colors of same model+storage share this ID.
 */
export function generateGlobalGroupId(brand: string, familyName: string, storageGb: number): string {
  const raw = `${brand} ${familyName} ${storageGb}gb`;
  return raw
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
