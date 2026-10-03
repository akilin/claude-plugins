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

// Makes the Bash call `toolu_1` with `command`, the engine beneath answering
// `output`, as a session does before it draws the call's row and result; `on`
// takes the engine's answer as its last hook, before the call.
const makeCall = async (...[$, on, command, output]: [...Parameters<TestBody>, command: string, output: unknown]) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: output as never }))
  await $.tool.call({ tool: 'Bash', tool_use_id: 'toolu_1', command })
}

// Mounts a Bash row, the engine beneath drawing `row`, and `row inline` for
// an output it was handed; `commands` collects the commands it was handed.
// `isMade` makes the call first, as this session would have.
const mount = async (
  ...[$, on, output, command = 'seq 1 3', isMade = false]: [
    ...Parameters<TestBody>,
    output: unknown,
    command?: string,
    isMade?: boolean,
  ]
) => {
  const commands: unknown[] = []
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    commands.push((e.props.input as { command: unknown }).command)
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.output === undefined ? 'row' : 'row inline'}</Text>
  })
  if (isMade) {
    await makeCall($, on, command, output)
  }
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

test('a cut command not made this session with a short output keeps the output and folds the command alone', async ($, on) => {
  const { ui } = await mount($, on, numbers(2), LONG)
  expect(await ui.find({ type: 'Text', text: 'row inline' })).toBeDefined()
  expect((await ui.find({ key: 'output' }))?.text).toBe('▸ command')

  await ui.press({ key: 'output' })
  expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: LONG })
  expect(await ui.find({ type: 'Text', text: '2' })).toBeUndefined()
  await ui.unmount()
})

test('a cut command made this session with a short output folds the command above the output', async ($, on) => {
  const { ui } = await mount($, on, numbers(2), LONG, true)
  expect(await ui.find({ type: 'Text', text: 'row' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'row inline' })).toBeUndefined()
  expect((await ui.find({ key: 'output' }))?.text).toBe('▸ command')
  expect(await ui.find({ type: 'Text', text: '2' })).toBeDefined()

  await ui.press({ key: 'output' })
  const drawn = (await ui.findAll({})).filter(el => el.type === 'Code' || el.text === '1')
  expect(drawn.map(el => el.type)).toEqual(['Code', 'Text'])
  expect(drawn[0]?.props).toMatchObject({ source: LONG })

  await ui.press({ key: 'output' })
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '2' })).toBeDefined()
  await ui.unmount()
})

test('a short command made this session with a short output is drawn by the engine as usual', async ($, on) => {
  const { ui } = await mount($, on, numbers(2), 'seq 1 2', true)
  expect(await ui.find({ type: 'Text', text: 'row inline' })).toBeDefined()
  expect(await ui.find({ key: 'output' })).toBeUndefined()
  await ui.unmount()
})

test('a cut command made this session with no output says so beneath the fold', async ($, on) => {
  const { ui } = await mount($, on, numbers(0), LONG, true)
  expect(await ui.find({ type: 'Text', text: 'row inline' })).toBeUndefined()
  const drawn = (await ui.findAll({})).filter(el => el.key === 'output' || (el.type === 'Text' && el.text === '(No output)'))
  expect(drawn.map(el => el.text)).toEqual(['▸ command', '(No output)'])
  await ui.unmount()
})

test('the result beneath a cut command made this session with no output draws nothing', async ($, on) => {
  expect(await drawsResult($, on, numbers(0), LONG)).toBe(false)
})

const interrupted = { ...numbers(2), interrupted: true }

test('a cut command made this session with an interrupted output leaves it to the engine and folds the command alone', async ($, on) => {
  const { ui } = await mount($, on, interrupted, LONG, true)
  expect(await ui.find({ type: 'Text', text: 'row inline' })).toBeDefined()
  expect((await ui.find({ key: 'output' }))?.text).toBe('▸ command')
  expect(await ui.find({ type: 'Text', text: '2' })).toBeUndefined()
  await ui.unmount()
})

test('the result beneath a cut command made this session with an interrupted output is drawn by the engine', async ($, on) => {
  expect(await drawsResult($, on, interrupted, LONG)).toBe(true)
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

// Mounts a Bash result, the engine beneath drawing `result`, and whether it
// drew; given a `command`, the call is made with it first.
const drawsResult = async (...[$, on, output, command]: [...Parameters<TestBody>, output: unknown, command?: string]) => {
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>result</Text>
  })
  if (command !== undefined) {
    await makeCall($, on, command, output)
  }
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

test('the result beneath a cut command made this session draws nothing, its row drawing the output', async ($, on) => {
  expect(await drawsResult($, on, numbers(2), LONG)).toBe(false)
})

test('the result beneath a short command made this session is drawn by the engine', async ($, on) => {
  expect(await drawsResult($, on, numbers(2), 'seq 1 2')).toBe(true)
})
