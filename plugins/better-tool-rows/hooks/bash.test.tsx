import { expect, test, type TestBody } from 'claude-code/testing'

import { commandRoom, FOLD_OVER } from './bash'
import { mountResult, mountRow } from './mount'
import { shellLines, shortCommand } from './shell'
import { GROUP_INDENT, textWidth, toolLabel } from './utils'

test('a shell result is the lines of both its streams, or of the text a failed call read', () => {
  expect(shellLines({ stdout: '1\n2\n', stderr: 'warn' })).toEqual(['1', '2', 'warn'])
  expect(shellLines({ stdout: '', stderr: '' })).toEqual([])
  expect(shellLines('Exit code 1\nboom')).toEqual(['Exit code 1', 'boom'])
  expect(shellLines({ stdout: '\x1b[31mred\x1b[0m\tx\r' })).toEqual(['red  x'])
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

const LONG = `echo ${'x'.repeat(200)} && \\\n  echo done`

// Mounts a Bash row, the engine beneath drawing `row`, and `row inline` for
// an output it was handed; `commands` collects the commands it was handed.
const mount = async (...[$, on, output, command = 'seq 1 3']: [...Parameters<TestBody>, output: unknown, command?: string]) => {
  const commands: unknown[] = []
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    commands.push((e.props.input as { command: unknown }).command)
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.output === undefined ? 'row' : 'row inline'}</Text>
  })
  const ui = await mountRow($, 'Bash', { input: { command }, output })
  return { ui, commands }
}

const numbers = (n: number) => ({ stdout: `${Array.from({ length: n }, (_, i) => i + 1).join('\n')}\n`, stderr: '', interrupted: false })

test('a long bash output starts folded under the row and unfolds and folds on a press', async ($, on) => {
  const { ui } = await mount($, on, numbers(FOLD_OVER + 1))
  const label = `${FOLD_OVER + 1} lines`
  expect(await ui.find({ type: 'Text', text: 'row' })).toBeDefined()
  expect((await ui.find({ key: 'output' }))?.text).toBe(`▸ ${label}`)
  expect(await ui.find({ type: 'Text', text: '2' })).toBeUndefined()

  await ui.press({ key: 'output' })
  expect((await ui.find({ key: 'output' }))?.text).toBe(`▾ ${label}`)
  expect(await ui.find({ type: 'Text', text: '2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'row inline' })).toBeUndefined()
  expect(await ui.find({ type: 'Code' })).toBeUndefined()

  await ui.press({ key: 'output' })
  expect((await ui.find({ key: 'output' }))?.text).toBe(`▸ ${label}`)
  expect(await ui.find({ type: 'Text', text: '2' })).toBeUndefined()
  await ui.unmount()
})

for (const [what, output] of [['no', numbers(0)], [`${FOLD_OVER} lines of`, numbers(FOLD_OVER)]] as const) {
  test(`a command that printed ${what} output is drawn by the engine as usual`, async ($, on) => {
    const { ui } = await mount($, on, output)
    expect(await ui.find({ key: 'output' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'row inline' })).toBeDefined()
    await ui.unmount()
  })
}

test('a cut command fits its row and is shown whole above a long output when the row unfolds', async ($, on) => {
  const { ui, commands } = await mount($, on, numbers(FOLD_OVER + 1), LONG)
  const row = commands.at(-1) as string
  expect(textWidth(toolLabel('Bash', row))).toBeLessThanOrEqual(80 - GROUP_INDENT)
  expect(textWidth(row)).toBe(commandRoom(80))
  expect(row.endsWith('…')).toBe(true)
  expect((await ui.find({ key: 'output' }))?.text).toBe(`▸ command, ${FOLD_OVER + 1} lines`)
  expect(await ui.find({ type: 'Code' })).toBeUndefined()

  await ui.press({ key: 'output' })
  expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: LONG, language: 'bash' })
  expect(await ui.find({ type: 'Text', text: '2' })).toBeDefined()
  await ui.unmount()
})

test('a cut command with a short output keeps the output and folds the command alone', async ($, on) => {
  const { ui } = await mount($, on, numbers(2), LONG)
  expect(await ui.find({ type: 'Text', text: 'row inline' })).toBeDefined()
  expect((await ui.find({ key: 'output' }))?.text).toBe('▸ command')

  await ui.press({ key: 'output' })
  expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: LONG })
  expect(await ui.find({ type: 'Text', text: '2' })).toBeUndefined()
  await ui.unmount()
})

test('a running call with a long command shows it cut', async ($, on) => {
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{(e.props.input as { command: string }).command}</Text>
  })
  const ui = await mountRow($, 'Bash', { input: { command: LONG }, isRunning: true })
  expect(await ui.find({ key: 'output' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: LONG })).toBeUndefined()
  await ui.unmount()
})

// Mounts a Bash result, the engine beneath drawing `result`, and whether it drew.
const drawsResult = async (...[$, on, output]: [...Parameters<TestBody>, output: unknown]) => {
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>result</Text>
  })
  const ui = await mountResult($, 'Bash', { output })
  const result = await ui.find({ type: 'Text', text: 'result' })
  await ui.unmount()
  return result !== undefined
}

test('the result beneath a long bash output draws nothing', async ($, on) => {
  expect(await drawsResult($, on, numbers(FOLD_OVER + 1))).toBe(false)
})

test('the result beneath a short bash output is drawn by the engine, whatever its row drew', async ($, on) => {
  expect(await drawsResult($, on, numbers(2))).toBe(true)
})
