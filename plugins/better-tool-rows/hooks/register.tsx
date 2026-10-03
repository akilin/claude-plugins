import type { Register } from 'claude-code'

import { registerBash } from './bash'
import { registerFiles } from './files'

export const register: Register = (on, options) => {
  registerFiles(on, options)
  registerBash(on, options)
}
