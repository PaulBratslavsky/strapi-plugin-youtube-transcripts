import { describe, it, expect } from 'vitest';
import { extractYouTubeID } from '../../server/src/utils/extract-youtube-id';

/**
 * Models pass whatever the user pasted, which is usually a URL rather than the
 * 11 character id the API needs.
 */
describe('extractYouTubeID', () => {
  it('accepts a bare id', () => {
    expect(extractYouTubeID('kCYfglngpTA')).toBe('kCYfglngpTA');
  });

  it('accepts a standard watch URL', () => {
    expect(extractYouTubeID('https://www.youtube.com/watch?v=kCYfglngpTA')).toBe('kCYfglngpTA');
  });

  it('accepts a short youtu.be URL', () => {
    expect(extractYouTubeID('https://youtu.be/kCYfglngpTA')).toBe('kCYfglngpTA');
  });

  it('ignores trailing query parameters', () => {
    expect(extractYouTubeID('https://www.youtube.com/watch?v=kCYfglngpTA&t=42s')).toBe('kCYfglngpTA');
  });

  it('rejects something that is not a video reference', () => {
    expect(extractYouTubeID('not a video')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(extractYouTubeID('')).toBeNull();
  });
});

describe('extractYouTubeID, link shapes YouTube actually hands out', () => {
  it('accepts a shorts link', () => {
    expect(extractYouTubeID('https://www.youtube.com/shorts/kCYfglngpTA')).toBe('kCYfglngpTA');
  });

  it('accepts an embed link, which is what an iframe carries', () => {
    expect(extractYouTubeID('https://www.youtube.com/embed/kCYfglngpTA')).toBe('kCYfglngpTA');
  });

  it('accepts a live link', () => {
    expect(extractYouTubeID('https://www.youtube.com/live/kCYfglngpTA')).toBe('kCYfglngpTA');
  });

  it('accepts the mobile domain', () => {
    expect(extractYouTubeID('https://m.youtube.com/watch?v=kCYfglngpTA')).toBe('kCYfglngpTA');
  });

  it('finds v= even when another parameter comes first', () => {
    expect(extractYouTubeID('https://www.youtube.com/watch?list=PL123&v=kCYfglngpTA')).toBe('kCYfglngpTA');
  });

  it('ignores a timestamp on a youtu.be link', () => {
    expect(extractYouTubeID('https://youtu.be/kCYfglngpTA?t=42')).toBe('kCYfglngpTA');
  });

  it('tolerates surrounding whitespace from a paste', () => {
    expect(extractYouTubeID('  https://youtu.be/kCYfglngpTA  ')).toBe('kCYfglngpTA');
  });

  it('rejects a YouTube URL that carries no video', () => {
    expect(extractYouTubeID('https://www.youtube.com/results?search_query=astro')).toBeNull();
  });

  it('rejects an id of the wrong length', () => {
    expect(extractYouTubeID('tooshort')).toBeNull();
  });
});
