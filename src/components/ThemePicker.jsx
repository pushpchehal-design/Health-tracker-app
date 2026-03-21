import { THEME_OPTIONS } from '../lib/appTheme'
import { useTheme } from '../context/useTheme'
import './ThemePicker.css'

export default function ThemePicker({ className = '' }) {
  const { theme, setTheme } = useTheme()

  return (
    <div className={`theme-picker ${className}`.trim()} role="group" aria-label="Colour theme">
      <span className="theme-picker-label">Theme</span>
      <div className="theme-picker-chips">
        {THEME_OPTIONS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`theme-chip theme-chip-${t.id} ${theme === t.id ? 'theme-chip-active' : ''}`}
            onClick={() => setTheme(t.id)}
            title={t.label}
            aria-pressed={theme === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
