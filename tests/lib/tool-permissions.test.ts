import { describe, it, expect } from 'vitest';
import {
  PLUGIN_ID,
  toActionSlug,
  buildToolActionDefs,
  registerToolPermissions,
} from '../../server/src/lib/tool-permissions';

/**
 * This plugin has to work installed on its own.
 *
 * Its tool permissions used to be registered by strapi-plugin-ai-chat, which
 * declared an action for every tool contributed to it. Without ai-chat there
 * was nothing in Settings > Roles at all, and even with it the actions only
 * appeared when the MCP server happened to be enabled.
 *
 * ai-chat 3.4.0 stopped doing that, so these ids have to come from here, and
 * they have to be byte-identical to the ones it produced or existing grants
 * would be pruned as unknown actions.
 */

/** Verified against a live strapi-local admin_permissions table. */
const AI_CHAT_IDS = [
  'plugin::youtube-transcripts.tool.fetch-transcript',
  'plugin::youtube-transcripts.tool.find-transcripts',
  'plugin::youtube-transcripts.tool.get-transcript',
  'plugin::youtube-transcripts.tool.list-transcripts',
  'plugin::youtube-transcripts.tool.search-transcript',
];

describe('toActionSlug', () => {
  // Mirrors ai-chat's mcp/naming.ts: snake-case the camelCase name, then swap
  // underscores for hyphens, because Strapi's admin uid validator is
  // /^[a-z]([a-z|.|-]+)[a-z]$/ and rejects underscores outright.
  it.each([
    ['fetchTranscript', 'fetch-transcript'],
    ['listTranscripts', 'list-transcripts'],
    ['getTranscript', 'get-transcript'],
    ['searchTranscript', 'search-transcript'],
    ['findTranscripts', 'find-transcripts'],
  ])('maps %s to %s', (input, expected) => {
    expect(toActionSlug(input)).toBe(expected);
  });

  it('produces uids Strapi will accept', () => {
    for (const d of buildToolActionDefs()) {
      expect(d.uid).toMatch(/^[a-z]([a-z.-]+)[a-z]$/);
    }
  });
});

describe('buildToolActionDefs', () => {
  it('produces exactly the ids ai-chat used to register', () => {
    const ids = buildToolActionDefs()
      .map((d) => `plugin::${d.pluginName}.${d.uid}`)
      .sort();
    expect(ids).toEqual([...AI_CHAT_IDS].sort());
  });

  it('files every action under this plugin, in the AI tools group', () => {
    for (const d of buildToolActionDefs()) {
      expect(d.section).toBe('plugins');
      expect(d.pluginName).toBe(PLUGIN_ID);
      expect(d.subCategory).toBe('AI tools');
    }
  });

  it('labels each action in sentence case', () => {
    const byUid = Object.fromEntries(buildToolActionDefs().map((d) => [d.uid, d.displayName]));
    expect(byUid['tool.fetch-transcript']).toBe('Fetch transcript');
    expect(byUid['tool.find-transcripts']).toBe('Find transcripts');
  });
});

function fakeStrapi(alreadyRegistered: string[] = [], failWith?: Error) {
  const registered: any[] = [];
  const logs: string[] = [];
  const strapi: any = {
    log: {
      info: (m: string) => logs.push(m),
      warn: (m: string) => logs.push(m),
      error: (m: string) => logs.push(m),
      debug: (m: string) => logs.push(m),
    },
    service: () => ({
      actionProvider: {
        has: (id: string) => alreadyRegistered.includes(id),
        registerMany: async (defs: any[]) => {
          if (failWith) throw failWith;
          registered.push(...defs);
        },
      },
    }),
  };
  return { strapi, registered, logs };
}

describe('registerToolPermissions', () => {
  it('registers all five actions, with no dependency on ai-chat being installed', async () => {
    const { strapi, registered } = fakeStrapi();
    await registerToolPermissions(strapi);

    expect(registered.map((d) => `plugin::${d.pluginName}.${d.uid}`).sort()).toEqual(
      [...AI_CHAT_IDS].sort(),
    );
  });

  it('skips an action another plugin already registered, whatever the boot order', async () => {
    // Strapi's action provider is built with the default throwOnDuplicates, so
    // registering an existing id throws. An older ai-chat still declares these,
    // and plugin bootstrap order is not ours to control.
    const { strapi, registered } = fakeStrapi([
      'plugin::youtube-transcripts.tool.fetch-transcript',
    ]);
    await registerToolPermissions(strapi);

    expect(registered).toHaveLength(4);
    expect(registered.map((d) => d.uid)).not.toContain('tool.fetch-transcript');
  });

  it('registers nothing, and does not call through, when everything is already present', async () => {
    const { strapi, registered } = fakeStrapi(AI_CHAT_IDS);
    await registerToolPermissions(strapi);
    expect(registered).toHaveLength(0);
  });

  it('never takes the host down if registration fails', async () => {
    const { strapi, logs } = fakeStrapi([], new Error('Duplicated item key'));
    await expect(registerToolPermissions(strapi)).resolves.toBeUndefined();
    expect(logs.join(' ')).toContain('Duplicated item key');
  });
});

describe('the action ids hosts are given', () => {
  it('declares an action for every tool that has one registered', async () => {
    // THE PROPERTY THAT MATTERS. A host checks the declared id against the
    // caller's grants; this plugin registers the other. If they ever differ,
    // the tool is gated on an id nobody can hold and vanishes from the chat
    // with no error on either side.
    const aiTools = (await import('../../server/src/services/ai-tools')).default;
    const declared = aiTools().getTools() as Array<{ name: string; action?: string }>;
    const registered = new Set(
      buildToolActionDefs().map((def) => `plugin::${def.pluginName}.${def.uid}`),
    );

    for (const tool of declared) {
      if (!tool.action) continue;
      expect(registered, `${tool.name} declares an unregistered action`).toContain(tool.action);
    }
  });

  it('gives every public tool an action', async () => {
    const aiTools = (await import('../../server/src/services/ai-tools')).default;
    const declared = aiTools().getTools() as Array<{ name: string; internal?: boolean; action?: string }>;
    for (const tool of declared) {
      if (tool.internal) continue;
      expect(tool.action, `${tool.name} has no action`).toBeTruthy();
    }
  });

  it('omits the action on internal tools, which have none registered', async () => {
    // An internal tool gets no registered action, so declaring one would make a
    // host gate it on an id that can never be granted.
    const internalNames = new Set(
      (await import('../../server/src/tools')).tools.filter((t) => t.internal).map((t) => t.name),
    );
    const aiTools = (await import('../../server/src/services/ai-tools')).default;
    for (const tool of aiTools().getTools() as Array<{ name: string; action?: string }>) {
      if (internalNames.has(tool.name)) expect(tool.action).toBeUndefined();
    }
  });
});
