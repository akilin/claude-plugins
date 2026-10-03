import { expect, test } from 'claude-code/testing'

import { shortPath, textWidth } from './utils'

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

test('a label is as wide as the columns it takes', () => {
  expect(textWidth('● Update(a.md)')).toBe(14)
  expect(textWidth('笔记.md')).toBe(7)
  expect(textWidth('é')).toBe(1)
})
