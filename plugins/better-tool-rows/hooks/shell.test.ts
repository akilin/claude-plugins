import { expect, test } from 'claude-code/testing'

import { commandShape, commandSource, isShapeCut, shellLines, shortCommand, withOverwrites } from './shell'

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

test('a shell result drops device control and other escape strings, and 8-bit sequences', () => {
  expect(shellLines({ stdout: '\x1bP1$r0m\x1b\\done' })).toEqual(['done'])
  expect(shellLines({ stdout: 'a\x1b_app\x07b\x1b^pm\x1b\\c\x1bXsos\x1b\\d' })).toEqual(['abcd'])
  expect(shellLines({ stdout: '\x9b31mred\x9b0m' })).toEqual(['red'])
  expect(shellLines({ stdout: '\x9d0;title\x9ca\x90q\x9cb' })).toEqual(['ab'])
  expect(shellLines({ stdout: 'Plain X^_ text' })).toEqual(['Plain X^_ text'])
})

test('a shell result shows a line carriage returns wrote over as a terminal leaves it', () => {
  expect(shellLines({ stdout: '10%\r50%\r100%\n' })).toEqual(['100%'])
  expect(shellLines({ stdout: 'abcdef\r12\n' })).toEqual(['12cdef'])
  expect(shellLines({ stdout: 'one\r\ntwo\r\n' })).toEqual(['one', 'two'])
  expect(shellLines({ stdout: '😀😀x\rA' })).toEqual(['A😀x'])
  expect(shellLines({ stdout: 'héllo\r😀' })).toEqual(['😀éllo'])
})

test('the engine is handed a stream carriage returns wrote over as a terminal leaves it, and any other as it is', () => {
  const output = { stdout: '😀😀x\rA\nhéllo\r😀\n', stderr: 'one\r\n\x1b[31mred\x1b[0m', interrupted: false }
  expect(withOverwrites(output)).toEqual({ ...output, stdout: 'A😀x\n😀éllo' })
  expect(withOverwrites('Exit code 1\r50%')).toBe('Exit code 1\r50%')
  const untouched = { stdout: 'one\r\ntwo\n', stderr: '', interrupted: false }
  expect(withOverwrites(untouched)).toBe(untouched)
  expect(Object.keys(withOverwrites({ stdout: 'a\rb', interrupted: false }) as object)).toEqual(['stdout', 'interrupted'])
})

test('a shell result has no trailing blank lines', () => {
  expect(shellLines({ stdout: 'a\n', stderr: 'b\n\x1b[0m\n' })).toEqual(['a', 'b'])
})

test('a command fits on one row, its lines joined and cut with an ellipsis past the room', () => {
  expect(shortCommand('seq 1 3', 20)).toEqual({ text: 'seq 1 3', isCut: false })
  expect(shortCommand('echo one && \\\n  echo two', 40)).toEqual({ text: 'echo one && echo two', isCut: true })
  expect(shortCommand('echo 0123456789', 10)).toEqual({ text: 'echo 0123…', isCut: true })
  expect(shortCommand('echo one && \\\r\n  echo two', 40)).toEqual({ text: 'echo one && echo two', isCut: true })
  expect(shortCommand('echo \u202etxt.exe', 40)).toEqual({ text: 'echo txt.exe', isCut: true })
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

test('a command shape is cut at every room just where the command is', () => {
  const commands = ['seq 1 3', 'echo one && \\\n  echo two', 'echo 0123456789', 'echo \u202etxt.exe', 'echo 笔记笔记笔记', '  ls  ', '']
  for (const command of commands) {
    for (let room = -1; room <= 25; room++) {
      expect(isShapeCut(commandShape(command), room)).toBe(shortCommand(command, room).isCut)
    }
  }
})
