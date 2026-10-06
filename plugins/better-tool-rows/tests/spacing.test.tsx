import type { SessionMessage, ToolUseSummary } from 'claude-code'
import { expect, test, type TestBody } from 'claude-code/testing'

import { mountRow, stubRow } from './mount'
import { isOneLine, recordCallsAbove } from '../hooks/spacing'

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

// How often the transcript is read across `drawings` of a Bash row (toolu_1),
// finished or running, over `messages`.
const readsOver = async (
  $: Parameters<TestBody>[0],
  on: Parameters<TestBody>[1],
  messages: SessionMessage[],
  isRunning: boolean,
  drawings = 2,
) => {
  let reads = 0
  stubRow(on, () => 'row')
  on('session.messages', () => {
    reads++
    return { value: messages }
  })
  for (let i = 0; i < drawings; i++) {
    const ui = await mountRow($, 'Bash', { input: { command: 'ls' }, isRunning })
    await ui.unmount()
  }
  return reads
}

test('a finished row the transcript does not hold stops reading it once two reads missed it', async ($, on) => {
  expect(await readsOver($, on, [reply('', call('other'))], false, 4)).toBe(2)
})

test('a finished row missing from one read is found by the next', async ($, on) => {
  let reads = 0
  stubRow(on, () => 'row')
  on('session.messages', () => {
    reads++
    const above = call('e', 'Edit', { result: edit, text: 'ok' })
    return { value: reads === 1 ? [reply('', above)] : [reply('', above), results(), reply('', call('toolu_1'))] }
  })
  const margins = []
  for (let i = 0; i < 2; i++) {
    const ui = await mountRow($, 'Bash', { input: { command: 'ls' } })
    margins.push((await ui.findAll({ type: 'Box' })).map(box => (box.props as { marginTop?: number }).marginTop))
    await ui.unmount()
  }
  expect(margins[0]).not.toContain(-1)
  expect(margins[1]).toContain(-1)
})

test('a row under a finished call reads the transcript once', async ($, on) => {
  const above = call('e', 'Edit', { result: edit, text: 'ok' })
  expect(await readsOver($, on, [reply('', above), results(), reply('', call('toolu_1'))], false)).toBe(1)
})

test('a running row the transcript does not hold yet reads it again', async ($, on) => {
  expect(await readsOver($, on, [reply('', call('other'))], true)).toBe(2)
})

test('a row under a call still running reads the transcript again', async ($, on) => {
  expect(await readsOver($, on, [reply('', call('e', 'Edit'), call('toolu_1'))], false)).toBe(2)
})
