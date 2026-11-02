"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { HOUR_TYPES, hourTypeLabel } from "@/lib/brand";
import {
  downloadTextFile,
  filterSubmissions,
  summarizeRows,
  submissionsToCsv,
  type ReportFilters,
  type SubmissionRow,
} from "@/lib/reports";

function ReportsPage() {
  const { user, loading, isReviewer } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [filters, setFilters] = useState<ReportFilters>({
    status: "all",
    hourType: "all",
    fromDate: "",
    toDate: "",
    search: "",
  });

  useEffect(() => {
    if (loading) return;
    if (!user) router.push("/auth");
    else if (!isReviewer) {
      toast.error("Coordinators only.");
      router.push("/");
    }
  }, [loading, user, isReviewer, router]);

  useEffect(() => {
    if (!isReviewer) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "submissions"));
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SubmissionRow)));
      } catch (err) {
        console.error(err);
        toast.error("Failed to load submissions for reporting.");
      } finally {
        setBusy(false);
      }
    })();
  }, [isReviewer]);

  const filtered = useMemo(() => filterSubmissions(rows, filters), [rows, filters]);
  const summary = useMemo(() => summarizeRows(filtered), [filtered]);

  function exportCsv() {
    if (filtered.length === 0) return toast.error("No rows to export with the current filters.");
    const csv = submissionsToCsv(filtered);
    downloadTextFile(`servetrack-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(`Exported ${filtered.length} row(s).`);
  }

  if (!isReviewer) return null;

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Participation reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Filter service records and download a customizable CSV for analysis.
            </p>
          </div>
          <Button onClick={exportCsv} disabled={busy}>Download CSV</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as ReportFilters["status"] })}
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="declined">Declined</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="hourType">Hour type</Label>
              <select
                id="hourType"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={filters.hourType}
                onChange={(e) => setFilters({ ...filters, hourType: e.target.value })}
              >
                <option value="all">All</option>
                {HOUR_TYPES.map((t) => (
                  <option key={t} value={t}>{hourTypeLabel(t)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fromDate">From</Label>
              <Input
                id="fromDate"
                type="date"
                value={filters.fromDate}
                onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="toDate">To</Label>
              <Input
                id="toDate"
                type="date"
                value={filters.toDate}
                onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Name, email, activity…"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Rows" value={summary.rowCount} />
          <SummaryCard label="Approved hours" value={summary.totalApprovedHours} />
          <SummaryCard label="Pending" value={summary.pendingCount} highlight />
          <SummaryCard label="Declined" value={summary.declinedCount} />
        </div>

        {Object.keys(summary.hoursByType).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Approved hours by type</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 text-sm">
              {Object.entries(summary.hoursByType).map(([type, hours]) => (
                <div key={type} className="rounded-md border px-3 py-2">
                  <p className="text-[10px] uppercase text-muted-foreground">{hourTypeLabel(type)}</p>
                  <p className="font-semibold tabular-nums">{hours}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {busy ? (
              <p className="p-6 text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-muted-foreground">No submissions match these filters.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2">Volunteer</th>
                    <th className="px-3 py-2">Activity</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Hours</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.slice(0, 100).map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.userName || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.userEmail}</div>
                      </td>
                      <td className="px-3 py-2 max-w-xs truncate">{r.activityDescription}</td>
                      <td className="px-3 py-2">{hourTypeLabel(String(r.hourType || ""))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.hoursCompleted ?? "—"}</td>
                      <td className="px-3 py-2 capitalize">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {filtered.length > 100 && (
              <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                Showing first 100 of {filtered.length} rows. Export CSV for the full filtered set.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className={`py-5 text-center ${highlight ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}`}>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export default ReportsPage;
