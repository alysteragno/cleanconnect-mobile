// Defense-in-depth input handling for user-entered text fields.
//
// Supabase's JS client sends parameterized PostgREST/GoTrue requests — it never
// concatenates raw SQL — so classic SQL injection isn't actually exploitable through
// it. Even so, we reject HTML/script-like input and SQL metacharacters up front so
// that data like `<b>Alyster</b>` never reaches the database or gets rendered
// unsafely somewhere downstream (e.g. the web admin dashboard).

const HTML_TAG_PATTERN = /<[^>]*>/
const ANGLE_BRACKET_PATTERN = /[<>]/
// Deliberately excludes the apostrophe ' — it's a legitimate name character (O'Brien,
// D'Souza) and isn't exploitable through Supabase's parameterized client anyway.
const SQL_METACHARACTER_PATTERN = /["`;]|--|\/\*|\*\//
const FULL_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/** Strips HTML tags and stray angle brackets, then trims. Apply right before sending to Supabase. */
export function sanitizeText(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim()
}

/** Returns an error message if the full name is unsafe/invalid, otherwise null. */
export function validateFullName(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Full name is required.'
  if (HTML_TAG_PATTERN.test(trimmed)) return 'Full name cannot contain HTML tags.'
  if (SQL_METACHARACTER_PATTERN.test(trimmed)) return "Full name cannot contain quotes, semicolons, or comment markers."
  if (!FULL_NAME_PATTERN.test(trimmed)) return 'Full name can only contain letters, spaces, apostrophes, periods, and hyphens.'
  if (trimmed.length > 80) return 'Full name is too long (max 80 characters).'
  return null
}

/** Returns an error message if the email is unsafe/invalid, otherwise null. */
export function validateEmail(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Email is required.'
  if (HTML_TAG_PATTERN.test(trimmed) || ANGLE_BRACKET_PATTERN.test(trimmed)) return 'Email cannot contain HTML tags.'
  if (!EMAIL_PATTERN.test(trimmed)) return 'Enter a valid email address.'
  return null
}
