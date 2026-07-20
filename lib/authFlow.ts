// Login is now a two-step handshake: password, then an emailed OTP code. Step 1
// (signInWithPassword) and the signOut() that follows it each emit their own transient
// SIGNED_IN / SIGNED_OUT events — root layout's global auth listener must ignore those,
// or it'll navigate the user into the app before the OTP step ever happens. This flag is
// the signal: true while mid-handshake, flipped false right before the final verifyOtp()
// call so the real SIGNED_IN it produces is handled normally.
let otpPending = false

export function getOtpPending() {
  return otpPending
}

export function setOtpPending(value: boolean) {
  otpPending = value
}
