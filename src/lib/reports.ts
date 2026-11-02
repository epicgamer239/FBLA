/**
 * Customizable report helpers for organization leaders.
 * Builds filtered rows and CSV output for participation analysis.
 */

export type SubmissionRow = {
  id: string;
  userName?: string;
  userEmail?: string;
  grade?: string;
  smallGroupLeaderName?: string;
  activityDescription?: string;
  hourType?: string;
  hoursCompleted?: number;
  status?: string;
  submittedAt?: { toDate?: () => Date } | Date | string | null;
  [key: string]: unknown;
};

export type ReportFilters = {
  status: "all" | "pending" | "approved" | "declined";
  hourType: "all" | string;
  fromDate: string; // yyyy-mm-dd
  toDate: string;
  search: string;
};

function asDate(value: SubmissionRow["submittedAt"]): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }
  return null;
}

export function filterSubmissions(
  rows: SubmissionRow[],
  filters: ReportFilters
): SubmissionRow[] {
  const q = filters.search.trim().toLowerCase();
  const from = filters.fromDate ? new Date(filters.fromDate + "T00:00:00") : null;
  const to = filters.toDate ? new Date(filters.toDate + "T23:59:59") : null;

  return rows.filter((r) => {
    if (filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.hourType !== "all" && r.hourType !== filters.hourType) return false;

    const submitted = asDate(r.submittedAt);
    if (from && submitted && submitted < from) return false;
    if (to && submitted && submitted > to) return false;
    if ((from || to) && !submitted) return false;

    if (!q) return true;
    const hay = `${r.userName ?? ""} ${r.userEmail ?? ""} ${r.activityDescription ?? ""} ${r.smallGroupLeaderName ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

export function summarizeRows(rows: SubmissionRow[]) {
  const approved = rows.filter((r) => r.status === "approved");
  const totalHours = approved.reduce((s, r) => s + (Number(r.hoursCompleted) || 0), 0);
  const byType: Record<string, number> = {};
  approved.forEach((r) => {
    const key = r.hourType || "Unknown";
    byType[key] = (byType[key] || 0) + (Number(r.hoursCompleted) || 0);
  });
  return {
    rowCount: rows.length,
    approvedCount: approved.length,
    pendingCount: rows.filter((r) => r.status === "pending").length,
    declinedCount: rows.filter((r) => r.status === "declined").length,
    totalApprovedHours: Math.round(totalHours * 10) / 10,
    hoursByType: byType,
  };
}

function csvEscape(value: string): string {
  return `"${(value ?? "").replace(/"/g, '""')}"`;
}

export function submissionsToCsv(rows: SubmissionRow[]): string {
  const header = [
    "Name",
    "Email",
    "Grade",
    "Team",
    "Activity",
    "Hour Type",
    "Hours",
    "Status",
    "Submitted At",
  ];
  const lines = [header.join(",")];
  rows.forEach((r) => {
    const submitted = asDate(r.submittedAt);
    lines.push(
      [
        csvEscape(String(r.userName ?? "")),
        csvEscape(String(r.userEmail ?? "")),
        csvEscape(String(r.grade ?? "")),
        csvEscape(String(r.smallGroupLeaderName ?? "")),
        csvEscape(String(r.activityDescription ?? "")),
        csvEscape(String(r.hourType ?? "")),
        csvEscape(String(r.hoursCompleted ?? "")),
        csvEscape(String(r.status ?? "")),
        csvEscape(submitted ? submitted.toISOString() : ""),
      ].join(",")
    );
  });
  return lines.join("\n");
}

export function downloadTextFile(filename: string, contents: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
