import type { FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

type TournamentImage = { filename: string; content_type: string };

export function tournamentImageDelivery(mediaDir: string) {
  const thumbnails = new Map<string, Buffer>();
  const pending = new Map<string, Promise<Buffer | null>>();

  async function thumbnail(filename: string, source: () => Promise<Buffer>) {
    const cached = thumbnails.get(filename);
    if (cached) {
      thumbnails.delete(filename);
      thumbnails.set(filename, cached);
      return cached;
    }
    const existing = pending.get(filename);
    if (existing) return existing;
    if (pending.size >= 16) return null;
    const result = source().then(async bytes => {
      try {
        const image = await sharp(bytes, { limitInputPixels: 16_000_000 })
          .autoOrient()
          .resize(128, 128, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 88 })
          .toBuffer();
        thumbnails.set(filename, image);
        if (thumbnails.size > 256) thumbnails.delete(thumbnails.keys().next().value!);
        return image;
      } catch {
        return null;
      }
    }).finally(() => pending.delete(filename));
    pending.set(filename, result);
    return result;
  }

  return async function sendImage(request: FastifyRequest, reply: FastifyReply, media: TournamentImage, visibility: 'public' | 'private' = 'public') {
    const wantsThumbnail = (request.query as { size?: string }).size === '128';
    let source: Promise<Buffer> | undefined;
    const original = () => source ??= readFile(resolve(mediaDir, media.filename));
    const image = wantsThumbnail ? await thumbnail(media.filename, original) : null;
    const contentType = image ? 'image/webp' : media.content_type;
    if (visibility === 'private') {
      return reply.header('Cache-Control', 'private, no-store').type(contentType).send(image ?? await original());
    }
    const etag = `W/"${image ? 'webp128-v1-' : ''}${media.filename}"`;

    // Authorization is checked by the caller on every HTTP request, including revalidation.
    reply.header('ETag', etag)
      .header('Cache-Control', image ? 'public, max-age=300' : 'public, max-age=60');
    const requested = request.headers['if-none-match'];
    if (requested?.split(',').some(value => {
      const tag = value.trim();
      return tag === '*' || tag.replace(/^W\//, '') === etag.slice(2);
    })) return reply.code(304).send();
    return reply.type(contentType).send(image ?? await original());
  };
}
