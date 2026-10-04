import type { PromptOrigin, RenderPropsOf } from 'claude-code'
import { expect, test, type Engine, type TestBody } from 'claude-code/testing'

import { bubbleWidth, textWidth } from './register'

type On = Parameters<TestBody>[1]

// Mounts a prompt row through the plugin on an 80 column terminal, the
// engine beneath drawing `engine row`.
const mountMessage = ($: Engine, on: On, props: Partial<RenderPropsOf['UserMessage']> = {}, surface: 'terminal' | 'desktop' = 'terminal') => {
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
  return $.ui.mount({
    plugin: 'prompt-bubbles',
    surface,
    component: 'UserMessage',
    props: { text: 'hello there', origin: { kind: 'composer' }, isExpanded: false, ...props },
    viewport: { columns: 80, rows: 24 },
  })
}

test('a bubble fits its longest line and stops at three quarters of the width', () => {
  expect(bubbleWidth('hi', 80)).toBe(6)
  expect(bubbleWidth('one\nlonger line', 80)).toBe(15)
  expect(bubbleWidth('x'.repeat(200), 80)).toBe(60)
  expect(textWidth('日本')).toBe(4)
})

test('the person’s prompt is drawn as a right-aligned bubble', async ($, on) => {
  const ui = await mountMessage($, on)
  expect(await ui.drawn()).toMatchObject({ type: 'Box', props: { justifyContent: 'flex-end' } })
  expect((await ui.find({ key: 'bubble' }))?.text).toBe('hello there')
  expect(await ui.find({ type: 'Text', text: 'engine row' })).toBeUndefined()
  await ui.unmount()
})

for (const origin of [{ kind: 'task-notification' }, { kind: 'peer' }] as PromptOrigin[]) {
  test(`a ${origin.kind} row keeps the engine's drawing`, async ($, on) => {
    const ui = await mountMessage($, on, { origin })
    expect(await ui.find({ type: 'Text', text: 'engine row' })).toBeDefined()
    expect(await ui.find({ key: 'bubble' })).toBeUndefined()
    await ui.unmount()
  })
}

test('the desktop keeps its own bubbles', async ($, on) => {
  const ui = await mountMessage($, on, {}, 'desktop')
  expect(await ui.find({ key: 'bubble' })).toBeUndefined()
  await ui.unmount()
})
