// Admin permissions for this plugin's tools.
//
// These used to be registered by strapi-plugin-ai-chat, which declared an
// action for every tool contributed to it. That made this plugin depend on
// that one to be governable at all: installed on its own, it had nothing in
// Settings > Roles, and even alongside ai-chat the actions only existed when
// the MCP server happened to be enabled, because ai-chat's registration pass
// sits behind that check.
//
// ai-chat 3.4.0 registers only its own tools, so these ids come from here now.
// They must stay byte-identical to the ones it produced: Strapi's
// `cleanPermissionsInDatabase` deletes grant rows whose action id no longer
// exists, so drifting the slug would silently revoke everyone's access.
import type { Core } from '@strapi/strapi';
import { tools } from '../tools';

export const PLUGIN_ID = 'youtube-transcripts';

/** Grouping label in the permissions grid. Matches ai-chat's, so the two look alike. */
const SUBCATEGORY = 'AI tools';

/**
 * camelCase tool name to the action slug.
 *
 * Strapi's admin uid validator is /^[a-z]([a-z|.|-]+)[a-z]$/ — lowercase
 * letters, dots and hyphens only. Underscores are rejected and take the whole
 * registerMany batch down with them, so this hyphenates rather than
 * snake-cases. Same output as ai-chat's `toActionSlug`, reached directly
 * because there is no namespace prefix to strip on this side.
 */
export function toActionSlug(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Sentence-case label for the permissions grid, e.g. "Fetch transcript". */
function toDisplayName(name: string): string {
  const words = toActionSlug(name).replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The full action id a host must check before offering this tool.
 *
 * Exposed to hosts through the `ai-tools` service, so a host never has to
 * DERIVE it from the tool name. Deriving works only while both sides implement
 * the same slug rules: `fetchTranscript` happens to agree, but a PascalCase
 * name would give this side a leading hyphen (an invalid uid), and a name with
 * consecutive capitals splits differently again. A declared id cannot drift
 * from the registered one, because both come from here.
 */
export function actionForTool(name: string): string {
  return `plugin::${PLUGIN_ID}.tool.${toActionSlug(name)}`;
}

export interface ToolActionDef {
  section: 'plugins';
  pluginName: string;
  subCategory: string;
  uid: string;
  displayName: string;
}

/**
 * One action per publicly exposed tool. Internal tools are skipped, matching
 * what ai-chat exposed via `registry.getPublic()`.
 */
export function buildToolActionDefs(): ToolActionDef[] {
  return tools
    .filter((tool) => !tool.internal)
    .map((tool) => ({
      section: 'plugins' as const,
      pluginName: PLUGIN_ID,
      subCategory: SUBCATEGORY,
      uid: `tool.${toActionSlug(tool.name)}`,
      displayName: toDisplayName(tool.name),
    }));
}

/**
 * Register the actions, skipping any that already exist.
 *
 * The skip is not decoration. Strapi builds the admin action provider with the
 * default `throwOnDuplicates`, so registering an id twice throws, and an older
 * ai-chat still declares these same ids. Plugin bootstrap order is not ours to
 * control, so whichever side runs first registers and the other stands down.
 *
 * Must run in bootstrap: the provider refuses registrations once strapi is
 * loaded. Never throws — a permissions problem should not stop the host booting.
 */
export async function registerToolPermissions(strapi: Core.Strapi): Promise<void> {
  try {
    const provider = strapi.service('admin::permission').actionProvider;

    const missing = buildToolActionDefs().filter(
      (def) => !provider.has?.(`plugin::${def.pluginName}.${def.uid}`),
    );
    // `plugin::<id>.<uid>` above is the same string `actionForTool` builds;
    // both are derived from `toActionSlug`, so a change to the slug moves the
    // registration, the duplicate check and the declared id together.

    if (missing.length === 0) {
      strapi.log.debug(
        `[${PLUGIN_ID}] tool permissions already registered, nothing to add`,
      );
      return;
    }

    await provider.registerMany(missing);
    strapi.log.info(`[${PLUGIN_ID}] registered ${missing.length} tool permission(s)`);
  } catch (error) {
    strapi.log.warn(
      `[${PLUGIN_ID}] could not register tool permissions: ` +
        `${error instanceof Error ? error.message : String(error)}. ` +
        `The tools will not be grantable in Settings > Roles.`,
    );
  }
}
