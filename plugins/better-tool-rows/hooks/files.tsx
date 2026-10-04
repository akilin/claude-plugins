import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'

import {
  drawNothing,
  fileUrl,
  fitEnd,
  GROUP_INDENT,
  shortPath,
  textWidth,
  toolLabel,
  viewportColumns,
  withInput,
} from './utils'

// The session's project root when the plugin first started in it: the folder
// Claude Code was started in, which the terminal resolves ctrl+click from.
// Kept in the session's state, so a reload does not take a moved root.
const startRoot = atom({ plugin: 'better-tool-rows', key: 'startRoot' } as const, null)

// The root paths are shown relative to: the one at the start, or the project
// root as it is now while the start is unrecorded.
const rootOf = async ($: EngineInterface) => (await read($, startRoot)) ?? (await $.session.root())

// The render event with its file_path relative to `root`, that path and the
// full one; undefined for an input without one.
const withShortPath = <E extends { props: { input?: unknown } }>(e: E, root: string) => {
  const input = e.props.input as { file_path?: unknown } | undefined
  if (typeof input?.file_path !== 'string') {
    return undefined
  }
  const path = shortPath(input.file_path, root)
  return { e: withInput(e, { file_path: path }), path, full: input.file_path }
}

// A shorter path as withShortPath makes it, cut to its end with `…` when it
// is wider than `room` columns; the link still goes to the full one.
const withPathIn = <S extends { e: { props: { input?: unknown } }; path: string }>(short: S, room: number): S => {
  if (textWidth(short.path) <= room) {
    return short
  }
  const path = `…${fitEnd(short.path, Math.max(room, 1) - 1)}`
  return { ...short, e: withInput(short.e, { file_path: path }), path }
}

// The engine's row with its path linked to the full path, not the shorter one
// it was handed: the same text laid over it as a link, so a terminal opens it
// on ctrl+click wherever it resolves from. Left as it is off the terminal (a
// remote surface links https: alone), for a path drawn in full, and for a
// label too long for the line, whose path wraps out from under the link.
// Laid over the label's line, the row's second (it opens with a blank line),
// not its last: an expanded group's row draws its output beneath it.
const withFullPathLink = (
  $: EngineInterface,
  e: RenderInput<'ToolUse'>,
  row: RenderElement,
  name: string,
  short: { path: string; full: string },
) => {
  if (e.surface !== 'terminal' || short.path === short.full) {
    return row
  }
  if (textWidth(toolLabel(name, short.path)) > viewportColumns(e) - GROUP_INDENT) {
    return row
  }
  const { Box, Link } = $.ui.resolve(e)
  return (
    <Box>
      {row}
      <Box position="absolute" top={1} left={textWidth(toolLabel(name, '')) - 1}>
        <Link href={fileUrl(short.full)}>{short.path}</Link>
      </Box>
    </Box>
  )
}

type Patch = { lines: string[] }[]
type FileChange = {
  type?: 'create' | 'update'
  content?: string
  structuredPatch: Patch
  gitDiff?: { additions: number; deletions: number }
  staged?: boolean
}

// The lines a change added and removed, as `git diff --stat` counts them; a
// new file counts every line it was written with. A change whose patch is
// empty (its diff took too long, or the file was too large) counts from its
// git diff where it has one.
export const changeCounts = (output: FileChange) => {
  if (output.type === 'create') {
    return { added: output.content ? output.content.replace(/\n$/, '').split('\n').length : 0, removed: 0 }
  }
  if (output.structuredPatch.length === 0 && output.gitDiff) {
    return { added: output.gitDiff.additions, removed: output.gitDiff.deletions }
  }

  const changed = output.structuredPatch.flatMap(hunk => hunk.lines)
  return {
    added: changed.filter(line => line.startsWith('+')).length,
    removed: changed.filter(line => line.startsWith('-')).length,
  }
}

// The counts a finished, successful Edit or Write shows; undefined for any
// other result, and for one held for review instead of written, which the
// engine then draws as usual.
export const countsOf = (isErrored: boolean, output: unknown) => {
  const change = output as FileChange | undefined
  if (isErrored || !change || !Array.isArray(change.structuredPatch) || change.staged) {
    return undefined
  }

  const counts = changeCounts(change)
  return counts.added === 0 && counts.removed === 0 ? undefined : counts
}

// The name the engine draws an Edit or Write row under: `Update`, `Create`
// for an Edit with nothing to replace, or `Write`.
const rowName = (tool: string, input: { old_string?: unknown }) =>
  tool === 'Write' ? 'Write' : input.old_string === '' ? 'Create' : 'Update'

// The text the engine draws for an Edit or Write row: its status dot, then
// `Update(potato.md)`.
export const rowLabel = (tool: string, input: { old_string?: unknown }, path: string) =>
  toolLabel(rowName(tool, input), path)

export const registerFiles: Register = on => {
  // `/cd` or a worktree move later moves the project root, but not the
  // terminal, so the root at the start is the one paths stay relative to.
  on('session.start', async ($, e, next) => {
    if ((await read($, startRoot)) === null) {
      const root = await $.session.root()
      await update($, startRoot, () => root)
    }
    return next(e)
  })

  // The engine draws its own Read row; it is only handed the shorter path.
  on('ui.render', { component: 'ToolUse', props: { tool: 'Read' } }, async ($, e, next) => {
    const short = withShortPath(e, await rootOf($))
    return short ? withFullPathLink($, e, await next(short.e), 'Read', short) : next(e)
  })

  for (const tool of ['Edit', 'Write']) {
    on('ui.render', { component: 'ToolUse', props: { tool } }, async ($, e, next) => {
      // As a Read row, then the counts.
      const short = withShortPath(e, await rootOf($))
      if (!short) {
        return next(e)
      }
      const name = rowName(tool, e.props.input as { old_string?: unknown })
      const counts = countsOf(e.props.isErrored, e.props.output)
      if (!counts) {
        return withFullPathLink($, e, await next(short.e), name, short)
      }

      // `Update(potato.md) +1 -1`, a side left out when it is zero. The
      // engine's row is as wide as the line and opens with a blank line, so the
      // counts are laid over its second line, 1 column past the end of its
      // text: the label's, as for the link, not an expanded group's output.
      // The row stays one line, as the spacing above the next row takes it:
      // a path too long for the line (less a group's indent) with the counts
      // beside it is cut to its end.
      const { Box, Text } = $.ui.resolve(e)
      const sides = [
        { text: `+${counts.added}`, color: 'success' as const, isShown: counts.added > 0 },
        { text: `-${counts.removed}`, color: 'error' as const, isShown: counts.removed > 0 },
      ].filter(side => side.isShown)
      const countsText = (
        <Text>
          {sides.flatMap((side, i) => [
            i > 0 && ' ',
            <Text key={side.color} color={side.color}>
              {side.text}
            </Text>,
          ])}
        </Text>
      )
      const countsWidth = textWidth(sides.map(side => side.text).join(' '))
      const room = viewportColumns(e) - GROUP_INDENT - textWidth(toolLabel(name, '')) - 1 - countsWidth
      const cut = withPathIn(short, room)
      return (
        <Box>
          {withFullPathLink($, e, await next(cut.e), name, cut)}
          <Box position="absolute" top={1} left={textWidth(toolLabel(name, cut.path)) + 1}>
            {countsText}
          </Box>
        </Box>
      )
    })

    // The counts are on the row, so the result beneath it draws nothing.
    on('ui.render', { component: 'ToolResult', props: { tool } }, ($, e, next) => {
      return countsOf(e.props.isErrored, e.props.output) ? drawNothing($.ui.resolve(e)) : next(e)
    })
  }
}
