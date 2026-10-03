import { expect, test, type TestBody } from 'claude-code/testing'

import { changeCounts, rowLabel } from './files'
import { mountResult, mountRow } from './mount'
import { textWidth } from './utils'

const ROOT = '/home/me/project'
const patch = (...lines: string[]) => [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines }]

test('an edit counts the lines it added and removed', () => {
  const edit = (...lines: string[]) => changeCounts({ structuredPatch: patch(...lines) })
  expect(edit(' kept', '+new')).toEqual({ added: 1, removed: 0 })
  expect(edit('+one', '+two', '-old')).toEqual({ added: 2, removed: 1 })
  expect(edit(' kept')).toEqual({ added: 0, removed: 0 })
})

test('a new file counts every line it was written with', () => {
  const output = { type: 'create' as const, content: 'one\ntwo\nthree', structuredPatch: [] }
  expect(changeCounts(output)).toEqual({ added: 3, removed: 0 })
  expect(changeCounts({ ...output, content: 'one\ntwo\n' })).toEqual({ added: 2, removed: 0 })
})

test('a change with no patch counts from its git diff', () => {
  const output = { type: 'update' as const, structuredPatch: [], gitDiff: { additions: 4, deletions: 2 } }
  expect(changeCounts(output)).toEqual({ added: 4, removed: 2 })
})

test('the row label is the text the engine draws', () => {
  expect(rowLabel('Edit', { old_string: 'a' }, 'potato.md')).toBe('● Update(potato.md)')
  expect(rowLabel('Edit', { old_string: '' }, 'potato.md')).toBe('● Create(potato.md)')
  expect(rowLabel('Write', {}, 'potato.md')).toBe('● Write(potato.md)')
})

test('a label is as wide as the columns it takes', () => {
  expect(textWidth('● Update(a.md)')).toBe(14)
  expect(textWidth('笔记.md')).toBe(7)
  expect(textWidth('é')).toBe(1)
})

// A finished edit that replaced one line.
const edited = { type: 'update', filePath: `${ROOT}/a.md`, content: 'x', structuredPatch: patch('-old', '+new'), originalFile: 'old' }

// Mounts a finished call's row and its result, the engine beneath drawing
// the path it was handed for the row and `diff` for the result.
const draw = async (...[$, on, tool, output]: [...Parameters<TestBody>, tool: string, output: unknown]) => {
  on('session.root', () => ({ value: ROOT }))
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{(e.props.input as { file_path: string }).file_path}</Text>
  })
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>diff</Text>
  })

  const row = await mountRow($, tool, { input: { file_path: `${ROOT}/a.md` }, output })
  const drawn = {
    path: (await row.find({ type: 'Text' }))?.text,
    added: await row.find({ type: 'Text', text: /^\+\d+$/ }),
    removed: await row.find({ type: 'Text', text: /^-\d+$/ }),
  }
  await row.unmount()

  const result = await mountResult($, tool, { output })
  const diff = await result.find({ type: 'Text', text: 'diff' })
  await result.unmount()
  return { ...drawn, diff }
}

for (const tool of ['Edit', 'Write']) {
  test(`the ${tool} row shows +added in green and -removed in red, and no diff`, async ($, on) => {
    const { path, added, removed, diff } = await draw($, on, tool, edited)

    expect(path).toBe('a.md')
    expect(added).toMatchObject({ text: '+1', props: { color: 'success' } })
    expect(removed).toMatchObject({ text: '-1', props: { color: 'error' } })
    expect(diff).toBeUndefined()
  })

  test(`a ${tool} held for review is drawn by the engine as usual`, async ($, on) => {
    const { added, diff } = await draw($, on, tool, { ...edited, staged: true })

    expect(added).toBeUndefined()
    expect(diff).toBeDefined()
  })
}

test('a new file shows only its added lines', async ($, on) => {
  const output = { type: 'create', filePath: `${ROOT}/a.md`, content: 'one\ntwo\nthree\n', structuredPatch: [], originalFile: null }
  const { added, removed } = await draw($, on, 'Write', output)

  expect(added).toMatchObject({ text: '+3' })
  expect(removed).toBeUndefined()
})

test('a running edit shows the path alone', async ($, on) => {
  const { path, added } = await draw($, on, 'Edit', undefined)

  expect(path).toBe('a.md')
  expect(added).toBeUndefined()
})

test('a failed edit is drawn by the engine as usual', async ($, on) => {
  on('session.root', () => ({ value: ROOT }))
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>error</Text>
  })

  const result = await mountResult($, 'Edit', { output: 'String not found', isErrored: true })
  const error = await result.find({ type: 'Text', text: 'error' })
  await result.unmount()

  expect(error).toBeDefined()
})

test('counts that would not fit after a long path go on a line beneath the row', async ($, on) => {
  on('session.root', () => ({ value: ROOT }))
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>row</Text>
  })
  const file_path = `/tmp/${'deep/'.repeat(20)}a.md`
  const ui = await mountRow($, 'Edit', { input: { file_path }, output: edited })
  expect(await ui.find({ type: 'Text', text: '  ⎿  ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\+1$/ })).toMatchObject({ props: { color: 'success' } })
  expect(await ui.find({ type: 'Text', text: /^-1$/ })).toMatchObject({ props: { color: 'error' } })
  await ui.unmount()
})
