// Map known DB error codes to safe, user-facing messages and hide raw
// PostgREST/Postgres details from end users. Full errors still log to console.
export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!err) return fallback;
  const e = err as { code?: string; message?: string; status?: number };
  // eslint-disable-next-line no-console
  console.error(err);

  // Firebase Authentication error codes
  switch (e.code) {
    case "auth/email-already-in-use": return "An account with that email already exists.";
    case "auth/invalid-email": return "Invalid email address.";
    case "auth/invalid-credential": return "Invalid email or password.";
    case "auth/user-not-found": return "Invalid email or password.";
    case "auth/wrong-password": return "Invalid email or password.";
    case "auth/weak-password": return "Password is too weak. Please use a stronger password.";
    case "auth/too-many-requests": return "Too many attempts. Please try again later.";
    case "auth/operation-not-allowed": return "Email/password sign-up is not enabled. Please contact support.";
    case "auth/popup-closed-by-user": return "Sign-in was cancelled.";
    case "auth/timeout": return "Sign-in timed out. Please try again.";
    case "auth/network-request-failed": return "Network error. Please check your connection and try again.";
    // Firestore error codes
    case "permission-denied": return "You don't have permission to do that. Please contact support.";
    // PostgreSQL error codes
    case "23505": return "That value already exists.";
    case "23503": return "Related record not found.";
    case "23502": return "A required field is missing.";
    case "23514": return "That value is not allowed.";
    case "42501":
    case "PGRST301":
    case "PGRST302":
      return "You don't have permission to do that.";
    case "PGRST116": return "Not found.";
  }
  const msg = e.message ?? "";
  if (/row-level security|permission denied/i.test(msg)) return "You don't have permission to do that.";
  if (/Invalid login credentials/i.test(msg)) return "Invalid email or password.";
  if (/Email not confirmed/i.test(msg)) return "Please confirm your email before signing in.";
  if (/User already registered/i.test(msg)) return "An account with that email already exists.";
  if (/Password should be/i.test(msg)) return msg; // auth password rules are safe to show
  if (/network|fetch/i.test(msg)) return "Network error. Please check your connection and try again.";
  return fallback;
}
