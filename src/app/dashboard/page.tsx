"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProofImage } from "@/components/common/ProofImage";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { useAuth } from "@/hooks/use-auth";

type Hours = { in_club: number; out_of_club: number; out_of_club_raw: number; summer_raw: number; summer_capped: number; effective_total: number };
type Settings = {
  summerHoursCap: number;
  outOfClubHoursCap: number;
  hourGoalFreshman: number; hourGoalSophomore: number; hourGoalJunior: number; hourGoalSenior: number;
};
type Profile = { firstName: string; lastName: string; grade: "Freshman"|"Sophomore"|"Junior"|"Senior"; smallGroupLeaderName: string };
type Recent = { id: string; activityDescription: string; hoursCompleted: number; hourType: string; status: "pending"|"approved"|"declined"; submittedAt: any; proofInFirestore?: boolean; imageProofUrl?: string; imageProofStoragePath?: string };
type AttendanceData = { [memberId: string]: { [month: string]: { present: boolean; excused: boolean } } };
type MeetingDates = { [month: string]: { date: string; note: string; published: boolean; visible: boolean } };

const MONTHS = ["September", "October", "November", "December", "January", "February", "March", "April", "May", "June"];

// Get months that are past or in the current month, or manually set to visible
function getVisibleMonths(meetingDates: MeetingDates) {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-11 (January=0, December=11)
  const currentYear = now.getFullYear();

  // Map month names to calendar month indices
  const monthToIndex: Record<string, number> = {
    September: 8,
    October: 9,
    November: 10,
    December: 11,
    January: 0,
    February: 1,
    March: 2,
    April: 3,
    May: 4,
    June: 5,
  };

  // For school year: months from previous year (Sept-Dec) and current year (Jan-June)
  // If current month is before September, we're in the next school year
  const schoolYearStartYear = currentMonth >= 8 ? currentYear : currentYear - 1;

  return MONTHS.filter(month => {
    // If manually set to visible, always show
    if (meetingDates[month]?.visible) return true;

    const monthIndex = monthToIndex[month];
    const monthYear = monthIndex >= 8 ? schoolYearStartYear : schoolYearStartYear + 1;

    // Show if the month is in the past or is the current month
    if (monthYear < currentYear) return true;
    if (monthYear > currentYear) return false;
    return monthIndex <= currentMonth;
  });
}

// Check if a meeting date is in the past (not today, not future)
function isMeetingInPast(meetingDate: string): boolean {
  if (!meetingDate) return false;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const meeting = new Date(meetingDate + 'T00:00:00');
  meeting.setHours(0, 0, 0, 0);
  
  return meeting < today;
}

// Get background color based on attendance status and meeting date
function getAttendanceCellBg(
  present: boolean,
  excused: boolean,
  meetingDate: string
): string {
  if (present) return 'rgb(71, 237, 38)'; // Light green
  if (excused) return 'rgb(33, 153, 9)'; // Dark green
  if (isMeetingInPast(meetingDate)) return 'rgb(207, 14, 0)'; // Light red
  return 'transparent';
}

function Dashboard() {
  const { user, loading, displayName, role } = useAuth();
  const router = useRouter();
  const [hours, setHours] = useState<Hours | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceData>({});
  const [meetingDates, setMeetingDates] = useState<MeetingDates>({});

  useEffect(() => { if (!loading && !user) router.push("/auth"); }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // Get user profile
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.data();
        setProfile(userData as Profile);

        // Get settings
        const settingsDocRef = doc(db, "settings", "config");
        const settingsDoc = await getDoc(settingsDocRef);
        const settingsData = settingsDoc.data();
        setSettings(settingsData as Settings);

        // Calculate hours from submissions
        const hoursQuery = query(
          collection(db, "submissions"),
          where("userId", "==", user.uid),
          where("status", "==", "approved")
        );
        const hoursSnapshot = await getDocs(hoursQuery);
        const submissions = hoursSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

        let in_club = 0, out_of_club = 0, summer_raw = 0;
        submissions.forEach((sub: any) => {
          const hours = Number(sub.hoursCompleted) || 0;
          if (sub.hourType === "In Club") in_club += hours;
          else if (sub.hourType === "Out of Club") out_of_club += hours;
          else if (sub.hourType === "Summer Hours") summer_raw += hours;
        });

        const summer_cap = settingsData?.summerHoursCap || 10;
        const summer_capped = Math.min(summer_raw, summer_cap);
        const out_of_club_cap = settingsData?.outOfClubHoursCap || 15;
        const out_of_club_capped = Math.min(out_of_club, out_of_club_cap);
        const effective_total = in_club + out_of_club_capped + summer_capped;

        setHours({ in_club, out_of_club: out_of_club_capped, out_of_club_raw: out_of_club, summer_raw, summer_capped, effective_total });

        // Get all submissions
        const allSubmissionsQuery = query(
          collection(db, "submissions"),
          where("userId", "==", user.uid),
          orderBy("submittedAt", "desc")
        );
        const allSubmissionsSnapshot = await getDocs(allSubmissionsQuery);
        setRecent(allSubmissionsSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) as Recent[]);

        // Load attendance data for members only
        if (role === "member") {
          const attendanceDoc = await getDoc(doc(db, "tracking", "attendance"));
          if (attendanceDoc.exists()) {
            const data = attendanceDoc.data();
            // Migrate from old boolean format to new object format
            const migrated: AttendanceData = {};
            for (const [memberId, memberData] of Object.entries(data)) {
              if (typeof memberData === 'object' && memberData !== null) {
                // Already in new format
                migrated[memberId] = memberData as any;
              } else {
                // Old format: boolean, migrate to new format
                migrated[memberId] = {};
                for (const month of MONTHS) {
                  const value = (memberData as any)[month];
                  if (typeof value === 'boolean') {
                    migrated[memberId][month] = { present: value, excused: false };
                  } else {
                    migrated[memberId][month] = { present: false, excused: false };
                  }
                }
              }
            }
            setAttendanceData(migrated);
          }

          const datesDoc = await getDoc(doc(db, "tracking", "meetingDates"));
          if (datesDoc.exists()) {
            const data = datesDoc.data();
            const migrated: MeetingDates = {};
            for (const month of MONTHS) {
              const value = data[month];
              if (typeof value === 'string') {
                // Old format: just a date string
                migrated[month] = { date: value, note: '', published: false, visible: false };
              } else if (value && typeof value === 'object') {
                // New format: object with date, note, published, visible
                // Auto-set visible to true if published is true
                const isVisible = value.visible !== undefined ? value.visible : (value.published || false);
                migrated[month] = { 
                  date: value.date || '', 
                  note: value.note || '', 
                  published: value.published || false,
                  visible: isVisible
                };
              } else {
                // No data for this month
                migrated[month] = { date: '', note: '', published: false, visible: false };
              }
            }
            setMeetingDates(migrated);
          } else {
            // Initialize empty structure if document doesn't exist
            const empty: MeetingDates = {};
            for (const month of MONTHS) {
              empty[month] = { date: '', note: '', published: false, visible: false };
            }
            setMeetingDates(empty);
          }
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      }
    })();
  }, [user, role]);

  if (!user) return null;
  const goal = profile && settings ? settings[`hourGoal${profile.grade}` as keyof Settings] as number : 100;
  const total = hours ? Number(hours.effective_total) : 0;
  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
  const barColor = pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  const visibleMonths = getVisibleMonths(meetingDates);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Welcome back, {displayName.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </header>

        <Card>
          <CardContent className="py-6 space-y-3">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Your hours</p>
                <p className="text-5xl font-bold tabular-nums">{round(total)}</p>
              </div>
              <p className="text-sm text-muted-foreground">Goal: {goal} hrs ({profile?.grade})</p>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div className={`h-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{round(total)} / {goal} hrs ({Math.round(pct)}%)</p>
            {hours && (
              <div className="grid grid-cols-3 gap-3 pt-2 text-sm">
                <Mini label="Organization" value={round(hours.in_club)} />
                <Mini label={`Community (cap ${settings?.outOfClubHoursCap ?? 15})`} value={`${round(hours.out_of_club)}${hours.out_of_club_raw > hours.out_of_club ? ` / ${round(hours.out_of_club_raw)}` : ""}`} />
                <Mini label={`Seasonal (cap ${settings?.summerHoursCap ?? 10})`} value={`${round(hours.summer_capped)}${Number(hours.summer_raw) > Number(hours.summer_capped) ? ` / ${round(hours.summer_raw)}` : ""}`} />
              </div>
            )}
          </CardContent>
        </Card>

        <Link href="/submit"><Button size="lg" className="w-full">Submit hours</Button></Link>

        <div className="h-6"></div>

        {role === "member" && (
          <Card>
            <CardHeader>
              <CardTitle>Meeting Attendance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-full">
                  <thead>
                    <tr>
                      {visibleMonths.map(month => {
                        const dateStr = meetingDates[month]?.date;
                        let formattedDate = "No date";
                        if (dateStr) {
                          try {
                            const date = new Date(dateStr + 'T00:00:00');
                            formattedDate = date.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            });
                          } catch (e) {
                            formattedDate = dateStr;
                          }
                        }
                        
                        return (
                          <th key={month} className="border p-2 text-center bg-muted min-w-[100px]">
                            <div className="text-sm font-medium">{month}</div>
                            <div className="text-xs text-muted-foreground">{formattedDate}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {visibleMonths.map(month => {
                        const present = attendanceData[user.uid]?.[month]?.present || false;
                        const excused = attendanceData[user.uid]?.[month]?.excused || false;
                        const meetingDate = meetingDates[month]?.date || "";
                        const bgColor = getAttendanceCellBg(present, excused, meetingDate);
                        
                        return (
                          <td 
                            key={month} 
                            className="border p-2 text-center"
                            style={{ backgroundColor: bgColor }}
                          >
                            {present ? (
                              <span className="text-green-600 font-bold">✓ Present</span>
                            ) : excused ? (
                              <span className="text-yellow-600 font-medium">Excused</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <section>
          <h2 className="text-xl font-semibold mb-2">All submissions</h2>
          {recent.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No submissions yet.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y">
                {recent.map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{s.activityDescription}</p>
                      <p className="text-xs text-muted-foreground">{new Date(s.submittedAt?.toDate?.() || s.submittedAt).toLocaleDateString()} · {Number(s.hoursCompleted)} hrs · {s.hourType}</p>
                      <div className="mt-2">
                        <ProofImage submission={s} autoLoad={s.status === "pending"} />
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
function StatusBadge({ status }: { status: "pending"|"approved"|"declined" }) {
  const map = {
    pending: "bg-yellow-100 text-yellow-900 border-yellow-300",
    approved: "bg-green-100 text-green-900 border-green-300",
    declined: "bg-red-100 text-red-900 border-red-300",
  } as const;
  return <Badge variant="outline" className={map[status]}>{status}</Badge>;
}
function round(n: number) { return Math.round(Number(n) * 10) / 10; }

export default Dashboard;
