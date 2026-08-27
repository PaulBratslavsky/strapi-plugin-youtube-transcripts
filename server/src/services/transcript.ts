import type { Core } from '@strapi/strapi';
import fetchTranscript from '../utils/fetch-transcript';
import { backfillMetadata } from '../lib/backfill-metadata';

const PLUGIN_ID = 'youtube-transcripts';
const CONTENT_TYPE_UID = 'plugin::youtube-transcripts.transcript';

interface PluginConfig {
  proxyUrl?: string;
}

const service = ({ strapi }: { strapi: Core.Strapi }) => ({
  async getTranscript(identifier: string) {
    const youtubeIdRegex = /^[a-zA-Z0-9_-]{11}$/;
    const isValid = youtubeIdRegex.test(identifier);
    if (!isValid) {
      return { error: 'Invalid video ID', data: null };
    }

    // Get proxy config
    const pluginConfigFromGet = strapi.config.get(`plugin::${PLUGIN_ID}`) as any;
    const pluginInstance = strapi.plugin(PLUGIN_ID);
    const configFromPlugin = pluginInstance?.config;

    strapi.log.info(`[${PLUGIN_ID}] Config from strapi.config.get: ${JSON.stringify(pluginConfigFromGet)}`);
    strapi.log.info(`[${PLUGIN_ID}] Config from plugin.config: ${typeof configFromPlugin === 'function' ? 'function' : JSON.stringify(configFromPlugin)}`);

    // Try to get proxyUrl from various places
    let proxyUrl: string | undefined;

    // Method 1: Direct from plugin config function (Strapi v5 way)
    if (typeof configFromPlugin === 'function') {
      proxyUrl = configFromPlugin('proxyUrl');
      strapi.log.info(`[${PLUGIN_ID}] proxyUrl from config function: ${proxyUrl ? 'SET' : 'NOT SET'}`);
    }

    // Method 2: From strapi.config.get (might be nested under .config)
    if (!proxyUrl && pluginConfigFromGet) {
      proxyUrl = pluginConfigFromGet.proxyUrl || pluginConfigFromGet.config?.proxyUrl;
    }

    // Log at service level using strapi logger
    if (proxyUrl) {
      const maskedUrl = proxyUrl.replace(/:([^@:]+)@/, ':****@');
      strapi.log.info(`[${PLUGIN_ID}] Fetching transcript for ${identifier} via proxy: ${maskedUrl}`);
    } else {
      strapi.log.info(`[${PLUGIN_ID}] Fetching transcript for ${identifier} (NO PROXY - check config)`);
    }

    const transcriptData = await fetchTranscript(identifier, {
      proxyUrl,
    });

    strapi.log.info(`[${PLUGIN_ID}] Successfully fetched transcript for ${identifier}`);

      // Return everything the fetch produced. Listing fields individually is
      // exactly what dropped the metadata: the fetch had it and the service
      // quietly narrowed it back down to three.
      return transcriptData;
  },

  async saveTranscript(payload: Record<string, unknown>) {
    return await strapi.documents(CONTENT_TYPE_UID as any).create({
      data: payload,
    });
  },

  /**
   * Refetch metadata for rows stored before 2.1. Metadata only: the stored
   * transcript is never replaced, because captions can change or disappear and
   * a silent downgrade would be worse than a null thumbnail.
   */
  async backfillMetadata(options?: { limit?: number }) {
    const config = strapi.config.get(`plugin::${PLUGIN_ID}`) as { proxyUrl?: string } | undefined;
    return backfillMetadata(strapi, { proxyUrl: config?.proxyUrl, limit: options?.limit });
  },

  async findTranscript(videoId: string) {
    const transcriptData = await strapi.documents(CONTENT_TYPE_UID as any).findFirst({
      filters: { videoId },
    });
    return transcriptData || null;
  },
});

export default service;
