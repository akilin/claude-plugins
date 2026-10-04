import type { EngineInterface, Register, SessionMessage, ToolUseSummary } from 'claude-code'

import { countsOf } from './files'

// The call drawn straight above each tool row, by its tool_use_id; null for a
// row after text or a prompt. Kept in the module, so a reload works them out
// again.
const callAbove = new Map<string, ToolUseSummary | null>()

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

// Whether the row comes straight after a one-line row. The call above is
// looked up again until it has finished, as its result decides; one that
// finishes after this row's last drawing leaves it with its gap, as does a
// row whose transcript cannot be read (a throw would skip every row hook).
const isAfterOneLine = async ($: EngineInterface, id: string) => {
  const known = callAbove.get(id)
  if (known === undefined || (known !== null && known.text === undefined)) {
    try {
      recordCallsAbove(await $.session.messages(), callAbove)
    } catch {
      return false
    }
  }
  const above = callAbove.get(id)
  return above != null && isOneLine(above)
}

export const registerSpacing: Register = on => {
  // The engine opens each tool row with a blank line. A row straight under
  // a one-line Edit or Write is pulled up over it, so a run of edits reads as
  // a list; under text, or a row with lines beneath it (Bash output, Read's
  // `Read 7 lines`), it keeps the gap.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await isAfterOneLine($, e.props.tool_use_id))) {
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
