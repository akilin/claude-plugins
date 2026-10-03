import type { EngineInterface, RenderNode } from 'claude-code'

// How the engine lays out a tool row, which no API reports: `● Name(arg)`,
// up to GROUP_INDENT columns further in inside a group, and a result line
// beneath it opening with ROW_GUTTER.
export const toolLabel = (name: string, arg: string) => `● ${name}(${arg})`
export const GROUP_INDENT = 6
export const ROW_GUTTER = '  ⎿  '

// The elements a surface draws with, as `$.ui.resolve(e)` hands them out.
type Elements = ReturnType<EngineInterface['ui']['resolve']>

// A line beneath a tool row, opening with its gutter.
export const gutterLine = ({ Box, Text }: Elements, content: RenderNode) => (
  <Box>
    <Text dimColor>{ROW_GUTTER}</Text>
    {content}
  </Box>
)

// What a hook draws in place of a result its row already shows.
export const drawNothing = ({ Box }: Elements) => <Box />

// The surface's width in columns, 80 where it has not been measured.
export const viewportColumns = (e: { viewport?: { columns: number } }) => e.viewport?.columns ?? 80

// The columns a character takes on a terminal: 0 for a combining mark or
// joiner, 2 for a wide one (East Asian, emoji), 1 otherwise.
const charWidth = (char: string) => {
  if (/^[\p{Mn}\p{Me}​-‍︀-️]$/u.test(char)) {
    return 0
  }
  const c = char.codePointAt(0) ?? 0
  const isWide =
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf && c !== 0x303f) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe4f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) ||
    (c >= 0x1f300 && c <= 0x1faff) ||
    (c >= 0x20000 && c <= 0x3fffd)
  return isWide ? 2 : 1
}

// The columns a string takes on a terminal.
export const textWidth = (text: string) => [...text].reduce((sum, char) => sum + charWidth(char), 0)

// The longest start of `text` that fits in `room` columns.
export const fitWidth = (text: string, room: number) => {
  let width = 0
  let fit = ''
  for (const char of text) {
    width += charWidth(char)
    if (width > room) {
      break
    }
    fit += char
  }
  return fit
}

// `text` without control characters, but for those in `keep`.
export const stripControl = (text: string, keep = '') =>
  text.replace(/[\x00-\x1f\x7f]/g, char => (keep.includes(char) ? char : ''))

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
