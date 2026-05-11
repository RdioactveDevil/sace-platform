/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** tldraw commercial/trial license — required for production (embedded at build time). */
  readonly VITE_TLDRAW_LICENSE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
