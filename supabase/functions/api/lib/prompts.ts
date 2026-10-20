// Prompt library — the stylist's brain and the image direction.
import { SUBTYPES, SUBTYPE_MAP, PATTERNS, FITS, COLOUR_FAMILIES, type ImagingKind } from './taxonomy.ts';
import { KEY_COLOURS, type KeyName } from './image.ts';

// ───────────────────────── Item analysis ─────────────────────────
export const ANALYSIS_SYSTEM = `You are the cataloguer for a private menswear wardrobe app. You look at phone photos of a single garment or accessory (front, back, sometimes a care/size label) and produce a precise catalogue record.

Rules:
- Identify the exact piece type using the provided subtype keys. Prefer the most specific key.
- Brand: only if a logo, label or unmistakable design signature is visible. Otherwise null. Use the brand's proper styling (e.g. "Arc'teryx", "Carhartt WIP", "Patagonia", "Polo Ralph Lauren").
- Colours: sample true colour, compensating for warm indoor light and phone white-balance. Give 1–4 colours with realistic hex and share (0–1).
- Read size, fibre content and care from any label photo. Do not invent them.
- description: 2–3 sentences a stylist would find useful — cut, fabric hand, details, character, how it would sit on a tall, broad-shouldered man.
- render_notes: an exhaustive visual spec for an image model to reproduce the item faithfully: collar/neckline, closure (count buttons, zip type & colour), pockets (position, flap, count), seams, hems, cuffs, hardware, logos (exact text, colour, size, position — front vs back), graphics (describe precisely), texture, wash/fade. Never invent details you cannot see.
- current_state describes how it is laid out in the FRONT photo (e.g. "fully buttoned", "unzipped", "placket open, sleeves rolled").
- wear_modes: up to 3 alternative ways of wearing it that visibly change the silhouette in a product photo (e.g. "Unzipped" for a quarter-zip, "Open" for an overshirt). Include the as-photographed state first. Return [] if there is only one sensible way to wear it (tees, jeans, caps, most shoes).
- warmth & formality are integers from 1 to 5. Formality: 1 lounge/gym, 2 casual, 3 smart casual, 4 smart/business, 5 formal.
- tags: short lowercase style tags (e.g. "gorpcore", "workwear", "minimal", "preppy", "technical", "heritage", "streetwear", "summer", "statement", "graphic", "logo").`;

export function analysisSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'subtype', 'brand', 'colour_name', 'colours', 'colour_family', 'pattern', 'materials', 'fabric_weight', 'fit', 'size', 'warmth', 'formality', 'seasons', 'tags', 'description', 'render_notes', 'current_state', 'wear_modes', 'care'],
    properties: {
      name: { type: 'string', description: 'Short catalogue name, e.g. "Olive grandad-collar linen shirt". No brand.' },
      subtype: { type: 'string', enum: SUBTYPES.map((s) => s.key) },
      brand: { type: 'string', description: 'Empty string if not visible' },
      colour_name: { type: 'string', description: 'Plain colour name a retailer would use, e.g. "Faded black", "Olive", "Stone".' },
      colours: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['name', 'hex', 'share'],
          properties: { name: { type: 'string' }, hex: { type: 'string' }, share: { type: 'number' } },
        },
      },
      colour_family: { type: 'string', enum: COLOUR_FAMILIES.map((c) => c.key) },
      pattern: { type: 'string', enum: PATTERNS },
      materials: { type: 'array', items: { type: 'string' } },
      fabric_weight: { type: 'string', enum: ['light', 'mid', 'heavy'] },
      fit: { type: 'string', enum: [...FITS, 'Unknown'] },
      size: { type: 'string', description: 'Empty string if no label visible' },
      warmth: { type: 'integer', description: '1-5' },
      formality: { type: 'integer', description: '1-5' },
      seasons: { type: 'array', items: { type: 'string', enum: ['spring', 'summer', 'autumn', 'winter'] } },
      tags: { type: 'array', items: { type: 'string' } },
      description: { type: 'string' },
      render_notes: { type: 'string' },
      current_state: { type: 'string' },
      wear_modes: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['label', 'description'],
          properties: {
            label: { type: 'string', description: '1-3 words, e.g. "Zipped up"' },
            description: { type: 'string', description: 'Exact visual description of the garment in this state for an image model.' },
          },
        },
      },
      care: { type: 'string', description: 'Empty string if no care label visible' },
    },
  };
}

export interface Analysis {
  name: string; subtype: string; brand: string | null; colour_name: string;
  colours: { name: string; hex: string; share: number }[]; colour_family: string; pattern: string;
  materials: string[]; fabric_weight: string; fit: string | null; size: string | null; warmth: number; formality: number;
  seasons: string[]; tags: string[]; description: string; render_notes: string; current_state: string;
  wear_modes: { label: string; description: string }[]; care: string | null;
}

// ───────────────────────── Product photography ─────────────────────────
export type View = 'front' | 'back' | 'side';

const COMPOSITION: Record<ImagingKind, (view: View) => string> = {
  top: (v) => `Ghost-mannequin (invisible mannequin) e-commerce shot, ${v === 'back' ? 'back view' : 'front view'}, straight-on. The garment holds the 3D shape of an invisible, upright, broad-shouldered male torso: shoulders square, sleeves hanging naturally with a slight bend, hem level. The inside back neck may be visible at the collar opening.`,
  jacket: (v) => `Ghost-mannequin (invisible mannequin) e-commerce shot, ${v === 'back' ? 'back view' : 'front view'}, straight-on. The garment holds the 3D shape of an invisible, upright, broad-shouldered male torso with natural drape and volume; sleeves hang naturally; collar and lapels sit as worn.`,
  bottom: (v) => `Ghost-mannequin e-commerce shot of the trousers/shorts, ${v === 'back' ? 'back view' : 'front view'}, straight-on, as if worn by invisible legs standing straight, waistband open and round, legs falling naturally with realistic break at the hem.`,
  shoe: (v) => v === 'front'
    ? 'E-commerce still life of the PAIR of shoes, front three-quarter view, both shoes side by side and slightly angled, laces neat, as on a premium retailer product page.'
    : 'E-commerce still life of the PAIR of shoes, clean lateral side profile with toes pointing LEFT; the far shoe sits slightly behind and offset so both are visible, as on a premium retailer product page.',
  cap: (v) => v === 'back' ? 'E-commerce shot of the cap from behind showing the strap/closure, shaped as if on an invisible head.' : 'E-commerce shot of the cap, front three-quarter view, crown shaped as if on an invisible head, brim curved naturally.',
  beanie: () => 'E-commerce shot of the beanie, front view, shaped as if on an invisible head, cuff folded neatly.',
  hat: () => 'E-commerce shot of the hat, front three-quarter view, shaped as if on an invisible head.',
  bag: (v) => `E-commerce still life of the bag, ${v === 'back' ? 'back' : 'front'} view, standing upright, lightly stuffed to hold its shape, straps arranged neatly.`,
  belt: () => 'E-commerce still life of the belt, loosely coiled with the buckle facing the camera.',
  watch: () => 'E-commerce still life of the watch, dial facing camera at a slight angle, strap/bracelet closed in a natural oval.',
  eyewear: () => 'E-commerce still life of the eyewear, front view, temples open.',
  jewellery: () => 'E-commerce still life of the jewellery piece laid out cleanly, centred.',
  scarf: () => 'E-commerce still life of the scarf, folded neatly in a soft drape.',
  small: () => 'E-commerce still life of the item, centred, neatly arranged.',
};

export function productShotPrompt(args: {
  kind: ImagingKind;
  view: View;
  key: KeyName;
  name: string;
  renderNotes?: string | null;
  colourName?: string | null;
  state?: string | null;
  referenceNote: string;
}) {
  const k = KEY_COLOURS[args.key];
  return [
    `Create a professional e-commerce product photograph of this exact ${args.name}${args.colourName ? ` in ${args.colourName}` : ''}.`,
    args.referenceNote,
    COMPOSITION[args.kind](args.view),
    args.state ? `Garment state: ${args.state}.` : '',
    `Fidelity is critical: reproduce the real item exactly — same colour (corrected for neutral daylight), fabric texture, weave, wash/fading, stitching, buttons, zips, pockets, labels and every logo/graphic with identical text, colour, scale and placement. Do not add, remove, redesign or "improve" any detail. No extra logos or text.`,
    args.renderNotes ? `Item details to preserve: ${args.renderNotes}` : '',
    `Make it look freshly steamed and crease-free but keep natural fabric character. Soft, even, diffused studio lighting from the front, true colour.`,
    `BACKGROUND: a perfectly flat, uniform, solid ${k.name} (${k.hex}) chroma-key backdrop filling the entire frame edge to edge. No gradient, no vignette, no floor, no horizon, no cast shadow, no reflection, no props, no hanger, no mannequin, no person, no hands. The ${k.name} must not appear anywhere on the item itself.`,
    `Frame the whole item centred with generous margin on all sides; nothing cropped.`,
  ].filter(Boolean).join('\n');
}

export function aspectFor(kind: ImagingKind, view: View): '3:4' | '4:3' | '1:1' {
  if (kind === 'shoe') return view === 'side' ? '4:3' : '1:1';
  if (['cap', 'beanie', 'hat', 'belt', 'watch', 'eyewear', 'jewellery', 'small', 'scarf'].includes(kind)) return '1:1';
  return '3:4';
}

export function viewsFor(subtype?: string | null): View[] {
  const kind = (subtype && SUBTYPE_MAP[subtype]?.kind) || 'top';
  if (kind === 'shoe') return ['side', 'front'];
  if (['belt', 'watch', 'eyewear', 'jewellery', 'small', 'scarf', 'beanie', 'hat'].includes(kind)) return ['front'];
  return ['front', 'back'];
}

// ───────────────────────── Stylist ─────────────────────────
export const STYLE_CANON = `STYLE CANON (how you think about clothes)
Proportion & fit
- Balance the silhouette. A tall, broad-shouldered frame carries length and volume well: longer coats (knee-ish), relaxed/straight or wide trousers that balance the shoulders, slightly dropped or natural shoulders on casualwear. Avoid tight, skinny bottoms under broad shoulders (top-heavy) and very cropped/boxy tops that make the torso look wide and short unless the trouser rise and width compensate.
- Trouser rise and width set the whole look. Mid-to-high rise with a relaxed straight leg is the modern default; let hems break lightly or sit cleanly on the shoe; wide legs want a substantial shoe.
- Tops: shoulder seam at or just past the shoulder for casual pieces; knitwear should drape, not cling. Tuck shirts with tailored trousers; leave camp shirts, overshirts and tees untucked unless styling is deliberate.
Colour
- Build on an anchor of neutrals (navy, charcoal, stone, ecru, olive, brown, black) and add at most one accent. Tonal and near-tonal outfits (e.g. olive/khaki/brown; navy/denim/ecru) read expensive.
- Repeat a colour once somewhere else in the outfit (cap echoing trainers, belt echoing shoes) for cohesion.
- Black works best in all-black or with crisp white/grey; brown/olive families sit better with warm neutrals. Denim is a neutral.
Texture
- Mix textures within a palette: crisp poplin vs chunky knit, nylon shell vs wool, suede vs denim. Texture contrast is what makes simple outfits look considered.
Formality coherence
- Keep pieces within ±1 formality of each other, then deliberately break the rule once (tailored trousers + trail runner, overcoat + hoodie, knit polo + jeans). Footwear sets the register more than anything else.
- High-status quiet pieces (Ralph Lauren, Lacoste, Stone Island, Prada, Burberry) work best paired with plain, well-made basics rather than other loud labels.
Statement pieces
- One statement per outfit, max (a graphic tee, a bold check, a rare trainer, a technical jacket). Everything else supports it.
Seasonality
- Respect weather: layer for UK autumn/winter (base + mid + outer, a beanie or cap), breathable linen/cotton in summer. Mention what to do if it rains.
Accessories
- Accessories are optional finishing: a watch, a minimal chain or ring, a cap or beanie, a belt that matches the shoes in formal contexts. Never force them.
`;

export const ADAM_DEFAULT_SEED = `Minimal smart-casual and workwear: high-quality, fashionable basics done well, with modern streetwear and gorpcore influences. Focus on well-fitting, well-balanced garments (not tight) that complement natural proportions (tall, broad-shouldered). Loves heavy knits, good jeans, good boots, proper rare fashion trainers, hiking boots, technical outerwear, overshirts, minimal jewellery, overcoats, graphic tees, camp shirts, cotton and linen shirts, technical shorts, chinos and linens, beachwear, high-quality suits, leather jackets, caps and beanies, watches, crew sweaters. No more than one statement piece per outfit. Closest overall reference: Ronning, with a bit more streetwear. Likes high-status quieter pieces from Ralph Lauren, Lacoste, Stone Island; Prada and Burberry for smarter things; everyday Carhartt, Patagonia, Merrell, Arket, Uniqlo, Birkenstock, Casio, Columbia, Dickies, Gant, Norse Projects. Would never wear: anything super eclectic (top hats, steampunk), tassels, bells, sparkles, leather trousers, ripped skinny jeans, trashy designer (Alexander McQueen trainers, Hugo Boss tees — anything you'd find in an out-of-town outlet), overhyped fake fashion (Yeezys). Trusted voices: Derek Guy for smart/tailoring; Mr Porter, GQ, Highsnobiety, British Vogue, Opumo for everyday.`;

export function stylistSystem(ctx: {
  name: string;
  seed: string;
  dna?: unknown;
  body?: string;
  trend?: string | null;
  today: string;
  weather?: string | null;
}) {
  return `You are Lit Fits — ${ctx.name}'s personal stylist, living in his phone and working ONLY from the clothes he actually owns.

Voice: British English. Editorial, confident, concise, a little dry (think a good menswear editor, not a hype merchant). Never gushing, never sycophantic. Short sentences. No emojis.

Today: ${ctx.today}.${ctx.weather ? ` Weather: ${ctx.weather}.` : ''}

WHO HE IS
${ctx.seed}
${ctx.body ? `Body: ${ctx.body}` : ''}
${ctx.dna ? `\nLEARNED STYLE DNA (from his saved looks, likes and wear history — weight this heavily):\n${typeof ctx.dna === 'string' ? ctx.dna : JSON.stringify(ctx.dna)}` : ''}

${STYLE_CANON}
${ctx.trend ? `CURRENT TREND BRIEF (use selectively, only where it suits him):\n${ctx.trend}\n` : ''}
HOW YOU WORK
- The WARDROBE list is ground truth. Every item you put in a look must be referenced by its #number from that list. Never invent pieces as if he owns them.
- A complete look normally has: base (or one-piece) + bottom + feet, with mid/outer/head/accessories when weather and occasion call for them. Respect layering logic (base under mid under outer).
- Prefer pieces that are available (laundry state clean/worn) when the list shows states, unless he asks otherwise. Mention if a key piece is in the wash or storage.
- Give variety across looks in a set: different anchors, colour stories and moods. Surface under-used pieces (look_count 0) when they genuinely fit — that's a big part of your job.
- If a look would be meaningfully better with a piece he does NOT own, still build the best look from what he has, and add that missing piece in "missing" (generic description: type, colour, material — no brand needed) explaining why. Keep this honest and occasional, not every look.
- Specify wear modes (e.g. "Open" vs "Buttoned") using the mode labels listed for an item when it matters, and give 1-2 concrete styling moves (tuck, roll, cuff, layering order).
- Be decisive. If the request is vague, make sensible assumptions and say them in one line.`;
}

export const PRESENT_LOOK_TOOL = {
  name: 'present_look',
  description: 'Present one complete outfit built from his wardrobe. Call once per look, in the order you want them shown.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'items', 'why'],
    properties: {
      title: { type: 'string', description: '2-5 word editorial name for the look, e.g. "Olive on olive, technical feet".' },
      occasion: { type: 'string' },
      why: { type: 'string', description: 'One or two sentences on why it works (proportion, colour, texture).' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Item reference from the wardrobe list as #number, e.g. "#12"' },
            mode: { type: 'string', description: 'Wear mode label if relevant' },
            note: { type: 'string', description: 'Very short styling note for this piece (e.g. "tucked", "sleeves pushed").' },
          },
        },
      },
      styling: { type: 'string', description: 'Optional extra styling moves.' },
      missing: {
        type: 'array',
        description: 'Pieces he does not own that would elevate this look (optional, generic descriptions).',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'slot', 'why'],
          properties: {
            title: { type: 'string', description: 'e.g. "Dark brown suede penny loafers"' },
            slot: { type: 'string', enum: ['head', 'outer', 'mid', 'base', 'bottom', 'feet', 'accessory'] },
            subtype: { type: 'string', description: 'Closest taxonomy subtype key if obvious' },
            colour: { type: 'string' },
            why: { type: 'string' },
          },
        },
      },
    },
  },
};

// ───────────────────────── Render (digital twin) ─────────────────────────
export function renderPrompt(args: {
  heightCm?: number | null;
  weightKg?: number | null;
  build?: string | null;
  appearance?: string | null;
  garments: { label: string; how?: string }[];
  scene: string;
  extra?: string | null;
  styling?: string | null;
  refsNote: string;
}) {
  const body = [
    args.heightCm ? `${Math.round(args.heightCm)} cm tall` : null,
    args.weightKg ? `${Math.round(args.weightKg)} kg` : null,
    args.build,
  ].filter(Boolean).join(', ');
  return [
    `Photorealistic full-length fashion photograph of the man shown in the identity reference photos, wearing exactly the outfit made of the garment reference images.`,
    args.refsNote,
    `IDENTITY: keep his face, hair (length, colour, texture, parting), beard, skin tone, freckles and eye colour exactly as in the identity photos. He must be clearly recognisable as the same person. Do not beautify or change his features.`,
    body ? `BODY: ${body}. Keep his real proportions from the full-length reference; natural, relaxed stance.` : '',
    args.appearance ? `Appearance notes: ${args.appearance}` : '',
    `OUTFIT (wear every piece, nothing else visible except plain underlayers if needed):`,
    ...args.garments.map((g, i) => `  ${i + 1}. ${g.label}${g.how ? ` — ${g.how}` : ''}`),
    `Reproduce each garment faithfully: same colour, fabric, fit, logos/graphics and details as its reference image. Garments should fit him realistically with natural drape and creasing — balanced, not tight.`,
    args.styling ? `Styling: ${args.styling}` : '',
    `SCENE: ${args.scene}`,
    args.extra ? `Additional direction: ${args.extra}` : '',
    `Full body in frame from head to shoes, camera at chest height, 50mm lens look, editorial menswear lookbook quality, natural skin texture, no text, no watermark.`,
  ].filter(Boolean).join('\n');
}

export const SCENES: Record<string, string> = {
  studio: 'Minimal photo studio with a warm off-white plaster wall and pale concrete floor, soft natural daylight from a large window on the left, gentle shadows. Calm, editorial, Studio Nicholson / Our Legacy lookbook mood.',
  street: 'A quiet London street in Marylebone or Clerkenwell — Georgian brick and stone, overcast soft daylight, slight depth of field. Candid street-style photograph.',
  night: 'Night-time city street with direct on-camera flash, crisp shadows behind him, slightly grainy film look, Palace / Highsnobiety editorial energy.',
  outdoors: 'Outdoors on a British coastal or moorland path, soft overcast light, muted natural palette — technical outerwear editorial feel.',
  summer: 'Sun-drenched Mediterranean old-town street in late afternoon golden light, warm stone walls, relaxed holiday mood.',
};
