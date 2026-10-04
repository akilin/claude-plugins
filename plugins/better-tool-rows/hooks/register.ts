import type { Register } from 'claude-code'

import { registerBash } from './bash'
import { registerFiles } from './files'
import { registerSpacing } from './spacing'

export const register: Register = (on, options) => {
  registerSpacing(on, options)
  registerFiles(on, options)
  registerBash(on, options)
}
