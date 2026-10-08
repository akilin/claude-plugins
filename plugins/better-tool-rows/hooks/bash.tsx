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

// A Bash output without the files its command created, deleted or updated in
// its diff, which the engine draws as every line each one has or had, or as
// the hunks it changed, and those files with the lines added and removed, in
// the diff's order. The diff stays, emptied, for the files it left uncounted.
export const withoutFileDiffs = (output: unknown) => {
  const diff = (output as { bashEditDiff?: EditDiff } | null)?.bashEditDiff
  if (typeof output !== 'object' || output === null || !Array.isArray(diff?.files) || diff.files.length === 0) {
    return { output, changedFiles: [] }
  }
  const { bashEditDiff: _, ...rest } = output as { bashEditDiff: EditDiff }
  return {
    output: diff.moreFiles ? { ...output, bashEditDiff: { ...diff, files: [] } } : rest,
    changedFiles: diff.files.map(file => {
      const changed = (file.hunks ?? []).flatMap(hunk => hunk.lines ?? [])
      return {
        path: file.filePath,
        change: file.created === true ? 'Created' : file.deleted === true ? 'Deleted' : 'Updated',
        added: changed.filter(line => line.startsWith('+')).length,
        removed: changed.filter(line => line.startsWith('-')).length,
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
    const { output, changedFiles } = withoutFileDiffs(e.props.output)
    const lines = rowLines(output, await read($, memberOf(commandShapeOf, { requestId: e.props.tool_use_id })), columns)
    const short = { ...withCommand, props: { ...withCommand.props, output: forEngine(output) } }
    const elements = $.ui.resolve(e)
    const { Box, Button, Code, Text } = elements

    // A file the command changed, as `Created lorem.txt +10`,
    // `Deleted lorem.txt -10` or `Updated lorem.txt +1 -1` beneath the row, a
    // side left out when it is zero.
    const root = changedFiles.length > 0 ? ((await read($, startRoot)) ?? (await $.session.root())) : ''
    const changedFileLines = changedFiles.map(file => {
      const sides = [
        { text: `+${file.added}`, color: 'success' as const, isShown: file.added > 0 },
        { text: `-${file.removed}`, color: 'error' as const, isShown: file.removed > 0 },
      ].filter(side => side.isShown)
      return gutterLine(
        elements,
        <Text>
          {file.change} {shortPath(file.path, root)}
          {sides.map(side => (
            <Text key={side.color} color={side.color}>
              {` ${side.text}`}
            </Text>
          ))}
        </Text>,
        `${file.change}:${file.path}`,
      )
    })
    if (!isCut && lines === undefined) {
      return changedFiles.length === 0 ? next(short) : (
        <Box flexDirection="column">
          {await next(short)}
          {changedFileLines}
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
        {changedFileLines}
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
  // does when the files the row says were changed were all the output had,
  // rather than the engine's `Done`; the engine draws the rest without those
  // files, and with the lines carriage returns wrote over as a terminal leaves
  // them.
  on('ui.render', { component: 'ToolResult', props: { tool: 'Bash' } }, async ($, e, next) => {
    const shape = await read($, memberOf(commandShapeOf, { requestId: e.props.tool_use_id }))
    const { output, changedFiles } = withoutFileDiffs(e.props.output)
    const isOnlyChangedFiles =
      changedFiles.length > 0 && isPlain(output) && !('bashEditDiff' in (output as object)) && shellLines(output).length === 0
    return rowLines(output, shape, viewportColumns(e)) === undefined && !isOnlyChangedFiles
      ? next({ ...e, props: { ...e.props, output: forEngine(output) } })
      : drawNothing($.ui.resolve(e))
  })
}
