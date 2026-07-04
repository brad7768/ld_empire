/** Mirror of data/catalog.json — keep in sync at build. Run: npm run build */
export type CatalogEntry = {
  slug: string;
  /** Integer cents CAD */
  priceCents: number;
  nameFr: string;
  nameEn: string;
};

export const PRODUCT_CATALOG: Record<string, CatalogEntry> = {
  p01: { slug: "manteau-laine", priceCents: 124000, nameFr: "Manteau Laine Architectural", nameEn: "Architectural Wool Coat" },
  p02: { slug: "mule-architecturale", priceCents: 78000, nameFr: "Mule Architecturale", nameEn: "Architectural Mule" },
  p03: { slug: "sac-box-espresso", priceCents: 7499, nameFr: "Robe oversize à carreaux Mia", nameEn: "Mia Oversized Plaid Dress" },
  p04: { slug: "blouse-soie", priceCents: 55000, nameFr: "Blouse Soie Drapée", nameEn: "Silk Drape Blouse" },
  p05: { slug: "jupe-asymetrique", priceCents: 89000, nameFr: "Jupe Midi Asymétrique", nameEn: "Asymmetric Midi Skirt" },
  p06: { slug: "sneaker-studio", priceCents: 9999, nameFr: "Sac à main Tom & Eva", nameEn: "Tom & Eva Handbag" },
  p07: { slug: "manchette-or", priceCents: 89000, nameFr: "Manchette Or Sculpturale", nameEn: "Sculptural Gold Cuff" },
  p08: { slug: "blazer-lin", priceCents: 6999, nameFr: "Escarpins élégants à bout pointu", nameEn: "Elegant pointed-toe pumps" },
  p09: { slug: "robe-biais", priceCents: 154000, nameFr: "Robe Coupe Biais Soie", nameEn: "Silk Bias Cut Dress" },
  p10: { slug: "parfum-nuit-collection-privee", priceCents: 92500, nameFr: "NUIT — Collection Privée Absolue", nameEn: "NUIT — Private Collection Absolue" },
  p11: { slug: "parfum-invictus-collection-privee", priceCents: 92500, nameFr: "INVICTUS — Collection Privée Absolue", nameEn: "INVICTUS — Private Collection Absolue" },
  p12: { slug: "parfum-intense-peach", priceCents: 89500, nameFr: "Intense Peach — Eau de parfum", nameEn: "Intense Peach — Eau de parfum" },
  p13: { slug: "parfum-fabulous-life", priceCents: 92500, nameFr: "FABULOUS LIFE — Collection Privée Absolue", nameEn: "FABULOUS LIFE — Private Collection Absolue" },
  p14: { slug: "parfum-sexy-vanilla-fragrance-world", priceCents: 92500, nameFr: "SEXY VANILLA — Collection Privée Absolue", nameEn: "SEXY VANILLA — Private Collection Absolue" },
  p15: { slug: "parfum-aqua-intense-collection-privee", priceCents: 92500, nameFr: "AQUA INTENSE — Collection Privée Paris", nameEn: "AQUA INTENSE — Private Collection Paris" },
  p16: { slug: "mule-bijou-stephan-paris", priceCents: 85000, nameFr: "Mule Bijou Cristal — Stephan Paris", nameEn: "Crystal Bow Mule — Stephan Paris" },
  p17: { slug: "nouveautes-signature-1", priceCents: 12999, nameFr: "Nouveautés Signature I", nameEn: "Signature New Arrivals I" },
  p18: { slug: "nouveautes-signature-2", priceCents: 10999, nameFr: "Nouveautés Signature II", nameEn: "Signature New Arrivals II" },
  p19: { slug: "nouveautes-signature-3", priceCents: 8999, nameFr: "Nouveautés Signature III", nameEn: "Signature New Arrivals III" },
  p20: { slug: "sac-a-main-elegance-fuchsia", priceCents: 19900, nameFr: "Sac à Main Élégance Fuchsia", nameEn: "Fuchsia Elegance Handbag" }
};
