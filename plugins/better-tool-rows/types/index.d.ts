// Whether a Bash row's fold is open.
export type IsOutputOpen = boolean

// A Bash call's command; null for a call this session did not see made.
export type BashCommand = string | null

// The project root when the session started; null until it is recorded.
export type StartRoot = string | null

declare module 'claude-code' {
  interface PluginState {
    'better-tool-rows': {
      // One per Bash row, by its tool_use_id.
      isOutputOpen: StateFamily<IsOutputOpen>
      // One per Bash call, by its tool_use_id.
      command: StateFamily<BashCommand>
      startRoot: StartRoot
    }
  }
}
