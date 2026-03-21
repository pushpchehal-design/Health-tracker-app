/** Persisted UI colour theme (matches html[data-theme]). */
export const THEME_STORAGE_KEY = 'ht-theme'

export const DEFAULT_THEME_ID = 'black'

export const THEME_OPTIONS = [
  { id: 'black', label: 'Black' },
  { id: 'white', label: 'White' },
  { id: 'purple', label: 'Purple' },
  { id: 'magenta', label: 'Magenta' },
  { id: 'ocean', label: 'Ocean' },
]

export const THEME_IDS = THEME_OPTIONS.map((t) => t.id)
