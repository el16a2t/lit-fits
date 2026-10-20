# LIT FITS.

A private, single-user wardrobe app for Android: every piece you own photographed properly, catalogued, and styled by an AI that only works from what's in your wardrobe.

## What it does
- **Wardrobe** — grid/list, masonry, search, deep filters (slot, category, colour, brand, size, season, formality, warmth, tags, availability, never-styled) and sorts (incl. colour spectrum).
- **Capture → studio** — shoot front/back (side/front for shoes, plus an optional label). Photos upload in the background while you keep shooting. Claude catalogues the piece (type from a ~170-item menswear taxonomy, brand, colours, materials, size, warmth, formality, wear modes); Gemini re-shoots it as a ghost-mannequin product photo on a chroma-key backdrop, which is keyed to a transparent cut-out server-side.
- **Wear modes** — open/closed, zipped/unzipped… each confirmed mode gets its own product shot; toggle them anywhere.
- **Look canvas** — pieces fly in and float; drag, pinch, rotate, double-tap to bring forward, drop on the bin to remove; Tidy, AI Complete, swap, per-piece wear mode. Drafts persist until saved.
- **Mixer** — layer-aware rows (head/outer/mid/base/bottom/feet/accessories) on circular 3D rails; lock rows, add/remove rows, Smart ordering by compatibility with locked pieces, shake to shuffle.
- **See it on me** — digital twin built from your face/full-length photos + height/weight; renders any look in a chosen scene.
- **Stylist** — streaming chat that returns complete looks built only from your pieces (with wishlist suggestions for genuinely missing pieces), plus pairings per item, look completion, Shuffle, Rediscover, packing capsules with live forecasts, a weekly trend brief from respected menswear editors, and a learned Style DNA.

## Stack
Expo SDK 58 (React Native 0.88, New Architecture, Expo Router, Reanimated 4, Gesture Handler 3, FlashList 2) · Supabase (Postgres + RLS owner-lock, Storage, Realtime, Edge Function `api`, pg_net/pg_cron, Vault) · Claude Opus/Sonnet/Haiku 5.5 · Gemini image models · Open-Meteo.

## Shipping
`.github/workflows/ship.yml` — on every push to `main`: typecheck → if the native fingerprint changed, build a signed APK (EAS local build on the runner) and publish a GitHub Release; otherwise ship an over-the-air update to the installed app. Backend redeploys automatically when `SUPABASE_ACCESS_TOKEN` is set.

Repo secrets: `EXPO_TOKEN` (required), `SUPABASE_ACCESS_TOKEN` (optional).
