import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Wiring, not units.
 *
 * The unit tests for fetchVideoInfo pass even if the caller ignores it, which
 * is precisely how ai-chat 3.1.0 shipped: the helper was present, the call site
 * never used it. These drive the real fetchTranscript with youtubei.js mocked,
 * so reverting the call site to getBasicInfo turns them red.
 */

const CAPTION_XML =
  '<?xml version="1.0" encoding="utf-8"?><transcript>' +
  '<text start="0" dur="2.5">hello there</text>' +
  '<text start="2.5" dur="2.0">second line</text>' +
  '</transcript>';

const BASIC = {
  title: 'A video',
  author: 'Strapi',
  channel_id: 'UC123',
  duration: 120,
  short_description: 'desc',
  keywords: ['a'],
  category: 'Education',
  view_count: 4321,
  thumbnail: [
    { url: 'https://img/max.jpg', width: 1920, height: 1080 },
    { url: 'https://img/small.jpg', width: 168, height: 94 },
  ],
};

const CAPTIONS = { caption_tracks: [{ language_code: 'en', base_url: 'https://timedtext.example/en' }] };

const calls: string[] = [];

vi.mock('youtubei.js', () => ({
  Innertube: {
    create: async () => ({
      getInfo: async (id: string) => {
        calls.push('getInfo');
        return {
          basic_info: BASIC,
          captions: CAPTIONS,
          primary_info: { published: { text: 'Feb 2, 2026' } },
        };
      },
      getBasicInfo: async (id: string) => {
        calls.push('getBasicInfo');
        return { basic_info: BASIC, captions: CAPTIONS };
      },
    }),
  },
}));

import fetchTranscript from '../../server/src/utils/fetch-transcript';

describe('fetchTranscript wiring', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, text: async () => CAPTION_XML }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('stores a publish date, which only reaches it if the caller used getInfo', async () => {
    const data = await fetchTranscript('abc123');

    expect(calls[0]).toBe('getInfo');
    expect(data.videoPublishedAt).toBe('Feb 2, 2026');
  });

  it('stores every thumbnail size and the view count end to end', async () => {
    const data = await fetchTranscript('abc123');

    expect(data.thumbnails).toHaveLength(2);
    expect(data.thumbnails?.[0].width).toBe(1920);
    expect(data.thumbnails?.[1].width).toBe(168);
    expect(data.thumbnailUrl).toBe('https://img/max.jpg');
    expect(data.viewCount).toBe(4321);
  });

  it('still returns the transcript itself', async () => {
    const data = await fetchTranscript('abc123');

    expect(data.fullTranscript).toBe('hello there second line');
    expect(data.transcriptWithTimeCodes).toHaveLength(2);
    expect(data.language).toBe('en');
  });
});
