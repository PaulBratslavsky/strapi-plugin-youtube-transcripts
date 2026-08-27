import type { Core } from '@strapi/strapi';
import fetchTranscript from '../utils/fetch-transcript';

/**
 * Fill in metadata for transcripts stored before 2.1 captured it.
 *
 * Rows written by earlier versions hold only the title and the transcript
 * itself, because the fetch returned four fields and the layers below it
 * re-listed those same four. The data was always in the YouTube response; it
 * was discarded on the way to the database.
 *
 * Unlike the id migration, this one talks to YouTube, so it is deliberately
 * cautious:
 *
 * - It is opt-in. `backfillMetadata: true` in plugin config, or a one-off call.
 *   Refetching every stored video on boot is not something a plugin should
 *   decide to do on someone's behalf.
 * - It only touches rows that are actually missing metadata, so a second run
 *   costs nothing.
 * - It never overwrites the transcript. Captions can change or disappear, and a
 *   backfill that silently replaced stored text with a worse copy would be far
 *   more damaging than a null thumbnail.
 * - One video at a time with a pause between, because the point is to be
 *   unremarkable to YouTube rather than fast.
 */

const PAUSE_MS = 1500;

/** The fields 2.1 added. A row missing all of them predates the change. */
const ADDED_FIELDS = [
  'author',
  'channelId',
  'thumbnailUrl',
  'durationSec',
  'description',
  'keywords',
  'category',
  'videoPublishedAt',
  'language',
  'fetchedAt',
] as const;

export interface BackfillResult {
  scanned: number;
  updated: number;
  skipped: number;
  failed: Array<{ videoId: string; reason: string }>;
}

function needsBackfill(row: Record<string, unknown>): boolean {
  return ADDED_FIELDS.every((f) => row[f] === null || row[f] === undefined);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function backfillMetadata(
  strapi: Core.Strapi,
  options?: { proxyUrl?: string; limit?: number },
): Promise<BackfillResult> {
  const UID = 'plugin::youtube-transcripts.transcript';
  const log = strapi.log;
  const result: BackfillResult = { scanned: 0, updated: 0, skipped: 0, failed: [] };

  const rows = (await strapi.documents(UID as any).findMany({
    limit: options?.limit ?? 500,
  })) as unknown as Array<Record<string, unknown>>;

  result.scanned = rows.length;

  for (const row of rows) {
    if (!needsBackfill(row)) {
      result.skipped += 1;
      continue;
    }

    const videoId = String(row.videoId ?? '');
    if (!videoId) {
      result.failed.push({ videoId: '(missing)', reason: 'row has no videoId' });
      continue;
    }

    try {
      const fresh = await fetchTranscript(videoId, { proxyUrl: options?.proxyUrl });

      // Metadata only. The stored transcript is left exactly as it is.
      await strapi.documents(UID as any).update({
        documentId: String(row.documentId),
        data: {
          author: fresh.author ?? null,
          channelId: fresh.channelId ?? null,
          thumbnailUrl: fresh.thumbnailUrl ?? null,
          durationSec: fresh.durationSec ?? null,
          description: fresh.description ?? null,
          keywords: fresh.keywords ?? null,
          category: fresh.category ?? null,
          videoPublishedAt: fresh.videoPublishedAt ?? null,
          language: fresh.language ?? null,
          fetchedAt: fresh.fetchedAt ?? new Date().toISOString(),
        } as any,
      });

      result.updated += 1;
      log.info(`[youtube-transcripts] backfilled metadata for ${videoId}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result.failed.push({ videoId, reason: reason.slice(0, 120) });
      log.warn(`[youtube-transcripts] backfill failed for ${videoId}: ${reason.slice(0, 120)}`);
    }

    await sleep(PAUSE_MS);
  }

  log.info(
    `[youtube-transcripts] backfill complete: ${result.updated} updated, ` +
      `${result.skipped} already had metadata, ${result.failed.length} failed`,
  );

  return result;
}
