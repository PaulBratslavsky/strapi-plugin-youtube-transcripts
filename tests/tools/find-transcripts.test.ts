import { describe, it, expect } from 'vitest';
import { truncateTranscripts } from '../../server/src/tools/find-transcripts';

/**
 * findTranscripts answers "which videos matched", so it must not carry the
 * content of the ones that did. It previously returned every timecode: about
 * 31KB for one 12 minute video, roughly 7,800 tokens, which is more than this
 * plugin's whole system prompt and tool schema budget. A few matches could
 * exhaust a model's context before it read any of them.
 */

/** A transcript row shaped like the database returns it. */
function row(segments: number, transcriptChars = 1000) {
  return {
    id: 1,
    documentId: 'abc',
    title: 'Some video',
    videoId: 'kCYfglngpTA',
    fullTranscript: 'x'.repeat(transcriptChars),
    transcriptWithTimeCodes: Array.from({ length: segments }, (_, i) => ({
      text: `segment ${i}`,
      start: i * 1000,
      end: i * 1000 + 900,
      duration: 900,
    })),
  };
}

describe('truncateTranscripts', () => {
  it('drops the timecodes, which are the bulk of the payload', () => {
    const [out] = truncateTranscripts([row(329)]);

    expect(out).not.toHaveProperty('transcriptWithTimeCodes');
  });

  it('reports how many segments exist so the model can ask for them', () => {
    // Dropping silently would leave no sign the data is available at all.
    const [out] = truncateTranscripts([row(329)]);

    expect(out.segmentCount).toBe(329);
  });

  it('truncates the transcript text to a preview', () => {
    const [out] = truncateTranscripts([row(5, 5000)]);

    expect(out.fullTranscript).toHaveLength(247); // 244 + the ellipsis
    expect(out.fullTranscript.endsWith('...')).toBe(true);
  });

  it('leaves a short transcript alone rather than appending an ellipsis', () => {
    const [out] = truncateTranscripts([row(2, 10)]);

    expect(out.fullTranscript).toBe('x'.repeat(10));
  });

  it('keeps the fields a search result is for', () => {
    const [out] = truncateTranscripts([row(3)]);

    expect(out).toMatchObject({ id: 1, documentId: 'abc', title: 'Some video', videoId: 'kCYfglngpTA' });
  });

  it('collapses a realistic result to a fraction of its former size', () => {
    // The regression this guards: 31,440 bytes for a single video.
    const before = JSON.stringify([row(329, 12614)]).length;
    const after = JSON.stringify(truncateTranscripts([row(329, 12614)])).length;

    expect(before).toBeGreaterThan(20_000);
    expect(after).toBeLessThan(1_500);
  });

  it('handles a row with no timecodes without inventing a count', () => {
    const { transcriptWithTimeCodes, ...noTimecodes } = row(0);
    const [out] = truncateTranscripts([noTimecodes]);

    expect(out.segmentCount).toBe(0);
  });

  it('handles a null transcript', () => {
    const [out] = truncateTranscripts([{ ...row(1), fullTranscript: null }]);

    expect(out.fullTranscript).toBeNull();
  });

  it('maps every row, not just the first', () => {
    const out = truncateTranscripts([row(10), row(20), row(30)]);

    expect(out.map((r) => r.segmentCount)).toEqual([10, 20, 30]);
    expect(out.every((r) => !('transcriptWithTimeCodes' in r))).toBe(true);
  });

  it('returns an empty array unchanged', () => {
    expect(truncateTranscripts([])).toEqual([]);
  });
});
