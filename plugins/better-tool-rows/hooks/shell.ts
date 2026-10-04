import { fitWidth, stripControl, textWidth } from './utils'

// Terminal escape sequences: CSI (colours, cursor moves), the strings (OSC
// titles and hyperlinks, DCS, SOS, PM, APC) up to their BEL or ST, and the
// short ones (charset switches and the like); CSI and the strings in their
// 8-bit forms too.
const ESCAPE =
  /(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]|(?:\x1b[P\]X^_]|[\x90\x98\x9d\x9e\x9f])[^\x07\x1b\x9c\n]*(?:\x07|\x9c|\x1b\\)?|\x1b[ -/]*[0-~]/g

// A line as a terminal leaves it: each carriage return goes back to its
// start and the text after it writes over what was there (a progress bar's
// last state; a CRLF's line unchanged). Counted in characters, so an emoji
// is never cut in half.
const overwrite = (line: string) =>
  line.split('\r').reduce((shown, part) => part + [...shown].slice([...part].length).join(''), '')

// What a Bash call printed, both streams (for a call that failed, the text
// the model read), as the lines a Text can draw: no escape sequences or other
// control characters, tabs as spaces, no trailing blank lines.
export const shellLines = (output: unknown) => {
  const { stdout, stderr } = (typeof output === 'string' ? { stdout: output } : (output ?? {})) as {
    stdout?: unknown
    stderr?: unknown
  }
  const lines = [stdout, stderr]
    .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
    .map(s => s.replace(/\n+$/, ''))
    .join('\n')
    .replace(ESCAPE, '')
    .split('\n')
    .map(line => stripControl(overwrite(line).replace(/\t/g, '  ')))
  while (lines.at(-1) === '') {
    lines.pop()
  }
  return lines
}

// A Bash output as the engine is handed it to draw: a stream with a carriage
// return outside a CRLF, which the engine would drop and so join what it
// wrote over, as the lines a terminal leaves. An output with no such stream
// is handed on as it is.
export const withOverwrites = (output: unknown) => {
  if (typeof output !== 'object' || output === null) {
    return output
  }
  const isOverwritten = (s: unknown): s is string => typeof s === 'string' && /\r(?!\n)/.test(s)
  const settled = Object.fromEntries(
    (['stdout', 'stderr'] as const)
      .map(stream => [stream, (output as Record<string, unknown>)[stream]] as const)
      .filter(([, s]) => isOverwritten(s))
      .map(([stream, s]) => [stream, shellLines(s as string).join('\n')]),
  )
  return Object.keys(settled).length === 0 ? output : { ...output, ...settled }
}

// A command's lines joined by spaces, as one row draws it.
const flatCommand = (command: string) =>
  stripControl(command.replace(/\s*\\?\r?\n\s*/g, ' ').replace(/\t/g, ' ')).trim()

// A command as one row of `room` columns: its lines joined by spaces (a `\`
// continuation's too, CRLF or not), cut with `…` past the room; `isCut` when
// it is no longer the command as written.
export const shortCommand = (command: string, room: number) => {
  const flat = flatCommand(command)
  const text = textWidth(flat) > room ? `${fitWidth(flat, Math.max(room, 1) - 1).trimEnd()}…` : flat
  return { text, isCut: text !== command.trim() }
}

// What decides whether shortCommand cuts a command at any room, kept in place
// of the command itself (which can hold a whole heredoc): the columns it takes
// on one row, and whether putting it on one row already changed it.
export type CommandShape = { width: number; isReshaped: boolean }
export const commandShape = (command: string): CommandShape => {
  const flat = flatCommand(command)
  return { width: textWidth(flat), isReshaped: flat !== command.trim() }
}

// Whether shortCommand cuts a command of `shape` in `room` columns.
export const isShapeCut = (shape: CommandShape, room: number) => shape.isReshaped || shape.width > room

// A command as a Code can draw it: no control characters but tab and
// newline, within its 10000 characters, not cut inside a surrogate pair.
export const commandSource = (command: string) =>
  stripControl(command, '\t\n')
    .replace(/\n+$/, '')
    .slice(0, 10000)
    .replace(/[\ud800-\udbff]$/, '')
