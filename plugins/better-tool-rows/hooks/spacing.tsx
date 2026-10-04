import type { EngineInterface, Register, SessionMessage, ToolUseSummary } from 'claude-code'

import { countsOf } from './files'

// Whether each tool row, by its tool_use_id, comes straight after a one-line
// row; `isSettled` once that can no longer change. Only that is kept, not the
// call above (whose result can hold a whole file), and kept in the module, so
// a reload works them out again.
const afterOneLine = new Map<string, { isAfterOneLine: boolean; isSettled: boolean }>()

// The read (by its count) a finished row was first missing from, by its
// tool_use_id.
const missedIn = new Map<string, number>()

// The transcript's calls above, read once for every row asking at a time,
// and which read it was.
let reads = 0
let reading: Promise<{ calls: Map<string, ToolUseSummary | null>; read: number }> | undefined
const readCallsAbove = ($: EngineInterface) => {
  reading ??= $.session
    .messages()
    .then(messages => {
      const calls = new Map<string, ToolUseSummary | null>()
      recordCallsAbove(messages, calls)
      return { calls, read: ++reads }
    })
    .finally(() => {
      reading = undefined
    })
  return reading
}

// Records, for every tool call in `messages`, the call drawn straight above
// it. A reply's text breaks a run, and so does a prompt; results (a user
// message carrying tool results, and the reminders beside them) and thinking
// draw nothing between the rows and are passed over. A message with both text
// and calls draws its text first.
export const recordCallsAbove = (messages: SessionMessage[], into: Map<string, ToolUseSummary | null>) => {
  let above: ToolUseSummary | null = null
  for (const message of messages) {
    if (message.role === 'user') {
      if (!message.toolResults?.length) {
        above = null
      }
      continue
    }
    if (message.text.trim() !== '') {
      above = null
    }
    for (const call of message.toolUses) {
      into.set(call.tool_use_id, above)
      above = call
    }
  }
}

// Whether a call's row is one line alone: an Edit or Write drawn with its
// counts, its result drawing nothing. Any other row has lines beneath it.
export const isOneLine = (call: ToolUseSummary) =>
  (call.tool === 'Edit' || call.tool === 'Write') && countsOf(call.isError === true, call.result) !== undefined

// Whether the row comes straight after a one-line row. The transcript is read
// again until the call above has finished, as its result decides; one that
// finishes after this row's last drawing leaves it with its gap, as does a
// row whose transcript cannot be read (a throw would skip every row hook). A
// finished row the transcript does not hold (older than the newest entries it
// returns, or a subagent's) keeps its gap without reading it again once two
// reads have missed it: one alone may have started before its call was added.
const isAfterOneLine = async ($: EngineInterface, id: string, isRunning: boolean) => {
  const known = afterOneLine.get(id)
  if (known?.isSettled) {
    return known.isAfterOneLine
  }
  let found: Awaited<ReturnType<typeof readCallsAbove>>
  try {
    found = await readCallsAbove($)
  } catch {
    return false
  }
  const { calls, read } = found
  for (const [rowId, above] of calls) {
    if (!afterOneLine.get(rowId)?.isSettled) {
      afterOneLine.set(rowId, {
        isAfterOneLine: above !== null && isOneLine(above),
        isSettled: above === null || above.text !== undefined,
      })
    }
  }
  if (afterOneLine.has(id) || isRunning) {
    missedIn.delete(id)
  } else if (missedIn.get(id) === undefined) {
    missedIn.set(id, read)
  } else if (missedIn.get(id) !== read) {
    missedIn.delete(id)
    afterOneLine.set(id, { isAfterOneLine: false, isSettled: true })
  }
  return afterOneLine.get(id)?.isAfterOneLine ?? false
}

export const registerSpacing: Register = on => {
  // The engine opens each tool row with a blank line. A row straight under
  // a one-line Edit or Write is pulled up over it, so a run of edits reads as
  // a list; under text, or a row with lines beneath it (Bash output, Read's
  // `Read 7 lines`), it keeps the gap.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await isAfterOneLine($, e.props.tool_use_id, e.props.isRunning))) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" marginTop={-1}>
        {await next(e)}
      </Box>
    )
  })
}
