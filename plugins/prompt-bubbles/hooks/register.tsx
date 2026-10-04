import type { Register } from 'claude-code'

// The share of the transcript's width a bubble may take, so even a long
// prompt leaves a gap on the left and reads as right-aligned.
const MAX_SHARE = 0.75
// Columns the border and padding add around the text: `│ ` and ` │`.
const FRAME = 4
// The bubble's border color: cornflower.
const BORDER = '#6495ed'

// Rows the person wrote; notifications, peers' and teammates' messages keep
// the engine's drawing.
const OWN_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

// Code points a terminal draws 2 columns wide: East Asian wide and fullwidth
// characters, and emoji.
const WIDE = /[ᄀ-ᅟ⺀-〾぀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u
const ZERO = /[\p{Mn}\p{Me}​-‍︀-️]/u

// The columns a line takes on a terminal.
export const textWidth = (text: string) => {
  let width = 0
  for (const char of text) {
    width += ZERO.test(char) ? 0 : WIDE.test(char) ? 2 : 1
  }
  return width
}

// How wide the bubble for `text` is in a transcript `columns` wide: its
// longest line plus the frame, at most MAX_SHARE of the width.
export const bubbleWidth = (text: string, columns: number) => {
  const longest = Math.max(0, ...text.split('\n').map(textWidth))
  const most = Math.max(FRAME + 1, Math.floor(columns * MAX_SHARE))
  return Math.min(longest + FRAME, most)
}

export const register: Register = on => {
  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    const text = e.props.text.replace(/\s+$/, '')
    if (e.surface !== 'terminal' || !OWN_ORIGINS.has(e.props.origin.kind) || text === '') {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const columns = e.viewport?.columns ?? 80

    return (
      <Box width="100%" justifyContent="flex-end" marginTop={1}>
        <Box key="bubble" width={bubbleWidth(text, columns)} borderStyle="round" borderColor={BORDER} paddingX={1}>
          <Text wrap="wrap">{text}</Text>
        </Box>
      </Box>
    )
  })
}
