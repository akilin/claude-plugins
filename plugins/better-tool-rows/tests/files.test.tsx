import { expect, test, type TestBody } from 'claude-code/testing'

import { changeCounts, rowLabel } from '../hooks/files'
import { mountResult, mountRow, stubResult, stubRoot, stubRow } from './mount'
import { textWidth } from '../hooks/utils'

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

test('the link is clipped to the path, so a URL drawn after it covers nothing', async ($, on) => {
  stubRoot(on, ROOT)
  stubRow(on, () => '\n● Read(src/a.md)')

  const ui = await mountRow($, 'Read', { input: { file_path: `${ROOT}/src/a.md` }, output: { type: 'text' } })
  const boxes = await ui.findAll({ type: 'Box' })
  await ui.unmount()

  const overlay = boxes.find(box => (box.props as { position?: string }).position === 'absolute')
  expect(overlay?.props).toMatchObject({ width: textWidth('src/a.md'), height: 1, overflow: 'hidden' })
})

test('a path drawn in full, too long for the line, or no URL can hold, keeps the link the engine draws', async ($, on) => {
  stubRoot(on, ROOT)
  stubRow(on, () => 'row')

  for (const file_path of ['/etc/hosts', `${ROOT}/${'deep/'.repeat(20)}a.md`, `${ROOT}/a\ud800.md`]) {
    const ui = await mountRow($, 'Read', { input: { file_path } })
    expect(await ui.find({ type: 'Link' })).toBeUndefined()
    await ui.unmount()
  }
})

for (const name of ['REMOTE_CONTAINERS', 'CODESPACES']) {
  test(`in a dev container (${name}) the path is left for VS Code's terminal to link`, async ($, on) => {
    stubRoot(on, ROOT, { [name]: 'true' })
    stubRow(on, () => 'row')

    const ui = await mountRow($, 'Read', { input: { file_path: `${ROOT}/src/a.md` } })
    expect(await ui.find({ type: 'Link' })).toBeUndefined()
    await ui.unmount()
  })
}

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

// Mounts an Edit row of `file_path` on an 80 column line: the path the
// engine was handed, the link over it, and where the counts were laid.
const drawEdit = async (...[$, on, file_path]: [...Parameters<TestBody>, file_path: string]) => {
  stubRoot(on, ROOT)
  stubRow(on, props => (props.input as { file_path: string }).file_path)
  const ui = await mountRow($, 'Edit', { input: { file_path, old_string: 'old' }, output: edited })
  const path = (await ui.find({ type: 'Text' }))?.text ?? ''
  const link = await ui.find({ type: 'Link' })
  const overlays = (await ui.findAll({ type: 'Box' })).filter(box => (box.props as { position?: string }).position === 'absolute')
  const gutter = await ui.find({ type: 'Text', text: '  ⎿  ' })
  await ui.unmount()
  return { path, link, lefts: overlays.map(box => (box.props as { left?: number }).left), gutter }
}

test('a path too long for the line with its counts is cut to its end, the counts beside it', async ($, on) => {
  const file_path = `/tmp/${'deep/'.repeat(20)}a.md`
  const { path, link, lefts, gutter } = await drawEdit($, on, file_path)

  expect(path.startsWith('…')).toBe(true)
  expect(file_path.endsWith(path.slice(1))).toBe(true)
  // `● Update(…) +1 -1` takes the line less a group's indent.
  expect(textWidth(`${rowLabel('Edit', {}, path)} +1 -1`)).toBe(80 - 6)
  expect(lefts).toContain(textWidth(rowLabel('Edit', {}, path)) + 1)
  expect(link).toMatchObject({ children: [path], props: { href: `file://${file_path}` } })
  expect(gutter).toBeUndefined()
})

test('a path that fits the line with its counts only outside a group is cut too', async ($, on) => {
  // `● Update(/xx…x.md)` 72 columns wide: ` +1 -1` fits on an 80 column
  // line, but not after a group's indent.
  const file_path = `/${'x'.repeat(72 - textWidth('● Update(/.md)'))}.md`
  expect(textWidth(rowLabel('Edit', {}, file_path))).toBe(72)
  const { path } = await drawEdit($, on, file_path)

  // The room: 80 columns less a group's indent, `● Update()` and ` +1 -1`.
  const room = 80 - 6 - textWidth('● Update()') - textWidth(' +1 -1')
  expect(path).toBe(`…${file_path.slice(-(room - 1))}`)
})

test('a path that fits the line with its counts is drawn whole', async ($, on) => {
  const { path, lefts } = await drawEdit($, on, `${ROOT}/a.md`)

  expect(path).toBe('a.md')
  expect(lefts).toContain(textWidth('● Update(a.md)') + 1)
})

test('the counts are laid over the label line, not the output a grouped row draws beneath it', async ($, on) => {
  stubRoot(on, ROOT)
  stubRow(on, () => '\n● Update(a.md)\n    1 -old\n    1 +new')

  const ui = await mountRow($, 'Edit', { input: { file_path: `${ROOT}/a.md` }, output: edited })
  const boxes = await ui.findAll({ type: 'Box' })
  await ui.unmount()

  const overlay = boxes.find(box => (box.props as { left?: number }).left === textWidth('● Update(a.md)') + 1)
  expect(overlay?.props).toMatchObject({ position: 'absolute', top: 1 })
  expect((overlay?.props as { bottom?: number }).bottom).toBeUndefined()
})
