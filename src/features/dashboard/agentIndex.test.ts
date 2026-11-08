import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAgentIndex, findAgent, registerAgent } from './agentIndex';

const key = (rawName: string, rawId = '') => ({
  agentKey: rawId ? `ID_${rawId}` : `AUTO_${rawName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
  rawName,
  rawId,
});

describe('Step 2: finding the stored agent across uploads', () => {
  it('finds an agent by ID key or by name + ID (as before)', () => {
    const a = { ccms: 'ID_E100', sourceId: 'E100', name: 'Agent One' };
    const index = createAgentIndex([a]);
    assert.equal(findAgent(index, key('Agent One', 'E100')), a);
    assert.equal(findAgent(index, key('Someone Else', 'E100')), a);
  });

  it('a name-only row joins the one existing agent with that name', () => {
    const a = { ccms: 'ID_E100', sourceId: 'E100', name: 'Agent One' };
    const index = createAgentIndex([a]);
    assert.equal(findAgent(index, key('agent  ONE')), a);
  });

  it('a name-only row does not guess when two agents share the name', () => {
    const index = createAgentIndex([
      { ccms: 'ID_E100', sourceId: 'E100', name: 'Agent One' },
      { ccms: 'ID_E200', sourceId: 'E200', name: 'Agent One' },
    ]);
    assert.equal(findAgent(index, key('Agent One')), undefined);
  });

  it('a row with an ID adopts the one existing agent that has that name and no ID yet', () => {
    const a = { ccms: 'AUTO_agent_one', sourceId: null, name: 'Agent One' };
    const index = createAgentIndex([a]);
    assert.equal(findAgent(index, key('Agent One', 'E100')), a);
  });

  it('a row with an ID does not take an agent that already has a different ID', () => {
    const index = createAgentIndex([{ ccms: 'ID_E100', sourceId: 'E100', name: 'Agent One' }]);
    assert.equal(findAgent(index, key('Agent One', 'E200')), undefined);
  });

  it('unknown names find nothing, and registering twice does not create a false "two agents"', () => {
    const a = { ccms: 'ID_E100', sourceId: 'E100', name: 'Agent One' };
    const index = createAgentIndex([a]);
    assert.equal(findAgent(index, key('Nobody')), undefined);
    registerAgent(index, a);
    registerAgent(index, a);
    assert.equal(findAgent(index, key('Agent One')), a);
  });
});
