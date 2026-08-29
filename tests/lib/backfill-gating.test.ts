import { describe, it, expect } from 'vitest';
import { needsBackfill } from '../../server/src/lib/backfill-metadata';

/**
 * The gate decides which stored rows get their metadata refetched.
 *
 * It originally required EVERY metadata field to be null, meaning a row
 * written by 2.1 counted as complete. Those rows all carry a null
 * videoPublishedAt, because that field never worked until 2.4, so the
 * every() form skipped exactly the rows the 2.4 fix exists for.
 */

const PRE_2_1 = { videoId: 'a' };

const FROM_2_1 = {
  videoId: 'b',
  author: 'Strapi',
  channelId: 'UC1',
  thumbnailUrl: 'https://img/max.jpg',
  durationSec: 120,
  description: 'd',
  keywords: ['k'],
  category: 'Education',
  language: 'en',
  fetchedAt: '2026-08-01T00:00:00.000Z',
  videoPublishedAt: null,
  thumbnails: null,
  viewCount: null,
};

const FROM_2_4 = {
  ...FROM_2_1,
  videoId: 'c',
  videoPublishedAt: 'Feb 2, 2026',
  thumbnails: [{ url: 'https://img/max.jpg', width: 1920, height: 1080 }],
  viewCount: 4321,
};

describe('needsBackfill', () => {
  it('backfills a row that predates metadata entirely', () => {
    expect(needsBackfill(PRE_2_1)).toBe(true);
  });

  it('backfills a 2.1 row, which has metadata but never had a working publish date', () => {
    expect(needsBackfill(FROM_2_1)).toBe(true);
  });

  it('leaves a complete 2.4 row alone, so the backfill converges', () => {
    expect(needsBackfill(FROM_2_4)).toBe(false);
  });

  it('converges even when getInfo failed and the date stayed null', () => {
    // thumbnails come from basic_info, which succeeds whenever the fetch does,
    // so a row is done on thumbnails rather than on a date that may be absent.
    const dateless = { ...FROM_2_4, videoPublishedAt: null };
    expect(needsBackfill(dateless)).toBe(false);
  });
});
