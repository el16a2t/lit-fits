// Lit Fits menswear taxonomy — shared verbatim with supabase/functions/api/lib/taxonomy.ts
// Keep this file dependency-free so it can be copied to the Deno edge runtime.

export type Slot = 'head' | 'outer' | 'mid' | 'base' | 'bottom' | 'feet' | 'accessory' | 'onepiece';

/** How the product shot is composed for this kind of piece. */
export type ImagingKind =
  | 'top' | 'jacket' | 'bottom' | 'shoe' | 'cap' | 'beanie' | 'hat'
  | 'bag' | 'belt' | 'watch' | 'eyewear' | 'jewellery' | 'scarf' | 'small';

export type CategoryKey =
  | 'outerwear' | 'tailoring' | 'knitwear' | 'sweats' | 'overshirts' | 'shirts' | 'tops'
  | 'trousers' | 'shorts' | 'swim' | 'footwear' | 'headwear' | 'accessories' | 'bags' | 'jewellery';

export interface Subtype {
  key: string;
  label: string;
  category: CategoryKey;
  slot: Slot;
  kind: ImagingKind;
  warmth: number; // 1 (very light) – 5 (very warm)
  formality: number; // 1 (lounge) – 5 (formal)
  modes?: string[]; // common alternative ways to wear it
}

export const SLOTS: { key: Slot; label: string; short: string }[] = [
  { key: 'head', label: 'Head', short: 'HD' },
  { key: 'outer', label: 'Outer', short: 'OU' },
  { key: 'mid', label: 'Mid', short: 'MD' },
  { key: 'base', label: 'Base', short: 'BS' },
  { key: 'bottom', label: 'Bottom', short: 'BT' },
  { key: 'feet', label: 'Feet', short: 'FT' },
  { key: 'accessory', label: 'Accessories', short: 'AC' },
  { key: 'onepiece', label: 'One-piece', short: 'OP' },
];

export const SLOT_ORDER: Slot[] = ['head', 'outer', 'mid', 'base', 'onepiece', 'bottom', 'feet', 'accessory'];

export const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'outerwear', label: 'Outerwear' },
  { key: 'tailoring', label: 'Tailoring' },
  { key: 'knitwear', label: 'Knitwear' },
  { key: 'sweats', label: 'Sweats & Fleece' },
  { key: 'overshirts', label: 'Overshirts' },
  { key: 'shirts', label: 'Shirts' },
  { key: 'tops', label: 'Tees & Polos' },
  { key: 'trousers', label: 'Trousers & Jeans' },
  { key: 'shorts', label: 'Shorts' },
  { key: 'swim', label: 'Swim' },
  { key: 'footwear', label: 'Footwear' },
  { key: 'headwear', label: 'Headwear' },
  { key: 'accessories', label: 'Accessories' },
  { key: 'bags', label: 'Bags' },
  { key: 'jewellery', label: 'Jewellery & Watches' },
];

const OPEN_CLOSED = ['Closed', 'Open'];
const ZIP = ['Zipped up', 'Unzipped'];
const BUTTON = ['Buttoned', 'Open'];

const s = (
  key: string, label: string, category: CategoryKey, slot: Slot, kind: ImagingKind,
  warmth: number, formality: number, modes?: string[],
): Subtype => ({ key, label, category, slot, kind, warmth, formality, modes });

export const SUBTYPES: Subtype[] = [
  // Outerwear
  s('coat_overcoat', 'Overcoat', 'outerwear', 'outer', 'jacket', 5, 4, BUTTON),
  s('coat_topcoat', 'Topcoat – lightweight', 'outerwear', 'outer', 'jacket', 3, 4, BUTTON),
  s('coat_trench', 'Trench coat', 'outerwear', 'outer', 'jacket', 3, 4, ['Belted', 'Open']),
  s('coat_mac', 'Mac / raincoat', 'outerwear', 'outer', 'jacket', 2, 3, BUTTON),
  s('coat_car', 'Car coat', 'outerwear', 'outer', 'jacket', 4, 3, BUTTON),
  s('coat_peacoat', 'Peacoat', 'outerwear', 'outer', 'jacket', 5, 3, BUTTON),
  s('coat_duffle', 'Duffle coat', 'outerwear', 'outer', 'jacket', 5, 2, BUTTON),
  s('coat_parka', 'Parka', 'outerwear', 'outer', 'jacket', 5, 2, ZIP),
  s('coat_puffer', 'Puffer jacket', 'outerwear', 'outer', 'jacket', 5, 1, ZIP),
  s('coat_down_long', 'Down coat – long', 'outerwear', 'outer', 'jacket', 5, 2, ZIP),
  s('jacket_shell', 'Technical shell', 'outerwear', 'outer', 'jacket', 2, 1, ZIP),
  s('jacket_softshell', 'Softshell', 'outerwear', 'outer', 'jacket', 3, 1, ZIP),
  s('jacket_insulated', 'Insulated jacket', 'outerwear', 'outer', 'jacket', 4, 1, ZIP),
  s('jacket_windbreaker', 'Windbreaker / anorak', 'outerwear', 'outer', 'jacket', 2, 1, ZIP),
  s('jacket_harrington', 'Harrington', 'outerwear', 'outer', 'jacket', 2, 2, ZIP),
  s('jacket_bomber', 'Bomber', 'outerwear', 'outer', 'jacket', 3, 2, ZIP),
  s('jacket_coach', 'Coach jacket', 'outerwear', 'outer', 'jacket', 2, 1, BUTTON),
  s('jacket_chore', 'Chore / work jacket', 'outerwear', 'outer', 'jacket', 3, 2, BUTTON),
  s('jacket_trucker', 'Denim / trucker jacket', 'outerwear', 'outer', 'jacket', 3, 2, BUTTON),
  s('jacket_leather_biker', 'Leather jacket – biker', 'outerwear', 'outer', 'jacket', 3, 2, ZIP),
  s('jacket_leather_racer', 'Leather jacket – racer', 'outerwear', 'outer', 'jacket', 3, 3, ZIP),
  s('jacket_suede', 'Suede jacket', 'outerwear', 'outer', 'jacket', 3, 3, OPEN_CLOSED),
  s('jacket_field', 'Field jacket', 'outerwear', 'outer', 'jacket', 3, 2, OPEN_CLOSED),
  s('jacket_waxed', 'Waxed jacket', 'outerwear', 'outer', 'jacket', 3, 2, OPEN_CLOSED),
  s('jacket_quilted', 'Quilted jacket', 'outerwear', 'outer', 'jacket', 3, 2, OPEN_CLOSED),
  s('jacket_varsity', 'Varsity jacket', 'outerwear', 'outer', 'jacket', 3, 1, BUTTON),
  s('gilet_down', 'Gilet – down / padded', 'outerwear', 'mid', 'top', 3, 1, ZIP),
  s('gilet_fleece', 'Gilet – fleece', 'outerwear', 'mid', 'top', 2, 1, ZIP),
  // Tailoring
  s('blazer', 'Blazer', 'tailoring', 'outer', 'jacket', 3, 4, BUTTON),
  s('sport_coat', 'Sport coat / tweed', 'tailoring', 'outer', 'jacket', 4, 4, BUTTON),
  s('suit_jacket', 'Suit jacket', 'tailoring', 'outer', 'jacket', 3, 5, BUTTON),
  s('suit_trousers', 'Suit trousers', 'tailoring', 'bottom', 'bottom', 3, 5),
  s('waistcoat', 'Waistcoat', 'tailoring', 'mid', 'top', 2, 5, BUTTON),
  s('dinner_jacket', 'Dinner jacket', 'tailoring', 'outer', 'jacket', 3, 5, BUTTON),
  // Knitwear
  s('knit_crew_wool', 'Crewneck – wool', 'knitwear', 'mid', 'top', 4, 3),
  s('knit_crew_cotton', 'Crewneck – cotton', 'knitwear', 'mid', 'top', 3, 3),
  s('knit_cable', 'Cable knit', 'knitwear', 'mid', 'top', 5, 3),
  s('knit_fisherman', 'Fisherman / Aran', 'knitwear', 'mid', 'top', 5, 2),
  s('knit_rollneck', 'Rollneck', 'knitwear', 'mid', 'top', 4, 4),
  s('knit_mockneck', 'Mock neck', 'knitwear', 'mid', 'top', 3, 3),
  s('knit_vneck', 'V-neck', 'knitwear', 'mid', 'top', 3, 3),
  s('knit_quarter_zip', 'Quarter-zip knit', 'knitwear', 'mid', 'top', 4, 3, ZIP),
  s('knit_zip_through', 'Zip-through knit', 'knitwear', 'mid', 'top', 4, 3, ZIP),
  s('knit_cardigan', 'Cardigan', 'knitwear', 'mid', 'top', 3, 3, BUTTON),
  s('knit_shawl', 'Shawl-collar cardigan', 'knitwear', 'mid', 'top', 5, 3, BUTTON),
  s('knit_mohair', 'Mohair / brushed knit', 'knitwear', 'mid', 'top', 4, 3),
  s('knit_vest', 'Sweater vest', 'knitwear', 'mid', 'top', 2, 3),
  s('knit_polo', 'Knitted polo', 'knitwear', 'base', 'top', 2, 3, ['Buttoned', 'Open collar']),
  s('knit_tee', 'Knitted tee', 'knitwear', 'base', 'top', 1, 3),
  // Sweats & fleece
  s('sweat_crew', 'Sweatshirt – crewneck', 'sweats', 'mid', 'top', 3, 1),
  s('sweat_hoodie', 'Hoodie – pullover', 'sweats', 'mid', 'top', 3, 1),
  s('sweat_zip_hoodie', 'Hoodie – zip', 'sweats', 'mid', 'top', 3, 1, ZIP),
  s('sweat_quarter_zip', 'Sweatshirt – quarter-zip', 'sweats', 'mid', 'top', 3, 2, ZIP),
  s('fleece_full_zip', 'Fleece – full zip', 'sweats', 'mid', 'top', 4, 1, ZIP),
  s('fleece_pullover', 'Fleece – half zip / snap', 'sweats', 'mid', 'top', 4, 1, ['Closed', 'Open placket']),
  s('track_top', 'Track top', 'sweats', 'mid', 'top', 2, 1, ZIP),
  // Overshirts
  s('overshirt_wool', 'Overshirt – wool', 'overshirts', 'mid', 'top', 4, 3, BUTTON),
  s('overshirt_flannel', 'Overshirt – flannel / check', 'overshirts', 'mid', 'top', 3, 2, BUTTON),
  s('overshirt_cord', 'Overshirt – corduroy', 'overshirts', 'mid', 'top', 3, 2, BUTTON),
  s('overshirt_denim', 'Overshirt – denim', 'overshirts', 'mid', 'top', 3, 2, BUTTON),
  s('overshirt_canvas', 'Overshirt – canvas / work', 'overshirts', 'mid', 'top', 3, 2, BUTTON),
  s('overshirt_quilted', 'Overshirt – quilted', 'overshirts', 'mid', 'top', 4, 2, BUTTON),
  s('overshirt_cpo', 'CPO shirt', 'overshirts', 'mid', 'top', 3, 2, BUTTON),
  // Shirts
  s('shirt_oxford', 'Oxford shirt', 'shirts', 'base', 'top', 2, 3, ['Buttoned', 'Sleeves rolled']),
  s('shirt_poplin', 'Poplin shirt', 'shirts', 'base', 'top', 2, 4, ['Buttoned', 'Sleeves rolled']),
  s('shirt_dress', 'Dress shirt', 'shirts', 'base', 'top', 2, 5),
  s('shirt_linen', 'Linen shirt', 'shirts', 'base', 'top', 1, 3, ['Buttoned', 'Open over tee', 'Sleeves rolled']),
  s('shirt_chambray', 'Chambray shirt', 'shirts', 'base', 'top', 2, 2, ['Buttoned', 'Sleeves rolled']),
  s('shirt_denim', 'Denim shirt', 'shirts', 'base', 'top', 2, 2, ['Buttoned', 'Open over tee']),
  s('shirt_flannel', 'Flannel shirt', 'shirts', 'base', 'top', 3, 2, ['Buttoned', 'Open over tee']),
  s('shirt_corduroy', 'Corduroy shirt', 'shirts', 'base', 'top', 3, 2, ['Buttoned', 'Open over tee']),
  s('shirt_camp', 'Camp-collar shirt', 'shirts', 'base', 'top', 1, 2, ['Buttoned', 'Open over tee']),
  s('shirt_grandad', 'Grandad-collar shirt', 'shirts', 'base', 'top', 1, 2, ['Buttoned', 'Open placket', 'Sleeves rolled']),
  s('shirt_popover', 'Popover shirt', 'shirts', 'base', 'top', 2, 2),
  s('shirt_western', 'Western shirt', 'shirts', 'base', 'top', 2, 2, BUTTON),
  s('shirt_short_sleeve', 'Short-sleeve shirt', 'shirts', 'base', 'top', 1, 2, BUTTON),
  s('shirt_seersucker', 'Seersucker shirt', 'shirts', 'base', 'top', 1, 2, BUTTON),
  s('shirt_technical', 'Technical / hiking shirt', 'shirts', 'base', 'top', 2, 1, BUTTON),
  // Tees & polos
  s('tee_plain', 'T-shirt – plain', 'tops', 'base', 'top', 1, 1),
  s('tee_graphic', 'T-shirt – graphic', 'tops', 'base', 'top', 1, 1),
  s('tee_pocket', 'T-shirt – pocket', 'tops', 'base', 'top', 1, 1),
  s('tee_heavyweight', 'T-shirt – heavyweight', 'tops', 'base', 'top', 1, 2),
  s('tee_longsleeve', 'Long-sleeve tee', 'tops', 'base', 'top', 2, 1),
  s('tee_henley', 'Henley', 'tops', 'base', 'top', 2, 2, ['Buttoned', 'Open placket']),
  s('polo_pique', 'Polo – piqué', 'tops', 'base', 'top', 1, 2, ['Buttoned', 'Open collar']),
  s('polo_longsleeve', 'Polo – long-sleeve', 'tops', 'base', 'top', 2, 3),
  s('polo_rugby', 'Rugby shirt', 'tops', 'base', 'top', 3, 2),
  s('tank', 'Tank / vest', 'tops', 'base', 'top', 1, 1),
  s('base_layer', 'Technical base layer', 'tops', 'base', 'top', 2, 1),
  // Trousers & jeans
  s('jeans_straight', 'Jeans – straight', 'trousers', 'bottom', 'bottom', 3, 2, ['Full length', 'Cuffed']),
  s('jeans_relaxed', 'Jeans – relaxed / loose', 'trousers', 'bottom', 'bottom', 3, 2, ['Full length', 'Cuffed']),
  s('jeans_slim', 'Jeans – slim', 'trousers', 'bottom', 'bottom', 3, 2),
  s('jeans_tapered', 'Jeans – tapered', 'trousers', 'bottom', 'bottom', 3, 2, ['Full length', 'Cuffed']),
  s('jeans_wide', 'Jeans – wide', 'trousers', 'bottom', 'bottom', 3, 2),
  s('chinos', 'Chinos', 'trousers', 'bottom', 'bottom', 2, 3, ['Full length', 'Cuffed']),
  s('trousers_pleated', 'Pleated trousers', 'trousers', 'bottom', 'bottom', 3, 4),
  s('trousers_wool', 'Wool trousers', 'trousers', 'bottom', 'bottom', 4, 4),
  s('trousers_linen', 'Linen trousers', 'trousers', 'bottom', 'bottom', 1, 3),
  s('trousers_cord', 'Corduroy trousers', 'trousers', 'bottom', 'bottom', 4, 3),
  s('trousers_work', 'Work / carpenter pants', 'trousers', 'bottom', 'bottom', 3, 1),
  s('trousers_cargo', 'Cargo / fatigues', 'trousers', 'bottom', 'bottom', 3, 1),
  s('trousers_drawstring', 'Drawstring / easy pants', 'trousers', 'bottom', 'bottom', 2, 2),
  s('trousers_technical', 'Technical / hiking pants', 'trousers', 'bottom', 'bottom', 2, 1),
  s('trousers_track', 'Track pants', 'trousers', 'bottom', 'bottom', 2, 1),
  s('joggers', 'Joggers / sweatpants', 'trousers', 'bottom', 'bottom', 3, 1),
  // Shorts
  s('shorts_chino', 'Chino shorts', 'shorts', 'bottom', 'bottom', 1, 2),
  s('shorts_technical', 'Technical shorts', 'shorts', 'bottom', 'bottom', 1, 1),
  s('shorts_linen', 'Linen shorts', 'shorts', 'bottom', 'bottom', 1, 2),
  s('shorts_denim', 'Denim shorts', 'shorts', 'bottom', 'bottom', 1, 1),
  s('shorts_sweat', 'Sweat shorts', 'shorts', 'bottom', 'bottom', 1, 1),
  s('shorts_cargo', 'Cargo shorts', 'shorts', 'bottom', 'bottom', 1, 1),
  s('shorts_tailored', 'Pleated / tailored shorts', 'shorts', 'bottom', 'bottom', 1, 3),
  // Swim
  s('swim_shorts', 'Swim shorts', 'swim', 'bottom', 'bottom', 1, 1),
  s('swim_trunks', 'Swim trunks – short', 'swim', 'bottom', 'bottom', 1, 1),
  // Footwear
  s('trainer_court', 'Trainers – court / low', 'footwear', 'feet', 'shoe', 2, 2),
  s('trainer_runner', 'Trainers – runner / retro', 'footwear', 'feet', 'shoe', 2, 1),
  s('trainer_skate', 'Trainers – skate', 'footwear', 'feet', 'shoe', 2, 1),
  s('trainer_hightop', 'Trainers – high-top', 'footwear', 'feet', 'shoe', 2, 1),
  s('trainer_trail', 'Trail runners', 'footwear', 'feet', 'shoe', 2, 1),
  s('trainer_canvas', 'Canvas plimsolls', 'footwear', 'feet', 'shoe', 1, 1),
  s('boot_chelsea', 'Chelsea boots', 'footwear', 'feet', 'shoe', 3, 3),
  s('boot_chukka', 'Chukka / desert boots', 'footwear', 'feet', 'shoe', 3, 3),
  s('boot_service', 'Service / lace-up boots', 'footwear', 'feet', 'shoe', 4, 3),
  s('boot_work', 'Work boots', 'footwear', 'feet', 'shoe', 4, 2),
  s('boot_hiking', 'Hiking boots', 'footwear', 'feet', 'shoe', 4, 1),
  s('loafer_penny', 'Loafers – penny', 'footwear', 'feet', 'shoe', 2, 4),
  s('loafer_horsebit', 'Loafers – horsebit', 'footwear', 'feet', 'shoe', 2, 4),
  s('shoe_derby', 'Derby shoes', 'footwear', 'feet', 'shoe', 2, 4),
  s('shoe_oxford', 'Oxford shoes', 'footwear', 'feet', 'shoe', 2, 5),
  s('shoe_brogue', 'Brogues', 'footwear', 'feet', 'shoe', 2, 4),
  s('shoe_monk', 'Monk straps', 'footwear', 'feet', 'shoe', 2, 4),
  s('shoe_boat', 'Boat shoes', 'footwear', 'feet', 'shoe', 1, 2),
  s('sandal_footbed', 'Sandals – footbed', 'footwear', 'feet', 'shoe', 1, 1),
  s('sandal_technical', 'Sandals – technical', 'footwear', 'feet', 'shoe', 1, 1),
  s('clog', 'Clogs', 'footwear', 'feet', 'shoe', 2, 1),
  s('slider', 'Sliders', 'footwear', 'feet', 'shoe', 1, 1),
  s('espadrille', 'Espadrilles', 'footwear', 'feet', 'shoe', 1, 2),
  // Headwear
  s('cap_baseball', 'Cap – baseball', 'headwear', 'head', 'cap', 1, 1),
  s('cap_5panel', 'Cap – 5-panel / camp', 'headwear', 'head', 'cap', 1, 1),
  s('cap_trucker', 'Cap – trucker', 'headwear', 'head', 'cap', 1, 1),
  s('beanie', 'Beanie', 'headwear', 'head', 'beanie', 4, 1, ['Cuffed', 'Uncuffed']),
  s('bucket_hat', 'Bucket hat', 'headwear', 'head', 'hat', 1, 1),
  s('flat_cap', 'Flat cap', 'headwear', 'head', 'hat', 2, 2),
  // Accessories
  s('belt_leather', 'Belt – leather', 'accessories', 'accessory', 'belt', 1, 3),
  s('belt_webbing', 'Belt – webbing', 'accessories', 'accessory', 'belt', 1, 1),
  s('scarf', 'Scarf', 'accessories', 'accessory', 'scarf', 5, 3),
  s('gloves', 'Gloves', 'accessories', 'accessory', 'small', 5, 3),
  s('tie', 'Tie', 'accessories', 'accessory', 'small', 1, 5),
  s('pocket_square', 'Pocket square', 'accessories', 'accessory', 'small', 1, 5),
  s('sunglasses', 'Sunglasses', 'accessories', 'accessory', 'eyewear', 1, 2),
  s('glasses', 'Glasses', 'accessories', 'accessory', 'eyewear', 1, 3),
  s('socks', 'Socks', 'accessories', 'accessory', 'small', 2, 2),
  s('accessory_other', 'Other accessory', 'accessories', 'accessory', 'small', 1, 2),
  // Bags
  s('bag_tote', 'Bag – tote', 'bags', 'accessory', 'bag', 1, 2),
  s('bag_backpack', 'Bag – backpack', 'bags', 'accessory', 'bag', 1, 1),
  s('bag_crossbody', 'Bag – crossbody / sling', 'bags', 'accessory', 'bag', 1, 1),
  s('bag_briefcase', 'Bag – briefcase', 'bags', 'accessory', 'bag', 1, 4),
  s('bag_holdall', 'Bag – holdall / weekender', 'bags', 'accessory', 'bag', 1, 2),
  // Jewellery & watches
  s('watch', 'Watch', 'jewellery', 'accessory', 'watch', 1, 3),
  s('necklace', 'Necklace / chain', 'jewellery', 'accessory', 'jewellery', 1, 2),
  s('bracelet', 'Bracelet', 'jewellery', 'accessory', 'jewellery', 1, 2),
  s('ring', 'Ring', 'jewellery', 'accessory', 'jewellery', 1, 2),
];

export const SUBTYPE_MAP: Record<string, Subtype> = Object.fromEntries(SUBTYPES.map((x) => [x.key, x]));

export const subtypeLabel = (key?: string | null) => (key && SUBTYPE_MAP[key]?.label) || 'Piece';

export const PATTERNS = [
  'Solid', 'Marl / heather', 'Check / plaid', 'Gingham', 'Houndstooth', 'Herringbone', 'Stripe',
  'Pinstripe', 'Graphic', 'Logo', 'Camo', 'Floral', 'Paisley', 'Fair Isle', 'Cable', 'Colour-block', 'Textured', 'Washed / faded',
];

export const MATERIALS = [
  'Cotton', 'Organic cotton', 'Linen', 'Wool', 'Merino', 'Lambswool', 'Cashmere', 'Mohair', 'Alpaca', 'Silk',
  'Denim', 'Selvedge denim', 'Corduroy', 'Twill', 'Canvas', 'Oxford cloth', 'Flannel', 'Seersucker', 'Jersey', 'Fleece',
  'Polyester', 'Recycled polyester', 'Nylon', 'GORE-TEX', 'Ripstop', 'Leather', 'Suede', 'Nubuck', 'Waxed cotton',
  'Down', 'Synthetic fill', 'Rubber', 'Hemp', 'Viscose', 'Tencel', 'Elastane', 'Gold', 'Silver', 'Steel', 'Titanium', 'Acetate',
];

export const FITS = ['Slim', 'Regular', 'Relaxed', 'Oversized', 'Boxy', 'Straight', 'Tapered', 'Wide', 'Cropped', 'Longline'];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

export const COLOUR_FAMILIES: { key: string; label: string; hex: string }[] = [
  { key: 'black', label: 'Black', hex: '#141414' },
  { key: 'charcoal', label: 'Charcoal', hex: '#3b3b3b' },
  { key: 'grey', label: 'Grey', hex: '#8d8d8a' },
  { key: 'white', label: 'White', hex: '#f4f3ef' },
  { key: 'ecru', label: 'Ecru / Cream', hex: '#e8e0cc' },
  { key: 'beige', label: 'Beige / Stone', hex: '#cbb99a' },
  { key: 'tan', label: 'Tan / Camel', hex: '#b08655' },
  { key: 'brown', label: 'Brown', hex: '#6b4a32' },
  { key: 'olive', label: 'Olive / Khaki', hex: '#6b6b45' },
  { key: 'green', label: 'Green', hex: '#2f6b45' },
  { key: 'navy', label: 'Navy', hex: '#1f2a44' },
  { key: 'blue', label: 'Blue', hex: '#3d6db5' },
  { key: 'denim', label: 'Denim', hex: '#5a7394' },
  { key: 'burgundy', label: 'Burgundy', hex: '#6d2333' },
  { key: 'red', label: 'Red', hex: '#b8322e' },
  { key: 'orange', label: 'Orange / Rust', hex: '#c8662c' },
  { key: 'yellow', label: 'Yellow / Mustard', hex: '#d4a72c' },
  { key: 'pink', label: 'Pink', hex: '#df9fa6' },
  { key: 'purple', label: 'Purple', hex: '#5e4a7b' },
  { key: 'multi', label: 'Multi', hex: '#999999' },
];

export const OCCASION_TAGS = [
  'Work', 'Client meeting', 'Smart casual', 'Weekend', 'Date night', 'Drinks', 'Dinner', 'Travel', 'Outdoors', 'Hiking',
  'Gym', 'Beach', 'Wedding', 'Lounge', 'Festival', 'City break',
];

export const LAUNDRY_STATES = [
  { key: 'clean', label: 'Clean' },
  { key: 'worn', label: 'Worn – wear again' },
  { key: 'wash', label: 'Wash pile' },
  { key: 'drying', label: 'Drying' },
  { key: 'storage', label: 'Storage unit' },
  { key: 'packed', label: 'Packed' },
] as const;

export const KNOWN_BRANDS = [
  'Acne Studios', 'Adidas', 'A.P.C.', "Arc'teryx", 'Arket', 'Asics', 'Auralee', 'Barbour', 'Birkenstock', 'Blundstone',
  'Burberry', 'C.P. Company', 'Carhartt WIP', 'Casio', 'Columbia', 'COS', 'Dickies', 'Dr. Martens', 'Drake’s', 'Folk',
  'G-Shock', 'Gant', 'Grenson', 'Hoka', 'J.Crew', 'Lacoste', 'Lady White Co.', 'Lemaire', 'Levi’s', 'Margaret Howell',
  'Merrell', 'New Balance', 'Nike', 'Norse Projects', 'Oliver Spencer', 'Our Legacy', 'Paraboot', 'Patagonia',
  'Polo Ralph Lauren', 'Prada', 'Ralph Lauren', 'Red Wing', 'Reiss', 'Salomon', 'Sunspel', 'Stone Island',
  'Studio Nicholson', 'The North Face', 'Toast', 'Uniqlo', 'Universal Works', 'Wax London', 'Zara', 'Ronning',
];

export function inferSlot(subtype?: string | null): Slot | null {
  return (subtype && SUBTYPE_MAP[subtype]?.slot) || null;
}
