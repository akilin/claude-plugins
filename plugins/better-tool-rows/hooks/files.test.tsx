import { expect, test, type TestBody } from 'claude-code/testing'

import { changeCounts, rowLabel } from './files'
import { mountResult, mountRow, stubResult, stubRoot, stubRow } from './mount'
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

for (const tool of ['Read', 'Edit', 'Write']) {
  test(`the engine draws the ${tool} row with the shorter path`, async ($, on) => {
    stubRoot(on, ROOT)
    const drawn: unknown[] = []
    stubRow(on, props => {
      drawn.push(props.input)
      return 'row'
    })

    const ui = await mountRow($, tool, { input: { file_path: `${ROOT}/.devcontainer/Dockerfile`, offset: 15, limit: 8 } })
    await ui.unmount()

    expect(drawn).toEqual([{ file_path: '.devcontainer/Dockerfile', offset: 15, limit: 8 }])
  })
}

for (const tool of ['Read', 'Edit', 'Write']) {
  test(`the ${tool} row's shorter path links to the full one`, async ($, on) => {
    stubRoot(on, ROOT)
    stubRow(on, () => 'row')

    const ui = await mountRow($, tool, { input: { file_path: `${ROOT}/src/a.md` } })
    const link = await ui.find({ type: 'Link' })
    await ui.unmount()

    expect(link).toMatchObject({ children: ['src/a.md'], props: { href: `file://${ROOT}/src/a.md` } })
  })
}

test('the link is laid over the label line, not the output a grouped row draws beneath it', async ($, on) => {
  stubRoot(on, ROOT)
  stubRow(on, () => '\n● Read(src/a.md)\n    Read 8 lines')

  const ui = await mountRow($, 'Read', { input: { file_path: `${ROOT}/src/a.md` }, output: { type: 'text' } })
  const boxes = await ui.findAll({ type: 'Box' })
  await ui.unmount()

  const overlay = boxes.find(box => (box.props as { position?: string }).position === 'absolute')
  expect(overlay?.props).toMatchObject({ top: 1, left: textWidth('● Read()') - 1 })
  expect((overlay?.props as { bottom?: number }).bottom).toBeUndefined()
})

test('a path drawn in full, or too long for the line, keeps the link the engine draws', async ($, on) => {
  stubRoot(on, ROOT)
  stubRow(on, () => 'row')

  for (const file_path of ['/etc/hosts', `${ROOT}/${'deep/'.repeat(20)}a.md`]) {
    const ui = await mountRow($, 'Read', { input: { file_path } })
    expect(await ui.find({ type: 'Link' })).toBeUndefined()
    await ui.unmount()
  }
})

test('paths stay relative to the folder the session started in after the project root moves', async ($, on) => {
  let root = ROOT
  on('session.root', () => ({ value: root }))
  const drawn: unknown[] = []
  stubRow(on, props => {
    drawn.push((props.input as { file_path: string }).file_path)
    return 'row'
  })

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  root = `${ROOT}/sub`
  const ui = await mountRow($, 'Read', { input: { file_path: `${ROOT}/sub/a.md` } })
  await ui.unmount()

  expect(drawn).toEqual(['sub/a.md'])
})

// A finished edit that replaced one line.
const edited = { type: 'update', filePath: `${ROOT}/a.md`, content: 'x', structuredPatch: patch('-old', '+new'), originalFile: 'old' }

// Mounts a finished call's row and its result, the engine beneath drawing
// the path it was handed for the row and `diff` for the result.
const draw = async (...[$, on, tool, output]: [...Parameters<TestBody>, tool: string, output: unknown]) => {
  stubRoot(on, ROOT)
  stubRow(on, props => (props.input as { file_path: string }).file_path)
  stubResult(on, 'diff')

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
  stubRoot(on, ROOT)
  stubResult(on, 'error')

  const result = await mountResult($, 'Edit', { output: 'String not found', isErrored: true })
  const error = await result.find({ type: 'Text', text: 'error' })
  await result.unmount()

  expect(error).toBeDefined()
})

// Mounts an Edit row of `file_path`, and whether its counts went on a line
// beneath it.
const countsBeneath = async (...[$, on, file_path]: [...Parameters<TestBody>, file_path: string]) => {
  stubRoot(on, ROOT)
  stubRow(on, () => 'row')
  const ui = await mountRow($, 'Edit', { input: { file_path }, output: edited })
  expect(await ui.find({ type: 'Text', text: /^\+1$/ })).toMatchObject({ props: { color: 'success' } })
  expect(await ui.find({ type: 'Text', text: /^-1$/ })).toMatchObject({ props: { color: 'error' } })
  const gutter = await ui.find({ type: 'Text', text: '  ⎿  ' })
  await ui.unmount()
  return gutter !== undefined
}

test('counts that would not fit after a long path go on a line beneath the row', async ($, on) => {
  expect(await countsBeneath($, on, `/tmp/${'deep/'.repeat(20)}a.md`)).toBe(true)
})

test('counts that would not fit after a path inside a group go on a line beneath the row', async ($, on) => {
  // `● Update(/xx…x.md)` 72 columns wide: ` +1 -1` fits on an 80 column
  // line, but not after a group's indent.
  const file_path = `/${'x'.repeat(72 - textWidth('● Update(/.md)'))}.md`
  expect(textWidth(rowLabel('Edit', {}, file_path))).toBe(72)
  expect(await countsBeneath($, on, file_path)).toBe(true)
})

test('counts that fit after the path are laid on the row', async ($, on) => {
  expect(await countsBeneath($, on, `${ROOT}/a.md`)).toBe(false)
})
