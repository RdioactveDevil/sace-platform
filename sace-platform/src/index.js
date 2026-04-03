import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Reset browser defaults
const style = document.createElement('style')
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #070c16; -webkit-font-smoothing: antialiased; }
  button { font-family: inherit; }
`
document.head.appendChild(style)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
