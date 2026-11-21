/** Whether the call room offers the tutor a Record button: lessons yes, consultation calls never (the server refuses too). */
export function recordingAllowed(session) {
  return session?.session_type !== 'consultation'
}
