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
// characters, and the emoji drawn as pictures by default. The widths here are
// kept the same as better-tool-rows' hooks/utils.tsx, which a plugin cannot
// import from.
const WIDE: [number, number][] = [
  [0x1100, 0x115f],
  [0x231a, 0x231b],
  [0x23e9, 0x23ec],
  [0x23f0, 0x23f0],
  [0x23f3, 0x23f3],
  [0x25fd, 0x25fe],
  [0x2614, 0x2615],
  [0x2648, 0x2653],
  [0x267f, 0x267f],
  [0x2693, 0x2693],
  [0x26a1, 0x26a1],
  [0x26aa, 0x26ab],
  [0x26bd, 0x26be],
  [0x26c4, 0x26c5],
  [0x26ce, 0x26ce],
  [0x26d4, 0x26d4],
  [0x26ea, 0x26ea],
  [0x26f2, 0x26f3],
  [0x26f5, 0x26f5],
  [0x26fa, 0x26fa],
  [0x26fd, 0x26fd],
  [0x2705, 0x2705],
  [0x270a, 0x270b],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x2e80, 0x303e],
  [0x3040, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f004, 0x1f004],
  [0x1f0cf, 0x1f0cf],
  [0x1f18e, 0x1f18e],
  [0x1f191, 0x1f19a],
  [0x1f200, 0x1f202],
  [0x1f210, 0x1f23b],
  [0x1f240, 0x1f248],
  [0x1f250, 0x1f251],
  [0x1f260, 0x1f265],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
]

const ZWJ = '\u200d'
const EMOJI_STYLE = '\ufe0f'

// The columns a character takes on a terminal on its own: 0 for a combining
// mark, joiner or variation selector, 2 for a wide one, 1 otherwise.
const charWidth = (char: string) => {
  if (/^[\p{Mn}\p{Me}\u200b-\u200d\ufe00-\ufe0f]$/u.test(char)) {
    return 0
  }
  const c = char.codePointAt(0) ?? 0
  return WIDE.some(([from, to]) => c >= from && c <= to) ? 2 : 1
}

// Each character of `text` with the columns it adds on a terminal: a
// character joined on by a ZWJ adds none (a family emoji is one picture), and
// an emoji selector widens a narrow character it follows to 2 (a heart
// followed by U+FE0F).
const charWidths = function* (text: string): Generator<[string, number]> {
  let previous = ''
  let clusterWidth = 0
  for (const char of text) {
    const width =
      previous === ZWJ ? 0 : char === EMOJI_STYLE ? (clusterWidth === 1 ? 1 : 0) : charWidth(char)
    clusterWidth = previous === ZWJ || char === EMOJI_STYLE || width === 0 ? clusterWidth + width : width
    previous = char
    yield [char, width]
  }
}

// The columns a line takes on a terminal.
export const textWidth = (text: string) => {
  let width = 0
  for (const [, charColumns] of charWidths(text)) {
    width += charColumns
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

// A paste reaches the model wrapped as `<pasted_content id="…">` …
// `</pasted_content id="…">`, with tags of that name inside it escaped as
// `<\pasted_content` and `<\/pasted_content`.
const PASTE = /<pasted_content id="([^"]*)">\n?([\s\S]*?)\n?<\/pasted_content id="\1">/g
const ESCAPED_TAG = /<\\(\\*\/?pasted_content\b)/g

// The prompt as the person pasted it: each paste's wrapper dropped and the
// tags inside it unescaped once.
export const unwrapPastes = (text: string) =>
  text.replace(PASTE, (_, _id, body: string) => body.replace(ESCAPED_TAG, '<$1'))

export const register: Register = on => {
  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    const text = unwrapPastes(e.props.text.replace(/\r\n?/g, '\n')).replace(/\s+$/, '')
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
