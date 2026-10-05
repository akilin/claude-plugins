import { atom, memberOf, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { commandShape, commandSource, isShapeCut, shellLines, shortCommand, withOverwrites } from './shell'
import type { CommandShape } from './shell'
import {
  drawNothing,
  GROUP_INDENT,
  gutterLine,
  ROW_GUTTER,
  shortPath,
  textWidth,
  toolLabel,
  viewportColumns,
  withInput,
} from './utils'

const isOutputOpen = atom({ plugin: 'better-tool-rows', key: 'isOutputOpen' } as const, false)

// The shape of the command each Bash call was made with, for the result
// beneath its row, which is not handed the call's input. The shape, not the
// command, so a session's heredocs are not all kept.
const commandShapeOf = atom({ plugin: 'better-tool-rows', key: 'commandShape' } as const, null)

// The project root paths are shown relative to, as files.tsx records it. Not
// imported from there: the engine only reads state through an atom declared
// in the reading file, and does not follow `$` into an imported function.
const startRoot = atom({ plugin: 'better-tool-rows', key: 'startRoot' } as const, null)

// The most lines an output shows as the engine draws it; a longer one folds.
export const FOLD_OVER = 5

// The most lines an unfolded output draws; the rest are counted beneath.
export const SHOWN_LINES = 500

// The columns a command has on its row: the line, less `● Bash()` and a
// group's indent.
export const commandRoom = (columns: number) => columns - textWidth(toolLabel('Bash', '')) - GROUP_INDENT

// Whether a Bash output is one the plugin can draw as the engine would: a
// finished command's lines, or the text a failed or interrupted call read.
// Not an interrupted command's, a backgrounded one's, an image, or one whose
// full output was saved to a file: the engine marks each of those.
const isPlain = (output: unknown) => {
  if (typeof output === 'string') {
    return true
  }
  if (typeof output !== 'object' || output === null) {
    return false
  }
  const result = output as { interrupted?: unknown; isImage?: unknown; backgroundTaskId?: unknown; persistedOutputPath?: unknown }
  return (
    result.interrupted !== true &&
    !result.isImage &&
    result.backgroundTaskId === undefined &&
    result.persistedOutputPath === undefined
  )
}

// A Bash output as the engine is handed it: a plain one with the lines
// carriage returns wrote over as a terminal leaves them, any other as it is.
const forEngine = (output: unknown) => (isPlain(output) ? withOverwrites(output) : output)

// The lines of a finished Bash call's output that its row draws beneath its
// fold, the result beneath it then drawing nothing; undefined for an output
// left to the engine. The row and the result both decide by this, from what
// both are handed, so an output is never drawn twice or not at all:
// - a long plain output is always drawn on the row, folded;
// - a short plain one is when the command, as this session saw the call
//   made, is cut: the row folds the command above it. The engine draws a
//   group's output in its row and a standalone row's as its result, so only
//   a result that knows its command can tell to draw nothing;
// - any other is the engine's.
const rowLines = (output: unknown, shape: CommandShape | null, columns: number) => {
  if (!isPlain(output)) {
    return undefined
  }
  const lines = shellLines(output)
  const isCut = shape !== null && isShapeCut(shape, commandRoom(columns))
  return lines.length > FOLD_OVER || isCut ? lines : undefined
}

type EditDiff = {
  files: { filePath: string; hunks?: { lines?: string[] }[]; created?: true; deleted?: true }[]
  moreFiles?: number
}

// A Bash output without the files its command created or deleted in its diff,
// which the engine draws as every line each one has or had, and those files
// with that count of lines, in the diff's order. The diff goes with them when
// nothing else is left in it.
export const withoutWholeFiles = (output: unknown) => {
  const diff = (output as { bashEditDiff?: EditDiff } | null)?.bashEditDiff
  const isWhole = (file: EditDiff['files'][number]) => file.created === true || file.deleted === true
  if (typeof output !== 'object' || output === null || !Array.isArray(diff?.files) || !diff.files.some(isWhole)) {
    return { output, wholeFiles: [] }
  }
  const kept = diff.files.filter(file => !isWhole(file))
  const { bashEditDiff: _, ...rest } = output as { bashEditDiff: EditDiff }
  return {
    output: kept.length === 0 && !diff.moreFiles ? rest : { ...output, bashEditDiff: { ...diff, files: kept } },
    wholeFiles: diff.files.filter(isWhole).map(file => {
      const sign = file.deleted ? '-' : '+'
      return {
        path: file.filePath,
        isDeleted: file.deleted === true,
        lines: (file.hunks ?? []).flatMap(hunk => hunk.lines ?? []).filter(line => line.startsWith(sign)).length,
      }
    }),
  }
}

export const registerBash: Register = on => {
  // Each Bash call's command shape is kept by its tool_use_id as it is made.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (typeof e.command === 'string') {
      const shape = commandShape(e.command)
      await update($, memberOf(commandShapeOf, { requestId: e.tool_use_id }), () => shape)
    }
    return next(e)
  })

  // A Bash row's command fits on its line, cut with `…` when it is longer.
  // Beneath the row of a finished call, a fold:
  // - `▸ 12 lines` over a long output;
  // - `▸ command, 12 lines` over a long output of a cut command, the full
  //   command drawn first when it opens;
  // - `▸ command` for a cut command with a short output, the output drawn
  //   open beneath the fold (`(No output)` for none) when the row draws it,
  //   and the full command opening above it.
  // Pressing the fold opens it (`▾ ...`) and pressing again folds it.
  on('ui.render', { component: 'ToolUse', props: { tool: 'Bash' } }, async ($, e, next) => {
    const input = e.props.input as { command?: unknown } | undefined
    if (typeof input?.command !== 'string') {
      return next(e)
    }
    const command = input.command
    const columns = viewportColumns(e)
    const { text, isCut } = shortCommand(command, commandRoom(columns))
    const withCommand = withInput(e, { command: text })
    if (e.props.isRunning) {
      return next(withCommand)
    }
    const { output, wholeFiles } = withoutWholeFiles(e.props.output)
    const lines = rowLines(output, await read($, memberOf(commandShapeOf, { requestId: e.props.tool_use_id })), columns)
    const short = { ...withCommand, props: { ...withCommand.props, output: forEngine(output) } }
    const elements = $.ui.resolve(e)
    const { Box, Button, Code, Text } = elements

    // A file the command created or deleted, as `Created lorem.txt +10` or
    // `Deleted lorem.txt -10` beneath the row.
    const root = wholeFiles.length > 0 ? ((await read($, startRoot)) ?? (await $.session.root())) : ''
    const wholeFileLines = wholeFiles.map(file =>
      gutterLine(
        elements,
        <Text>
          {file.isDeleted ? 'Deleted' : 'Created'} {shortPath(file.path, root)}
          {file.lines > 0 && (
            <Text color={file.isDeleted ? 'error' : 'success'}>
              {` ${file.isDeleted ? '-' : '+'}${file.lines}`}
            </Text>
          )}
        </Text>,
        `${file.isDeleted ? 'deleted' : 'created'}:${file.path}`,
      ),
    )
    if (!isCut && lines === undefined) {
      return wholeFiles.length === 0 ? next(short) : (
        <Box flexDirection="column">
          {await next(short)}
          {wholeFileLines}
        </Box>
      )
    }

    const isOpenRef = memberOf(isOutputOpen, e)
    const isOpen = await read($, isOpenRef)
    const lineCount = lines?.length ?? 0
    const isFolded = lineCount > FOLD_OVER
    const shown = lines === undefined || (isFolded && !isOpen) ? [] : lines.slice(0, SHOWN_LINES)
    const hiddenCount = shown.length > 0 ? lineCount - shown.length : 0
    const isEmpty = lines?.length === 0
    // No fold over a short output of a command that fits its row, which the
    // row draws when a plugin above made the call with a longer command.
    const hasFold = isCut || isFolded
    const label = isFolded ? `${isCut ? 'command, ' : ''}${lineCount} lines` : 'command'
    return (
      <Box flexDirection="column">
        {await next(lines === undefined ? short : { ...short, props: { ...short.props, output: undefined } })}
        {wholeFileLines}
        {hasFold &&
          gutterLine(
            elements,
            <Button
              key="output"
              plain
              dimColor
              label={`${isOpen ? '▾' : '▸'} ${label}`}
              onPress={() => update($, isOpenRef, was => !was)}
            />,
          )}
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
            {hiddenCount > 0 && <Text dimColor>… +{hiddenCount} lines</Text>}
            {isEmpty && <Text dimColor>(No output)</Text>}
          </Box>
        )}
      </Box>
    )
  })

  // The output a Bash row draws, its result draws nothing in place of, as it
  // does when the files the row says were created or deleted were all the
  // output had, rather than the engine's `Done`; the engine draws the rest
  // without those files, and with the lines carriage returns wrote over as a
  // terminal leaves them.
  on('ui.render', { component: 'ToolResult', props: { tool: 'Bash' } }, async ($, e, next) => {
    const shape = await read($, memberOf(commandShapeOf, { requestId: e.props.tool_use_id }))
    const { output, wholeFiles } = withoutWholeFiles(e.props.output)
    const isOnlyWholeFiles =
      wholeFiles.length > 0 && isPlain(output) && !('bashEditDiff' in (output as object)) && shellLines(output).length === 0
    return rowLines(output, shape, viewportColumns(e)) === undefined && !isOnlyWholeFiles
      ? next({ ...e, props: { ...e.props, output: forEngine(output) } })
      : drawNothing($.ui.resolve(e))
  })
}
