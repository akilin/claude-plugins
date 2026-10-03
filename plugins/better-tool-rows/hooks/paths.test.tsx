import { expect, test } from 'claude-code/testing'

import { mountRow } from './mount'
import { shortPath } from './utils'

const ROOT = '/home/me/project'

test('a path inside the project root is shown relative to it', () => {
  expect(shortPath(`${ROOT}/draft.md`, ROOT)).toBe('draft.md')
  expect(shortPath(`${ROOT}/.devcontainer/Dockerfile`, ROOT)).toBe('.devcontainer/Dockerfile')
  expect(shortPath(`${ROOT}/.devcontainer/Dockerfile`, `${ROOT}/`)).toBe('.devcontainer/Dockerfile')
})

test('a path outside the project root keeps its full path', () => {
  expect(shortPath('/etc/hosts', ROOT)).toBe('/etc/hosts')
  expect(shortPath('/home/me/project-other/a.md', ROOT)).toBe('/home/me/project-other/a.md')
  expect(shortPath('/HOME/me/project/a.md', ROOT)).toBe('/HOME/me/project/a.md')
})

test('a Windows path matches its root by either separator and in any case', () => {
  expect(shortPath('C:\\Users\\me\\project\\src\\a.md', 'C:\\Users\\me\\project')).toBe('src\\a.md')
  expect(shortPath('c:/users/me/PROJECT/a.md', 'C:\\Users\\me\\project')).toBe('a.md')
  expect(shortPath('D:\\other\\a.md', 'C:\\Users\\me\\project')).toBe('D:\\other\\a.md')
})

for (const tool of ['Read', 'Edit', 'Write']) {
  test(`the engine draws the ${tool} row with the shorter path`, async ($, on) => {
    on('session.root', () => ({ value: ROOT }))
    const drawn: unknown[] = []
    on('ui.render', { component: 'ToolUse' }, ($, e) => {
      drawn.push(e.props.input)
      const { Text } = $.ui.resolve(e)
      return <Text>row</Text>
    })

    const ui = await mountRow($, tool, { input: { file_path: `${ROOT}/.devcontainer/Dockerfile`, offset: 15, limit: 8 } })
    await ui.unmount()

    expect(drawn).toEqual([{ file_path: '.devcontainer/Dockerfile', offset: 15, limit: 8 }])
  })
}

test('paths stay relative to the folder the session started in after the project root moves', async ($, on) => {
  let root = ROOT
  on('session.root', () => ({ value: root }))
  const drawn: unknown[] = []
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    drawn.push((e.props.input as { file_path: string }).file_path)
    const { Text } = $.ui.resolve(e)
    return <Text>row</Text>
  })

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  root = `${ROOT}/sub`
  const ui = await mountRow($, 'Read', { input: { file_path: `${ROOT}/sub/a.md` } })
  await ui.unmount()

  expect(drawn).toEqual(['sub/a.md'])
})
