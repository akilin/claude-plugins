import type { EngineInterface, RenderNode } from 'claude-code'

// How the engine lays out a tool row, which no API reports: `● Name(arg)`,
// up to GROUP_INDENT columns further in inside a group, and a result line
// beneath it opening with ROW_GUTTER.
export const toolLabel = (name: string, arg: string) => `● ${name}(${arg})`
export const GROUP_INDENT = 6
export const ROW_GUTTER = '  ⎿  '

// The elements a surface draws with, as `$.ui.resolve(e)` hands them out.
type Elements = ReturnType<EngineInterface['ui']['resolve']>

// A line beneath a tool row, opening with its gutter; `key` for one in a list.
export const gutterLine = ({ Box, Text }: Elements, content: RenderNode, key?: string) => (
  <Box key={key}>
    <Text dimColor>{ROW_GUTTER}</Text>
    {content}
  </Box>
)

// What a hook draws in place of a result its row already shows.
export const drawNothing = ({ Box }: Elements) => <Box />

// The surface's width in columns, 80 where it has not been measured.
export const viewportColumns = (e: { viewport?: { columns: number } }) => e.viewport?.columns ?? 80

// Code points a terminal draws 2 columns wide: East Asian wide and fullwidth
// characters, and the emoji drawn as pictures by default.
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

// The columns a string takes on a terminal.
export const textWidth = (text: string) => {
  let width = 0
  for (const [, charColumns] of charWidths(text)) {
    width += charColumns
  }
  return width
}

// The longest start of `text` that fits in `room` columns.
export const fitWidth = (text: string, room: number) => {
  let width = 0
  let fit = ''
  for (const [char, charColumns] of charWidths(text)) {
    width += charColumns
    if (width > room) {
      break
    }
    fit += char
  }
  return fit
}

// `text` without control characters (C0, DEL, C1, and the bidi overrides and
// isolates that would make it read in another order), but for those in `keep`.
export const stripControl = (text: string, keep = '') =>
  text.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, char => (keep.includes(char) ? char : ''))

// Relative to `root`, so the terminal (started there) can still resolve it
// and open it on ctrl+click; a file outside it keeps its full path. Under a
// Windows root either separator matches and case is ignored.
export const shortPath = (path: string, root: string) => {
  const dir = /[\\/]$/.test(root) ? root : `${root}/`
  const head = path.slice(0, dir.length)
  const isWindows = /^([A-Za-z]:[\\/]|\\\\)/.test(root)
  const fold = (s: string) => s.replace(/\\/g, '/').toLowerCase()
  const isInside = isWindows ? fold(head) === fold(dir) : head === dir
  return isInside ? path.slice(dir.length) : path
}

// The render event with some of the tool call's input replaced, for the
// engine to draw the row with.
export const withInput = <E extends { props: { input?: unknown } }>(e: E, input: object): E => ({
  ...e,
  props: { ...e.props, input: { ...(e.props.input as object), ...input } },
})
