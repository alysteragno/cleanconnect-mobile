// Tiny external store so the privacy-policy screen can signal back to the still-mounted
// register screen without navigating to a fresh instance of it (which would reset form state).
type Listener = () => void

let accepted = false
const listeners = new Set<Listener>()

export function getPrivacyAccepted() {
  return accepted
}

export function setPrivacyAccepted(value: boolean) {
  accepted = value
  listeners.forEach(l => l())
}

export function subscribePrivacyAccepted(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
