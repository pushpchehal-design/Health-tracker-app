import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './themes.css'
import './index.css'
import { ThemeProvider } from './context/ThemeProvider'
import App from './App.jsx'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found!')
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)