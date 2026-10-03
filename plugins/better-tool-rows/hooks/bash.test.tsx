import type { RenderPropsOf } from 'claude-code'
import { expect, test, type TestBody } from 'claude-code/testing'

import { commandRoom, FOLD_OVER } from './bash'
import { mountResult, mountRow, stubResult, stubRow } from './mount'
import { GROUP_INDENT, textWidth, toolLabel } from './utils'

const LONG = `echo ${'x'.repeat(200)} && \\\n  echo done`

// The engine beneath the plugin: it draws a Bash row as `row`, or `row
// inline` for an output it was handed, collecting the commands it was handed;
// its result as `result`; and answers a Bash call with the output it is made
// with. Every hook is in before the test first calls `$`.
const engine = (...[$, on]: Parameters<TestBody>) => {
  const commands: unknown[] = []
  stubRow(on, ({ input, output }) => {
    commands.push((input as { command: unknown }).command)
    return output === undefined ? 'row' : 'row inline'
  })
  stubResult(on, 'result')
  let answer: unknown
  on('tool.call', { tool: 'Bash' }, () => ({ result: answer as never }))

  return {
    commands,
    // Makes the Bash call `toolu_1` with `command`, answered with `output`, as
    // a session does before it draws the call's row and result.
    makeCall: async (command: string, output: unknown) => {
      answer = output
      await $.tool.call({ tool: 'Bash', tool_use_id: 'toolu_1', command })
    },
    // Mounts the row of a Bash call of `command` (`seq 1 3` by default) that
    // printed `output`.
    mount: (output: unknown, { command = 'seq 1 3', ...props }: Partial<RenderPropsOf['ToolUse']> & { command?: string } = {}) =>
      mountRow($, 'Bash', { input: { command }, output, ...props }),
    // Mounts the result beneath a Bash row, and whether the engine drew it.
    drawsResult: async (output: unknown) => {
      const ui = await mountResult($, 'Bash', { output })
      const result = await ui.find({ type: 'Text', text: 'result' })
      await ui.unmount()
      return result !== undefined
    },
  }
}

const numbers = (n: number) => ({ stdout: `${Array.from({ length: n }, (_, i) => i + 1).join('\n')}\n`, stderr: '', interrupted: false })
const interrupted = { ...numbers(2), interrupted: true }
const backgrounded = { ...numbers(0), backgroundTaskId: 'b1' }

test('a long bash output starts folded under the row and unfolds and folds on a press', async ($, on) => {
  const ui = await engine($, on).mount(numbers(FOLD_OVER + 1))
  const label = `${FOLD_OVER + 1} lines`
  expect(await ui.find({ type: 'Text', text: /^row$/ })).toBeDefined()
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
    const ui = await engine($, on).mount(output)
    expect(await ui.find({ key: 'output' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'row inline' })).toBeDefined()
    await ui.unmount()
  })
}

test('a cut command fits its row and is shown whole above a long output when the row unfolds', async ($, on) => {
  const bash = engine($, on)
  const ui = await bash.mount(numbers(FOLD_OVER + 1), { command: LONG })
  const row = bash.commands.at(-1) as string
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
  const ui = await engine($, on).mount(numbers(2), { command: LONG })
  expect(await ui.find({ type: 'Text', text: 'row inline' })).toBeDefined()
  expect((await ui.find({ key: 'output' }))?.text).toBe('▸ command')

  await ui.press({ key: 'output' })
  expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: LONG })
  expect(await ui.find({ type: 'Text', text: '2' })).toBeUndefined()
  await ui.unmount()
})

test('a cut command made this session with a short output folds the command above the output', async ($, on) => {
  const bash = engine($, on)
  await bash.makeCall(LONG, numbers(2))
  const ui = await bash.mount(numbers(2), { command: LONG })
  expect(await ui.find({ type: 'Text', text: /^row$/ })).toBeDefined()
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
  const bash = engine($, on)
  await bash.makeCall('seq 1 2', numbers(2))
  const ui = await bash.mount(numbers(2), { command: 'seq 1 2' })
  expect(await ui.find({ type: 'Text', text: 'row inline' })).toBeDefined()
  expect(await ui.find({ key: 'output' })).toBeUndefined()
  await ui.unmount()
})

test('a cut command made this session with no output says so beneath the fold', async ($, on) => {
  const bash = engine($, on)
  await bash.makeCall(LONG, numbers(0))
  const ui = await bash.mount(numbers(0), { command: LONG })
  expect(await ui.find({ type: 'Text', text: 'row inline' })).toBeUndefined()
  const drawn = (await ui.findAll({})).filter(el => el.key === 'output' || (el.type === 'Text' && el.text === '(No output)'))
  expect(drawn.map(el => el.text)).toEqual(['▸ command', '(No output)'])
  await ui.unmount()
})

for (const [what, output] of [
  ['an interrupted', interrupted],
  ['a backgrounded', backgrounded],
] as const) {
  test(`a cut command made this session with ${what} output leaves it to the engine and folds the command alone`, async ($, on) => {
    const bash = engine($, on)
    await bash.makeCall(LONG, output)
    const ui = await bash.mount(output, { command: LONG })
    expect(await ui.find({ type: 'Text', text: 'row inline' })).toBeDefined()
    expect((await ui.find({ key: 'output' }))?.text).toBe('▸ command')
    expect(await ui.find({ type: 'Text', text: '2' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '(No output)' })).toBeUndefined()
    await ui.unmount()
  })
}

test('a short output of a command a plugin above made longer is drawn beneath the row with no fold', async ($, on) => {
  const bash = engine($, on)
  await bash.makeCall(LONG, numbers(2))
  const ui = await bash.mount(numbers(2), { command: 'seq 1 2' })
  expect(await ui.find({ type: 'Text', text: /^row$/ })).toBeDefined()
  expect(await ui.find({ key: 'output' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '2' })).toBeDefined()
  await ui.unmount()
})

test('a running call with a long command shows it cut', async ($, on) => {
  stubRow(on, ({ input }) => (input as { command: string }).command)
  const ui = await mountRow($, 'Bash', { input: { command: LONG }, isRunning: true })
  expect(await ui.find({ key: 'output' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: LONG })).toBeUndefined()
  await ui.unmount()
})

test('the result beneath a long bash output draws nothing', async ($, on) => {
  expect(await engine($, on).drawsResult(numbers(FOLD_OVER + 1))).toBe(false)
})

test('the result beneath a short bash output is drawn by the engine, whatever its row drew', async ($, on) => {
  expect(await engine($, on).drawsResult(numbers(2))).toBe(true)
})

for (const [what, output] of [
  ['a short', numbers(2)],
  ['no', numbers(0)],
] as const) {
  test(`the result beneath a cut command made this session with ${what} output draws nothing, its row drawing it`, async ($, on) => {
    const bash = engine($, on)
    await bash.makeCall(LONG, output)
    expect(await bash.drawsResult(output)).toBe(false)
  })
}

test('the result beneath a short command made this session is drawn by the engine', async ($, on) => {
  const bash = engine($, on)
  await bash.makeCall('seq 1 2', numbers(2))
  expect(await bash.drawsResult(numbers(2))).toBe(true)
})

for (const [what, output] of [
  ['an interrupted', interrupted],
  ['a backgrounded', backgrounded],
  ['an image', { ...numbers(1), isImage: true }],
  ['a saved', { ...numbers(FOLD_OVER + 1), persistedOutputPath: '/tmp/out.txt' }],
] as const) {
  test(`the result beneath ${what} output of a cut command made this session is drawn by the engine`, async ($, on) => {
    const bash = engine($, on)
    await bash.makeCall(LONG, output)
    expect(await bash.drawsResult(output)).toBe(true)
  })
}

// Every kind of output, for the row and the result to agree on.
const OUTPUTS = {
  'no output': { output: numbers(0) },
  'a short output': { output: numbers(2) },
  'a long output': { output: numbers(FOLD_OVER + 1) },
  'an interrupted output': { output: interrupted },
  'a backgrounded output': { output: backgrounded },
  "an interrupted call's text": { output: 'Interrupted by user', isInterrupted: true },
  "a failed call's long text": { output: `Exit code 1\n${numbers(FOLD_OVER + 1).stdout}`, isErrored: true },
}

for (const [what, { output, ...props }] of Object.entries(OUTPUTS)) {
  for (const command of ['seq 1 2', LONG]) {
    for (const isMade of [false, true]) {
      const call = `${command === LONG ? 'a cut' : 'a short'} command${isMade ? ' made this session' : ''}`
      test(`the row or the result draws ${what} of ${call}, never both`, async ($, on) => {
        const bash = engine($, on)
        if (isMade) {
          await bash.makeCall(command, output)
        }
        const ui = await bash.mount(output, { command, ...props })
        const isTakenFromEngine = (await ui.find({ type: 'Text', text: /^row$/ })) !== undefined
        await ui.unmount()
        expect(await bash.drawsResult(output)).toBe(!isTakenFromEngine)
      })
    }
  }
}
