import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App.jsx'
import './index.css'

const VITE_CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const Root = () => {
  useEffect(() => {
    // Change the title
    document.title = "Bent's Woodworking Assistant"

    // Change the favicon
    const link = document.querySelector("link[rel~='icon']") || document.createElement('link')
    link.type = 'image/png'
    link.rel = 'icon'
    link.href = '/bents-logo.jpg' // Update this path
    document.getElementsByTagName('head')[0].appendChild(link)
  }, [])

  return (
    <StrictMode>
      <ClerkProvider publishableKey={VITE_CLERK_PUBLISHABLE_KEY}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ClerkProvider>
    </StrictMode>
  )
}

createRoot(document.getElementById('root')).render(<Root />)