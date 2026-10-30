// The signed-in app is drawn 10% larger on wide screens, the same as viewing
// it at 110% browser zoom; the original sizes read small on laptops and
// desktops. AppShell applies it with CSS `zoom`, so anything inside the shell
// that works in raw viewport pixels (pointer positions, window.innerWidth, vh)
// divides by appZoom() to get back to the shell's own CSS pixels.
export const DESKTOP_ZOOM = 1.1
// Below this width there isn't room to spare, so the app stays at 100%.
export const ZOOM_MIN_WIDTH = 1280

export function appZoom() {
  return typeof window !== 'undefined' && window.innerWidth >= ZOOM_MIN_WIDTH ? DESKTOP_ZOOM : 1
}
