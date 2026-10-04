import type { SessionMessage, ToolUseSummary } from 'claude-code'
import { expect, test, type TestBody } from 'claude-code/testing'

import { mountRow, stubRow } from './mount'
import { isOneLine, recordCallsAbove } from './spacing'

const call = (tool_use_id: string, tool = 'Bash', fields: Partial<ToolUseSummary> = {}): ToolUseSummary => ({
  tool_use_id,
  tool,
  input: {},
  ...fields,
})
const reply = (text: string, ...toolUses: ToolUseSummary[]): SessionMessage => ({ role: 'assistant', text, toolUses })
const results = (): SessionMessage => ({
  role: 'user',
  text: '<system-reminder>x</system-reminder>',
  toolUses: [],
  toolResults: [{ tool_use_id: 'r', text: 'ok' } as NonNullable<SessionMessage['toolResults']>[number]],
})
const prompt = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })

const aboveOf = (messages: SessionMessage[]) => {
  const into = new Map<string, ToolUseSummary | null>()
  recordCallsAbove(messages, into)
  return Object.fromEntries([...into].map(([id, above]) => [id, above?.tool_use_id ?? null]))
}

test('a call follows the call before it, across results and thinking', () => {
  expect(aboveOf([prompt('go'), reply('', call('a')), results(), reply(''), reply('', call('b'), call('c'))])).toEqual({
    a: null,
    b: 'a',
    c: 'b',
  })
})

test("a reply's text and a prompt break a run", () => {
  expect(aboveOf([reply('', call('a')), results(), reply('Next.', call('b')), results(), prompt('more'), reply('', call('c'))])).toEqual({
    a: null,
    b: null,
    c: null,
  })
})

const edit = { type: 'update', structuredPatch: [{ lines: ['-old', '+new'] }] }

// The Box margins of a Bash row (toolu_1) mounted under `above`.
const marginsUnder = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], above: ToolUseSummary) => {
  stubRow(on, () => 'row')
  on('session.messages', () => ({ value: [reply('', above), results(), reply('', call('toolu_1'))] }))
  const ui = await mountRow($, 'Bash', { input: { command: 'ls' } })
  const boxes = await ui.findAll({ type: 'Box' })
  await ui.unmount()
  return boxes.map(box => (box.props as { marginTop?: number }).marginTop)
}

test('a row under a one-line edit is pulled up over its blank line', async ($, on) => {
  expect(await marginsUnder($, on, call('e', 'Edit', { result: edit, text: 'ok' }))).toContain(-1)
})

test('a row under a row with lines beneath it keeps its blank line', async ($, on) => {
  expect(await marginsUnder($, on, call('b', 'Bash', { result: { stdout: 'x' }, text: 'x' }))).not.toContain(-1)
})

test('only an Edit or Write drawn with its counts is one line', () => {
  expect(isOneLine(call('a', 'Edit', { result: edit, text: 'ok' }))).toBe(true)
  expect(isOneLine(call('a', 'Write', { result: { type: 'create', content: 'x', structuredPatch: [] }, text: 'ok' }))).toBe(true)
  expect(isOneLine(call('a', 'Edit'))).toBe(false)
  expect(isOneLine(call('a', 'Edit', { result: edit, isError: true }))).toBe(false)
  expect(isOneLine(call('a', 'Edit', { result: { ...edit, staged: true } }))).toBe(false)
  expect(isOneLine(call('a', 'Read', { result: { type: 'text' } }))).toBe(false)
  expect(isOneLine(call('a', 'Bash', { result: { stdout: '' } }))).toBe(false)
})
