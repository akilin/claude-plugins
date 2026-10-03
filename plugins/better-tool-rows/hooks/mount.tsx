import type { RenderPropsOf } from 'claude-code'
import type { Engine } from 'claude-code/testing'

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
