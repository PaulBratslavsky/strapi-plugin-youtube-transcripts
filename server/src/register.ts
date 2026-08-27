import type { Core } from '@strapi/strapi';
import { migrateFromAiSdkId } from './lib/migrate-from-ai-sdk-id';

/**
 * Runs before Strapi syncs the schema, which is the only window where the
 * rename from `ai-sdk-yt-transcripts` can move data: once the sync has created
 * the new empty table, the old one is orphaned beside it rather than renamed
 * into place.
 */
const register = async ({ strapi }: { strapi: Core.Strapi }) => {
  await migrateFromAiSdkId(strapi);
};

export default register;
