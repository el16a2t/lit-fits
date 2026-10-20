// Gemini image generation / editing client.
import { GEMINI_KEY, meter } from './core.ts';
import { fromBase64, toBase64 } from './image.ts';

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export const imagePart = (bytes: Uint8Array, mimeType = 'image/jpeg'): Part => ({ inlineData: { mimeType, data: toBase64(bytes) } });

export interface ImageGenOptions {
  model: string;
  parts: Part[];
  aspectRatio?: '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9';
  imageSize?: '1K' | '2K' | '4K';
  owner: string | null;
  fn: string;
}

export async function generateImage(o: ImageGenOptions): Promise<{ bytes: Uint8Array; mime: string; ms: number }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${o.model}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: o.parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { ...(o.aspectRatio ? { aspectRatio: o.aspectRatio } : {}), ...(o.imageSize ? { imageSize: o.imageSize } : {}) },
    },
  };
  const t0 = Date.now();
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      const parts: Array<{ inlineData?: { mimeType: string; data: string }; thought?: boolean; text?: string }> =
        data?.candidates?.[0]?.content?.parts ?? [];
      const img = [...parts].reverse().find((p) => p.inlineData && !p.thought);
      if (img?.inlineData) {
        meter(o.owner, o.fn, o.model, { images: 1 }).catch(() => {});
        return { bytes: fromBase64(img.inlineData.data), mime: img.inlineData.mimeType, ms: Date.now() - t0 };
      }
      const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? 'no image';
      last = `no image returned (${reason}) ${parts.map((p) => p.text ?? '').join(' ').slice(0, 200)}`;
      if (String(reason).includes('SAFETY') || String(reason).includes('PROHIBITED')) break;
    } else {
      last = `${res.status} ${(await res.text()).slice(0, 400)}`;
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`Gemini image error: ${last}`);
}

export async function embed(texts: string[], model = 'gemini-embedding-001'): Promise<number[][]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': GEMINI_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      requests: texts.map((t) => ({ model: `models/${model}`, content: { parts: [{ text: t }] }, outputDimensionality: 768 })),
    }),
  });
  if (!res.ok) throw new Error(`embed ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.embeddings ?? []).map((e: { values: number[] }) => e.values);
}
