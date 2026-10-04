import { expect, test } from 'claude-code/testing'

import { fileUrl, fitEnd, fitWidth, shortPath, stripControl, textWidth } from './utils'

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

test('an emoji is as wide as a terminal draws it', () => {
  expect(textWidth('✅')).toBe(2)
  expect(textWidth('✓')).toBe(1)
  expect(textWidth('\u2764')).toBe(1)
  expect(textWidth('\u2764\ufe0f')).toBe(2)
  expect(textWidth('👨\u200d👩\u200d👧')).toBe(2)
  expect(textWidth('🀄🈚')).toBe(4)
})

test('a fit never ends past its room, nor splits a joined emoji', () => {
  expect(fitWidth('a\u2764\ufe0f', 2)).toBe('a\u2764')
  expect(fitWidth('👨\u200d👩\u200d👧b', 2)).toBe('👨\u200d👩\u200d👧')
})

test('an end fit never takes more than its room, nor opens inside a joined emoji or on a mark', () => {
  expect(fitEnd('/a/b/note.md', 7)).toBe('note.md')
  expect(fitEnd('笔记.md', 5)).toBe('记.md')
  expect(fitEnd('笔记.md', 4)).toBe('.md')
  expect(fitEnd('a👨\u200d👩\u200d👧', 2)).toBe('👨\u200d👩\u200d👧')
  expect(fitEnd('a\u2764\ufe0f', 2)).toBe('\u2764\ufe0f')
  expect(fitEnd('ae\u0301', 1)).toBe('e\u0301')
  expect(fitEnd('abc', 0)).toBe('')
})

test('control characters and bidi overrides are stripped', () => {
  expect(stripControl('a\x1b\x9bb\u202ec\u2066d\u2069')).toBe('abcd')
  expect(stripControl('a\tb\nc', '\t\n')).toBe('a\tb\nc')
})

test('a file URL holds the full path, a Windows one with forward slashes', () => {
  expect(fileUrl('/home/me/project/a.md')).toBe('file:///home/me/project/a.md')
  expect(fileUrl('/home/me/my notes/#1?.md')).toBe('file:///home/me/my%20notes/%231%3F.md')
  expect(fileUrl('C:\\Users\\me\\a.md')).toBe('file:///C:/Users/me/a.md')
  expect(fileUrl('\\\\server\\share\\a.md')).toBe('file://server/share/a.md')
  expect(fileUrl('\\\\?\\C:\\Users\\me\\a.md')).toBe('file:///C:/Users/me/a.md')
  expect(fileUrl('\\\\?\\UNC\\server\\share\\a.md')).toBe('file://server/share/a.md')
})
