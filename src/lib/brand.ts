/**
 * ServeTrack product branding and display labels.
 * Firestore still stores legacy hour-type / role string values for compatibility;
 * UI copy maps through these helpers so the product reads as a general nonprofit tool.
 */
export const BRAND = {
  name: "ServeTrack",
  tagline: "Nonprofit volunteer management",
  shortDescription:
    "Recruit volunteers, publish service opportunities, log hours with proof, and monitor participation.",
} as const;

/** Stored Firestore hourType values → nonprofit-facing labels */
export const HOUR_TYPE_LABELS: Record<string, string> = {
  "In Club": "Organization",
  "Out of Club": "Community",
  "Summer Hours": "Seasonal",
};

export const HOUR_TYPES = ["In Club", "Out of Club", "Summer Hours"] as const;
export type HourType = (typeof HOUR_TYPES)[number];

export function hourTypeLabel(value: string): string {
  return HOUR_TYPE_LABELS[value] ?? value;
}

/** Stored roles → display names for org leaders / volunteers */
export const ROLE_LABELS: Record<string, string> = {
  member: "Volunteer",
  parent: "Guardian",
  board: "Coordinator",
  sponsor: "Org Admin",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Volunteer";
  return ROLE_LABELS[role] ?? role;
}

export const GRADE_OPTIONS = ["Freshman", "Sophomore", "Junior", "Senior"] as const;
/** UI label for the grade field — kept as demographic category for student-heavy nonprofits */
export const GRADE_FIELD_LABEL = "Grade / cohort";
