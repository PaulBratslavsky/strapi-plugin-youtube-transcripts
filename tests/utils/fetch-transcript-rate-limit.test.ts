import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A 429 from timedtext is about the server's IP and session, not the video.
 * Retrying the same signed URL on the same connection just earns another 429,
 * so the retry has to come from a fresh session with a fresh caption URL.
 */

const CAPTION_XML =
  '<?xml version="1.0" encoding="utf-8"?><transcript>' +
  '<text start="0" dur="2.5">hello there</text>' +
  '</transcript>';

let sessions = 0;

vi.mock('youtubei.js', () => ({
  Innertube: {
    create: async () => {
      sessions += 1;
      const n = sessions;
      const info = {
        basic_info: { title: 'A video' },
        captions: {
          caption_tracks: [{ language_code: 'en', kind: 'asr', base_url: `https://timedtext.example/en?session=${n}` }],
        },
      };
      return { getInfo: async () => info, getBasicInfo: async () => info };
    },
  },
}));

import fetchTranscript from '../../server/src/utils/fetch-transcript';

const tooMany = { ok: false, status: 429, headers: new Headers(), text: async () => '' };
const ok = { ok: true, status: 200, headers: new Headers(), text: async () => CAPTION_XML };

describe('fetchTranscript on a 429', () => {
  let urls: string[];

  beforeEach(() => {
    sessions = 0;
    urls = [];
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retries with a freshly signed caption URL from a new session', async () => {
    const responses = [tooMany, ok];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return responses.shift();
    });

    const pending = fetchTranscript('abc123');
    await vi.runAllTimersAsync();
    const data = await pending;

    expect(data.fullTranscript).toBe('hello there');
    expect(urls).toEqual(['https://timedtext.example/en?session=1', 'https://timedtext.example/en?session=2']);
  });

  it('says it is a rate limit, not missing captions, when every attempt is refused', async () => {
    vi.stubGlobal('fetch', async () => tooMany);

    const pending = fetchTranscript('abc123').catch((e: Error) => e);
    await vi.runAllTimersAsync();
    const error = (await pending) as Error;

    expect(error.message).toContain('rate limiting');
    expect(error.message).toContain('PROXY_URL');
    expect(error.message).not.toContain('may not have captions');
  });

  it('waits as long as Retry-After asks, within the cap', async () => {
    const limited = { ...tooMany, headers: new Headers({ 'retry-after': '10' }) };
    const responses = [limited, ok];
    vi.stubGlobal('fetch', async () => responses.shift());

    const pending = fetchTranscript('abc123');
    await vi.advanceTimersByTimeAsync(9_000);
    expect(responses).toHaveLength(1); // still waiting
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ fullTranscript: 'hello there' });
  });
});
