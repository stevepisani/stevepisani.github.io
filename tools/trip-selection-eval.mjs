// Opt-in model evaluation. The model receives the published MCP contract and synthetic
// conversations. Inspect proposed calls only. No tools/call dispatch or trip backend.
import assert from 'node:assert/strict';
import { rpc } from '../supabase/functions/mcp/server.js';

const discovery = async (method) => (await rpc({ jsonrpc: '2.0', id: 1, method })).result;
const { instructions } = await discovery('initialize');
const { tools } = await discovery('tools/list');
const functions = tools.map(({ name, description, inputSchema }) => ({
  type: 'function', function: { name, description, parameters: inputSchema },
}));
const trip = { trip: { id: 'example', name: 'Fixture visit', updated_at: '2026-10-01T10:00:00Z' },
  legs: [{ place: 'London', from: '2026-10-07', to: '2026-10-10' }], days: [] };
const read = ['get_trip', { id: 'example' }, trip];
const save = ['plan_days', { trip_id: 'example', days: [{ date: '2026-10-09', occasion: 'Museum' }] }, { planned: 1 }];
const plan = 'Save a museum visit on October 9 to my Fixture visit (id example).';
const done = 'Record that I visited the museum on October 7, 2026.';
const cases = [
  { prompt: 'When is my Fixture visit? I forget its id.', want: 'list_trips' },
  { prompt: plan, want: 'get_trip' },
  { prompt: plan, history: [read], want: 'plan_days', check: (a) => {
    assert.equal(a.expected_updated_at, trip.trip.updated_at);
    assert.equal(a.days[0].date, '2026-10-09');
  } },
  { prompt: plan, history: [read, save], want: 'get_trip' },
  { prompt: 'Move my Fixture visit (id example) to October 8–11, 2026.', history: [read], want: 'update_trip' },
  { prompt: done, history: [['get_history', { from: '2026-10-07', to: '2026-10-07' }, { events: [] }]], want: 'log_day',
    check: (a) => { assert.equal(a.date, '2026-10-07'); assert.ok(a.client_ref && a.journal && a.said); } },
];
const endpoint = process.env.TRIP_EVAL_ENDPOINT;
assert.ok(endpoint && process.env.TRIP_EVAL_MODEL, 'Set TRIP_EVAL_ENDPOINT (chat completions URL) and TRIP_EVAL_MODEL');
for (const { prompt, history = [], want, check } of cases) {
  const messages = [{ role: 'system', content: instructions }, { role: 'user', content: prompt }];
  for (const [i, [name, args, result]] of history.entries()) {
    const id = 'call_' + i;
    messages.push({ role: 'assistant', tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
      { role: 'tool', tool_call_id: id, content: JSON.stringify(result) });
  }
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json',
    ...(process.env.TRIP_EVAL_TOKEN && { Authorization: 'Bearer ' + process.env.TRIP_EVAL_TOKEN }) },
    body: JSON.stringify({ model: process.env.TRIP_EVAL_MODEL, messages, tools: functions }) });
  assert.ok(response.ok, 'Model endpoint returned ' + response.status);
  const calls = (await response.json()).choices[0].message.tool_calls || [];
  assert.deepEqual(calls.map((c) => c.function.name), [want], prompt);
  if (check) check(JSON.parse(calls[0].function.arguments));
  console.log('PASS', want, prompt);
}
