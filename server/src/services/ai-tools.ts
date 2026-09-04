import { tools } from '../tools';
import { actionForTool } from '../lib/tool-permissions';

/**
 * What this plugin contributes to an AI chat host.
 *
 * Each tool carries the admin permission action that gates it — the same id
 * this plugin registers in bootstrap. A host should CHECK that action against
 * the caller rather than deriving an id from the tool name: derivation only
 * works while both sides implement identical slug rules, and when it silently
 * disagrees the tool disappears with no error on either side.
 *
 * `internal` tools get no action, because none is registered for them
 * (`buildToolActionDefs` skips them). A host that gates on a missing action
 * would withhold them from everyone, so it should treat an absent `action` as
 * "not permission-gated" rather than "denied" — matching how ai-chat exempts
 * internal tools from its own check.
 */
export default () => ({
  getTools() {
    return tools.map((tool) =>
      tool.internal ? tool : { ...tool, action: actionForTool(tool.name) },
    );
  },

  getMeta() {
    return {
      label: 'YouTube Transcripts',
      description: 'Fetch, search, list, and read YouTube video transcripts',
      keywords: ['/youtube', '/yt', 'transcript', 'video'],
    };
  },
});
