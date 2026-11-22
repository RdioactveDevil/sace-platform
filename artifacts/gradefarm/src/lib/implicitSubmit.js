// True when an Enter keypress would trigger the browser's implicit form submission
// (text-like inputs, checkboxes, selects). Buttons and textareas keep their own Enter behaviour.
export function blocksImplicitSubmit(e) {
  if (e.key !== 'Enter') return false
  const { tagName, type } = e.target || {}
  if (tagName === 'SELECT') return true
  if (tagName !== 'INPUT') return false
  return type !== 'submit' && type !== 'button' && type !== 'reset'
}
