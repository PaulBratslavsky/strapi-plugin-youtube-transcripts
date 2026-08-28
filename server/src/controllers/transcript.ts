import type { Core } from '@strapi/strapi';
import { extractYouTubeID } from '../utils/extract-youtube-id';

/**
 * Turn a fetch failure into a status the caller can act on.
 *
 * Everything used to come back as `ctx.throw(500, message)`, and Koa hides the
 * message on any 5xx, so the response was a bare "Internal Server Error" with
 * the reason discarded. A video with no captions, a mistyped id and YouTube
 * refusing the request were indistinguishable, and all three read as a bug in
 * this plugin.
 *
 * 404 for "this video has nothing to fetch", which the caller can fix, and 502
 * for "YouTube would not give it to us", which they cannot. Both are 4xx/502
 * rather than 500 so the message survives.
 */
function classify(message: string): { status: number; reason: string } {
  const m = message.toLowerCase();

  if (m.includes('unavailable') || m.includes('private') || m.includes('does not exist')) {
    return { status: 404, reason: 'That video is unavailable, private, or does not exist.' };
  }

  if (m.includes('captions') || m.includes('transcript is disabled') || m.includes('no caption')) {
    return { status: 404, reason: 'That video has no captions, so there is no transcript to fetch.' };
  }

  // Throttling, 5xx from YouTube, timeouts, socket errors. Upstream, not ours.
  return {
    status: 502,
    reason:
      'YouTube did not return the transcript. This is usually rate limiting on large ' +
      'transcripts from an un-proxied address, and often succeeds on retry. Configure ' +
      'proxyUrl if it keeps happening.',
  };
}

const PLUGIN_ID = 'youtube-transcripts';

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getTranscript(ctx) {
    try {
      const videoId = extractYouTubeID(ctx.params.videoId);

      if (!videoId) {
        return (ctx.body = { error: 'Invalid YouTube URL or ID', data: null });
      }

      // Check if transcript exists in database
      const found = await strapi
        .plugin(PLUGIN_ID)
        .service('transcript')
        .findTranscript(videoId);

      if (found) {
        return (ctx.body = { data: found });
      }

      // Fetch from YouTube
      const transcriptData = await strapi
        .plugin(PLUGIN_ID)
        .service('transcript')
        .getTranscript(videoId);

      if (!transcriptData || transcriptData.error) {
        ctx.throw(400, transcriptData?.error || 'Failed to fetch transcript');
        return;
      }

      const payload = {
        // Spread so metadata the fetch gains is stored without editing this again.
        ...transcriptData,
        videoId,
        title: transcriptData.title || 'No title found',
        fullTranscript: transcriptData.fullTranscript,
        transcriptWithTimeCodes: transcriptData.transcriptWithTimeCodes,
      };

      // Save to transcript collection
      const transcript = await strapi
        .plugin(PLUGIN_ID)
        .service('transcript')
        .saveTranscript(payload);

      strapi.log.info(`[${PLUGIN_ID}] Saved transcript for ${videoId} (documentId: ${(transcript as any)?.documentId})`);

      ctx.body = { data: transcript };
    } catch (error: any) {
      if (error.status) throw error;
      strapi.log.error(`[${PLUGIN_ID}] getTranscript error: ${error.message}`);
      ctx.throw(500, error.message || 'Failed to get transcript');
    }
  },
});

export default controller;
