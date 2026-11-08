// Finds the stored agent that an imported row belongs to.
// Same lookups as before (ID key, name + ID) plus Step 2: across separate uploads, a row
// with only a name joins the ONE stored agent with that name, and a row with an ID
// adopts the ONE stored agent with that name that has no ID yet. Never guesses between
// two people who share a name.
export type AgentLike = { ccms: string; sourceId?: string | null; name?: string; [key: string]: any };
export type AgentIndex = {
  byCcms: Map<string, AgentLike>;
  byNameAndId: Map<string, AgentLike>;
  byName: Map<string, AgentLike[]>;
};

const nameKey = (name: string | undefined): string =>
  String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const createAgentIndex = (agents: AgentLike[]): AgentIndex => {
  const index: AgentIndex = { byCcms: new Map(), byNameAndId: new Map(), byName: new Map() };
  for (const agent of agents) registerAgent(index, agent);
  return index;
};

// Safe to call again for the same agent (e.g. after it gets an ID).
export const registerAgent = (index: AgentIndex, agent: AgentLike): void => {
  if (agent.ccms) index.byCcms.set(agent.ccms, agent);
  index.byNameAndId.set(`${(agent.name || '').toLowerCase()}|${agent.sourceId || ''}`, agent);
  const key = nameKey(agent.name);
  if (!key) return;
  const list = index.byName.get(key);
  if (!list) index.byName.set(key, [agent]);
  else if (!list.includes(agent)) list.push(agent);
};

export const findAgent = (
  index: AgentIndex,
  row: { agentKey: string; rawName: string; rawId: string }
): AgentLike | undefined => {
  const direct =
    index.byCcms.get(row.agentKey) || index.byNameAndId.get(`${row.rawName.toLowerCase()}|${row.rawId}`);
  if (direct) return direct;

  const sameName = index.byName.get(nameKey(row.rawName)) ?? [];
  if (sameName.length !== 1) return undefined;
  const only = sameName[0];
  if (!row.rawId) return only;
  return only.sourceId ? undefined : only;
};
