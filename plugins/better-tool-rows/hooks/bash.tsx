import { atom, memberOf, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { commandSource, shellLines, shortCommand } from './shell'
import { GROUP_INDENT, ROW_GUTTER, textWidth, toolLabel, viewportColumns, withInput } from './utils'

const isOutputOpen = atom({ plugin: 'better-tool-rows', key: 'isOutputOpen' } as const, false)

// The command each Bash call was made with, for the result beneath its row,
// which is not handed the call's input.
const commandOf = atom({ plugin: 'better-tool-rows', key: 'command' } as const, null)

// The most lines an output shows as the engine draws it; a longer one folds.
export const FOLD_OVER = 5

// The most lines an unfolded output draws; the rest are counted beneath.
export const SHOWN_LINES = 500

// The columns a command has on its row: the line, less `● Bash()` and a
// group's indent.
export const commandRoom = (columns: number) => columns - textWidth(toolLabel('Bash', '')) - GROUP_INDENT

// Whether a Bash output is long enough to fold.
const isLong = (output: unknown) => shellLines(output).length > FOLD_OVER

// Whether a Bash output is one the plugin can draw as the engine would: any
// lines, or `(No output)` for none, but not an interrupted call's, which the
// engine marks.
const isPlain = (output: unknown) => (output as { interrupted?: unknown } | null | undefined)?.interrupted !== true

// Whether a command is cut to fit its row on a surface `columns` wide.
const isCutAt = (command: string, columns: number) => shortCommand(command, commandRoom(columns)).isCut

export const registerBash: Register = on => {
  // Each Bash call's command is kept by its tool_use_id as it is made.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (typeof e.command === 'string') {
      const command = e.command
      await update($, memberOf(commandOf, { requestId: e.tool_use_id }), () => command)
    }
    return next(e)
  })

  // A Bash row's command fits on its line, cut with `…` when it is longer.
  // A finished call whose output is longer than FOLD_OVER lines has it folded
  // behind `▸ 12 lines` beneath its row, the full command first when it was
  // cut (`▸ command, 12 lines`); a cut command with a short output folds the
  // command alone (`▸ command`) and draws the output open beneath the fold,
  // so the command opens above it. Pressing the fold opens it (`▾ ...`) and
  // pressing again folds it. Inside a group the engine draws a call's output
  // in its row and standalone beneath it, so an output drawn here is kept
  // from the engine either way; a short one only when it is plain lines and
  // its call this session saw made, whose result beneath knows its command
  // to draw nothing; `(No output)` for an empty one. An interrupted one the
  // engine draws as usual.
  on('ui.render', { component: 'ToolUse', props: { tool: 'Bash' } }, async ($, e, next) => {
    const input = e.props.input as { command?: unknown } | undefined
    if (typeof input?.command !== 'string') {
      return next(e)
    }
    const command = input.command
    const { text, isCut } = shortCommand(command, commandRoom(viewportColumns(e)))
    const short = withInput(e, { command: text })
    const isFolded = isLong(e.props.output)
    if (e.props.isRunning || (!isCut && !isFolded)) {
      return next(short)
    }
    const isDrawnHere =
      isFolded ||
      (isPlain(e.props.output) &&
        !e.props.isInterrupted &&
        (await read($, memberOf(commandOf, { requestId: e.props.tool_use_id }))) === command)
    const lines = isDrawnHere ? shellLines(e.props.output) : []

    const isOpenRef = memberOf(isOutputOpen, e)
    const isOpen = await read($, isOpenRef)
    const { Box, Button, Code, Text } = $.ui.resolve(e)
    const shown = isOpen || !isFolded ? lines.slice(0, SHOWN_LINES) : []
    const isEmpty = isDrawnHere && lines.length === 0
    const label = [isCut && 'command', isFolded && `${lines.length} lines`].filter(part => part !== false).join(', ')
    return (
      <Box flexDirection="column">
        {await next(isDrawnHere ? { ...short, props: { ...short.props, output: undefined } } : short)}
        <Box>
          <Text dimColor>{ROW_GUTTER}</Text>
          <Button
            key="output"
            plain
            dimColor
            label={`${isOpen ? '▾' : '▸'} ${label}`}
            onPress={() => update($, isOpenRef, was => !was)}
          />
        </Box>
        {(isOpen || shown.length > 0 || isEmpty) && (
          <Box flexDirection="column" paddingLeft={ROW_GUTTER.length}>
            {isOpen && isCut && (
              <Box>
                <Text dimColor>$ </Text>
                <Code source={commandSource(command)} language="bash" />
              </Box>
            )}
            {shown.map((line, i) => (
              <Text key={String(i)} color={e.props.isErrored ? 'error' : undefined}>
                {line === '' ? ' ' : line}
              </Text>
            ))}
            {shown.length > 0 && lines.length > shown.length && (
              <Text dimColor>… +{lines.length - shown.length} lines</Text>
            )}
            {isEmpty && <Text dimColor>(No output)</Text>}
          </Box>
        )}
      </Box>
    )
  })

  // The Bash row above draws a long output folded, and a cut command's short
  // plain one beneath its fold, so the result beneath it draws nothing; any
  // other the engine draws as usual.
  on('ui.render', { component: 'ToolResult', props: { tool: 'Bash' } }, async ($, e, next) => {
    const command = await read($, memberOf(commandOf, { requestId: e.props.tool_use_id }))
    const isDrawnAbove =
      isLong(e.props.output) || (isPlain(e.props.output) && command !== null && isCutAt(command, viewportColumns(e)))
    if (!isDrawnAbove) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
