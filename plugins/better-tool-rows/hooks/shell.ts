import { fitWidth, stripControl, textWidth } from './utils'

// What a Bash call printed, both streams (for a call that failed, the text
// the model read), as the lines a Text can draw: no colour codes or other
// control characters, tabs as spaces.
export const shellLines = (output: unknown) => {
  const { stdout, stderr } = (typeof output === 'string' ? { stdout: output } : (output ?? {})) as {
    stdout?: unknown
    stderr?: unknown
  }
  const text = stripControl(
    [stdout, stderr]
      .filter((s): s is string => typeof s === 'string' && s.trim() !== '')
      .map(s => s.replace(/\n+$/, ''))
      .join('\n')
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      .replace(/\t/g, '  '),
    '\n',
  ).replace(/\n+$/, '')
  return text === '' ? [] : text.split('\n')
}

// A command as one row of `room` columns: its lines joined by spaces (a `\`
// continuation's too), cut with `…` past the room; `isCut` when it is no
// longer the command as written.
export const shortCommand = (command: string, room: number) => {
  const flat = stripControl(command.replace(/\s*\\?\n\s*/g, ' ').replace(/\t/g, ' ')).trim()
  const text = textWidth(flat) > room ? `${fitWidth(flat, Math.max(room, 1) - 1).trimEnd()}…` : flat
  return { text, isCut: text !== command.trim() }
}

// A command as a Code can draw it: no control characters but tab and
// newline, within its 10000 characters.
export const commandSource = (command: string) => stripControl(command, '\t\n').replace(/\n+$/, '').slice(0, 10000)
