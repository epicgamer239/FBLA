/**
 * Shared input validation (syntactic + semantic) for ServeTrack forms.
 * Returns null when valid, or a user-facing error message.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const v = email.trim();
  if (!v) return "Email is required.";
  if (v.length > 254) return "Email is too long.";
  if (!EMAIL_RE.test(v)) return "Enter a valid email address (name@example.com).";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Password is required.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  if (password.length > 128) return "Password is too long.";
  return null;
}

export function validateName(name: string, field = "Name"): string | null {
  const v = name.trim();
  if (v.length < 1) return `${field} is required.`;
  if (v.length > 60) return `${field} must be 60 characters or fewer.`;
  if (!/^[a-zA-Z][a-zA-Z\s'-]*$/.test(v)) {
    return `${field} can only include letters, spaces, hyphens, and apostrophes.`;
  }
  return null;
}

/** Expects US-style phone; stores/checks 10 digits. */
export function validatePhone(phone: string, required = true): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return required ? "Phone number is required." : null;
  if (digits.length !== 10) return "Phone number must have exactly 10 digits.";
  return null;
}

export function validateActivityDescription(text: string): string | null {
  const v = text.trim();
  if (v.length < 10) return "Description must be at least 10 characters.";
  if (v.length > 1000) return "Description must be 1000 characters or fewer.";
  return null;
}

export function validatePointOfContact(text: string): string | null {
  const v = text.trim();
  if (v.length < 5) return "Point of contact must be at least 5 characters.";
  if (v.length > 200) return "Point of contact must be 200 characters or fewer.";
  return null;
}

/**
 * Semantic hour validation: must be a positive number, max one day of service,
 * and at most one decimal place for readable reporting.
 */
export function validateHours(hoursRaw: string): string | null {
  const n = Number(hoursRaw);
  if (!Number.isFinite(n)) return "Enter a valid number of hours.";
  if (n <= 0) return "Hours must be greater than 0.";
  if (n > 24) return "Hours cannot exceed 24 for a single submission.";
  if (Math.round(n * 10) / 10 !== n) return "Use at most one decimal place (e.g. 1.5).";
  return null;
}

export function validateProofFile(file: File | null): string | null {
  if (!file) return "Please attach a proof image.";
  if (!file.type.startsWith("image/")) return "Proof must be an image file (JPEG, PNG, etc.).";
  if (file.size > 10 * 1024 * 1024) return "Image is too large (max 10 MB).";
  return null;
}
