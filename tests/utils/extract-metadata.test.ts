import { describe, it, expect } from 'vitest';
import { extractMetadata, bestThumbnail } from '../../server/src/utils/fetch-transcript';

/**
 * These fixtures are the real shapes returned by youtubei.js 17.x, captured
 * from live calls against video 2xNBG-KI50Q on 2026-08-28.
 *
 * The distinction that matters: getBasicInfo resolves `primary_info` to
 * undefined, while getInfo populates it. Reading the publish date from
 * primary_info therefore yielded null for every video ever stored.
 */

const THUMBNAILS = [
  { url: 'https://i.ytimg.com/vi/x/maxresdefault.jpg', width: 1920, height: 1080 },
  { url: 'https://i.ytimg.com/vi/x/hqdefault.jpg', width: 336, height: 188 },
  { url: 'https://i.ytimg.com/vi/x/mqdefault.jpg', width: 246, height: 138 },
  { url: 'https://i.ytimg.com/vi/x/default.jpg', width: 196, height: 110 },
  { url: 'https://i.ytimg.com/vi/x/sddefault.jpg', width: 168, height: 94 },
];

const BASIC_INFO = {
  title: 'Building Production-Ready Strapi + Next.js 16 Applications',
  author: 'Strapi',
  channel_id: 'UC2w6UgktMHgTS-PN4D0utNw',
  duration: 2894,
  short_description: 'Learn how NOTUM Technologies built it',
  keywords: ['strapi', 'nextjs'],
  category: 'Education',
  view_count: 2201,
  thumbnail: THUMBNAILS,
};

/** What getBasicInfo returns: no primary_info. */
const basicResponse = { basic_info: BASIC_INFO };

/** What getInfo returns: primary_info carries the publish date. */
const fullResponse = {
  basic_info: BASIC_INFO,
  primary_info: { published: { text: 'Feb 2, 2026' }, relative_date: { text: '6 months ago' } },
};

describe('extractMetadata', () => {
  it('reads the publish date when the response carries primary_info', () => {
    const meta = extractMetadata(fullResponse, 'en');
    expect(meta.videoPublishedAt).toBe('Feb 2, 2026');
  });

  it('leaves the publish date null when primary_info is absent, rather than throwing', () => {
    const meta = extractMetadata(basicResponse, 'en');
    expect(meta.videoPublishedAt).toBeNull();
  });

  it('keeps every thumbnail size, not just the largest', () => {
    const meta = extractMetadata(fullResponse, 'en');
    expect(meta.thumbnails).toHaveLength(5);
    expect(meta.thumbnails?.map((t) => t.width)).toEqual([1920, 336, 246, 196, 168]);
    // A list view should be able to pick a small one instead of scaling 1080p down.
    expect(meta.thumbnails?.[4]).toMatchObject({ width: 168, height: 94 });
  });

  it('still exposes the largest thumbnail as thumbnailUrl', () => {
    const meta = extractMetadata(fullResponse, 'en');
    expect(meta.thumbnailUrl).toBe('https://i.ytimg.com/vi/x/maxresdefault.jpg');
  });

  it('captures the view count', () => {
    const meta = extractMetadata(fullResponse, 'en');
    expect(meta.viewCount).toBe(2201);
  });

  it('leaves view count null when the field is missing', () => {
    const meta = extractMetadata({ basic_info: { title: 't' } }, 'en');
    expect(meta.viewCount).toBeNull();
  });

  it('still captures the fields it already captured', () => {
    const meta = extractMetadata(fullResponse, 'en');
    expect(meta).toMatchObject({
      author: 'Strapi',
      channelId: 'UC2w6UgktMHgTS-PN4D0utNw',
      durationSec: 2894,
      category: 'Education',
      language: 'en',
    });
  });

  it('omits session-scoped flags that describe the fetching account', () => {
    const meta: Record<string, unknown> = extractMetadata(
      { basic_info: { ...BASIC_INFO, is_liked: true, is_owner_viewing: true } },
      'en',
    );
    expect(meta.is_liked).toBeUndefined();
    expect(meta.is_owner_viewing).toBeUndefined();
  });
});

describe('bestThumbnail', () => {
  it('picks by width rather than trusting array order', () => {
    const shuffled = [THUMBNAILS[3], THUMBNAILS[0], THUMBNAILS[2]];
    expect(bestThumbnail(shuffled)).toBe('https://i.ytimg.com/vi/x/maxresdefault.jpg');
  });

  it('returns null for an empty or non-array input', () => {
    expect(bestThumbnail([])).toBeNull();
    expect(bestThumbnail(undefined)).toBeNull();
  });
});

/**
 * The real defect lived here, not in extractMetadata.
 *
 * extractMetadata always read the date correctly; the caller handed it a
 * getBasicInfo response, and getBasicInfo resolves primary_info to undefined.
 * Every stored row therefore had a null publish date. These tests pin the
 * call-site choice so the field cannot silently go dark again.
 */
import { fetchVideoInfo } from '../../server/src/utils/fetch-transcript';

describe('fetchVideoInfo', () => {
  const withPrimary = { basic_info: { title: 't' }, primary_info: { published: { text: 'Feb 2, 2026' } } };
  const withoutPrimary = { basic_info: { title: 't' } };

  it('prefers getInfo, which is the only call that carries the publish date', async () => {
    const calls: string[] = [];
    const client = {
      getInfo: async () => { calls.push('getInfo'); return withPrimary; },
      getBasicInfo: async () => { calls.push('getBasicInfo'); return withoutPrimary; },
    };

    const info = await fetchVideoInfo(client as any, 'abc');

    expect(calls).toEqual(['getInfo']);
    expect(extractMetadata(info, 'en').videoPublishedAt).toBe('Feb 2, 2026');
  });

  it('falls back to getBasicInfo when getInfo fails, so a flaky endpoint never costs the transcript', async () => {
    const calls: string[] = [];
    const client = {
      getInfo: async () => { calls.push('getInfo'); throw new Error('next endpoint unavailable'); },
      getBasicInfo: async () => { calls.push('getBasicInfo'); return withoutPrimary; },
    };

    const info = await fetchVideoInfo(client as any, 'abc');

    expect(calls).toEqual(['getInfo', 'getBasicInfo']);
    expect(info).toBe(withoutPrimary);
    expect(extractMetadata(info, 'en').videoPublishedAt).toBeNull();
  });

  it('propagates the failure when both calls fail', async () => {
    const client = {
      getInfo: async () => { throw new Error('next unavailable'); },
      getBasicInfo: async () => { throw new Error('This video is unavailable'); },
    };
    await expect(fetchVideoInfo(client as any, 'abc')).rejects.toThrow('This video is unavailable');
  });
});
