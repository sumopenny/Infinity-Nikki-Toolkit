import { createApp } from 'vue'
import App from './App.vue'
import { installErrorReporting } from './utils/errorReporting/install'
import './styles/tokens.css'
import './styles/base.css'
import './styles/dialogs.css'
import './styles/top-bar.css'
import './styles/album.css'
import './styles/album-navigation.css'
import './styles/lightbox.css'
import './styles/outfit.css'
import './styles/controls.css'
import './styles/mobile.css'
import './styles/card-actions.css'

import './styles/scrollbars.css'

const app = createApp(App)
const disposeErrorReporting = installErrorReporting(app)
app.mount('#app')
// PWA standalone installability; network-only worker, never caches user data or API results.
if (import.meta.env.PROD && 'serviceWorker' in navigator)
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Unsupported or blocked service workers must not affect the website.
    })
  })
if (import.meta.hot) import.meta.hot.dispose(disposeErrorReporting)
