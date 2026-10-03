// Whether a Bash row's fold is open.
export type IsOutputOpen = boolean

// The project root when the session started; null until it is recorded.
export type StartRoot = string | null

declare module 'claude-code' {
  interface PluginState {
    'better-tool-rows': {
      // One per Bash row, by its tool_use_id.
      isOutputOpen: StateFamily<IsOutputOpen>
      startRoot: StartRoot
    }
  }
}
