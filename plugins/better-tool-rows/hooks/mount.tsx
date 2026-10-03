import type { RenderPropsOf } from 'claude-code'
import type { Engine, TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]

const VIEWPORT = { columns: 80, rows: 24 }

// Mounts a finished call's row through the plugin on an 80 column terminal.
export const mountRow = ($: Engine, tool: string, props: Partial<RenderPropsOf['ToolUse']> = {}) =>
  $.ui.mount({
    plugin: 'better-tool-rows',
    surface: 'terminal',
    component: 'ToolUse',
    props: { tool_use_id: 'toolu_1', tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false, ...props },
    viewport: VIEWPORT,
  })

// Mounts the result beneath a finished call's row through the plugin.
export const mountResult = ($: Engine, tool: string, props: Partial<RenderPropsOf['ToolResult']> = {}) =>
  $.ui.mount({
    plugin: 'better-tool-rows',
    surface: 'terminal',
    component: 'ToolResult',
    props: { tool_use_id: 'toolu_1', tool, output: undefined, isErrored: false, ...props },
    viewport: VIEWPORT,
  })

// The engine beneath draws each row as the text `draw` makes of its props.
export const stubRow = (on: On, draw: (props: RenderPropsOf['ToolUse']) => string) =>
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{draw(e.props)}</Text>
  })

// The engine beneath draws each result as `text`.
export const stubResult = (on: On, text: string) =>
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{text}</Text>
  })

// The session's project root is `root`.
export const stubRoot = (on: On, root: string) => on('session.root', () => ({ value: root }))
