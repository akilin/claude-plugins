import { atom, memberOf, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { commandSource, shellLines, shortCommand } from './shell'
import { GROUP_INDENT, ROW_GUTTER, textWidth, toolLabel, viewportColumns, withInput } from './utils'

const isOutputOpen = atom({ plugin: 'better-tool-rows', key: 'isOutputOpen' } as const, false)

// The most lines an output shows as the engine draws it; a longer one folds.
export const FOLD_OVER = 5

// The most lines an unfolded output draws; the rest are counted beneath.
export const SHOWN_LINES = 500

// The columns a command has on its row: the line, less `● Bash()` and a
// group's indent.
export const commandRoom = (columns: number) => columns - textWidth(toolLabel('Bash', '')) - GROUP_INDENT

// Whether a Bash output is long enough to fold.
const isLong = (output: unknown) => shellLines(output).length > FOLD_OVER

export const registerBash: Register = on => {
  // A Bash row's command fits on its line, cut with `…` when it is longer.
  // A finished call whose output is longer than FOLD_OVER lines has it folded
  // behind `▸ 12 lines` beneath its row, the full command first when it was
  // cut (`▸ command, 12 lines`); a cut command with a short output keeps its
  // output as the engine draws it and folds the command alone (`▸ command`).
  // Pressing the fold opens it (`▾ ...`) and pressing again folds it. Inside a
  // group the engine draws a call's output in its row and standalone beneath
  // it, so a long output is kept from the engine either way and drawn here.
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
    const lines = isFolded ? shellLines(e.props.output) : []

    const isOpenRef = memberOf(isOutputOpen, e)
    const isOpen = await read($, isOpenRef)
    const { Box, Button, Code, Text } = $.ui.resolve(e)
    const shown = isOpen ? lines.slice(0, SHOWN_LINES) : []
    const label = [isCut && 'command', isFolded && `${lines.length} lines`].filter(part => part !== false).join(', ')
    return (
      <Box flexDirection="column">
        {await next(isFolded ? { ...short, props: { ...short.props, output: undefined } } : short)}
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
        {isOpen && (
          <Box flexDirection="column" paddingLeft={ROW_GUTTER.length}>
            {isCut && (
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
            {lines.length > shown.length && <Text dimColor>… +{lines.length - shown.length} lines</Text>}
          </Box>
        )}
      </Box>
    )
  })

  // The Bash row above draws a long output folded, so the result beneath it
  // draws nothing; a short one the engine draws as usual.
  on('ui.render', { component: 'ToolResult', props: { tool: 'Bash' } }, ($, e, next) => {
    if (!isLong(e.props.output)) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
