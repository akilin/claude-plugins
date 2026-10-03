import { expect, test } from 'claude-code/testing'

import { commandSource, shellLines, shortCommand } from './shell'

test('a shell result is the lines of both its streams, or of the text a failed call read', () => {
  expect(shellLines({ stdout: '1\n2\n', stderr: 'warn' })).toEqual(['1', '2', 'warn'])
  expect(shellLines({ stdout: '', stderr: '' })).toEqual([])
  expect(shellLines('Exit code 1\nboom')).toEqual(['Exit code 1', 'boom'])
  expect(shellLines({ stdout: '\x1b[31mred\x1b[0m\tx\r' })).toEqual(['red  x'])
})

test('a shell result drops hyperlinks, titles and charset switches, keeping their text', () => {
  expect(shellLines({ stdout: '\x1b]8;;file:///a.txt\x07a.txt\x1b]8;;\x1b\\\n' })).toEqual(['a.txt'])
  expect(shellLines({ stdout: '\x1b]0;title\x07a\x1b(Bb' })).toEqual(['ab'])
})

test('a shell result shows a line carriage returns wrote over as a terminal leaves it', () => {
  expect(shellLines({ stdout: '10%\r50%\r100%\n' })).toEqual(['100%'])
  expect(shellLines({ stdout: 'abcdef\r12\n' })).toEqual(['12cdef'])
  expect(shellLines({ stdout: 'one\r\ntwo\r\n' })).toEqual(['one', 'two'])
})

test('a shell result has no trailing blank lines', () => {
  expect(shellLines({ stdout: 'a\n', stderr: 'b\n\x1b[0m\n' })).toEqual(['a', 'b'])
})

test('a command fits on one row, its lines joined and cut with an ellipsis past the room', () => {
  expect(shortCommand('seq 1 3', 20)).toEqual({ text: 'seq 1 3', isCut: false })
  expect(shortCommand('echo one && \\\n  echo two', 40)).toEqual({ text: 'echo one && echo two', isCut: true })
  expect(shortCommand('echo 0123456789', 10)).toEqual({ text: 'echo 0123…', isCut: true })
})

test('a command is cut by the columns it takes, never past its room', () => {
  expect(shortCommand('echo 笔记笔记笔记', 10)).toEqual({ text: 'echo 笔记…', isCut: true })
  expect(shortCommand('echo hi', 1)).toEqual({ text: '…', isCut: true })
  expect(shortCommand('echo hi', 0)).toEqual({ text: '…', isCut: true })
})

test('a command source is cut to its length, never inside a surrogate pair', () => {
  expect(commandSource(`a${'😀'.repeat(5000)}`)).toBe(`a${'😀'.repeat(4999)}`)
  expect(commandSource('echo hi\n\n')).toBe('echo hi')
})
