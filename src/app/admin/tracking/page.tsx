"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, collection, getDocs, query, orderBy } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { AB_CALENDAR } from "@/data/abCalendar";

type ClubMember = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  duesPaid: boolean;
};

type AttendanceData = {
  [memberId: string]: {
    [month: string]: {
      present: boolean;
      excused: boolean;
    };
  };
};

type MeetingDates = {
  [month: string]: {
    date: string;
    note: string;
    published: boolean;
    visible: boolean;
  };
};

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

function TrackingPage() {
  const { user, loading, isReviewer } = useAuth();
  const router = useRouter();
  const [clubMembers, setClubMembers] = useState<ClubMember[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceData>({});
  const [meetingDates, setMeetingDates] = useState<MeetingDates>({});
  const [showDatesModal, setShowDatesModal] = useState(false);
  const [showDuesTracker, setShowDuesTracker] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.push("/auth");
    else if (!isReviewer) { toast.error("Reviewers only."); router.push("/"); }
  }, [loading, user, isReviewer, router]);

  useEffect(() => {
    if (!isReviewer) return;
    loadClubMembers();
    loadAttendanceData();
    loadMeetingDates();
    loadTrackingSettings();
  }, [isReviewer]);

  async function loadClubMembers() {
    try {
      const usersQuery = query(collection(db, "users"), orderBy("lastName"));
      const usersSnapshot = await getDocs(usersQuery);
      const members = usersSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((u: any) => u.role === "member")
        .map((u: any) => ({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          displayName: `${u.firstName} ${u.lastName}`,
          duesPaid: u.duesPaid || false,
        })) as ClubMember[];
      setClubMembers(members);
    } catch (error) {
      console.error("Error loading club members:", error);
      toast.error("Failed to load club members");
    }
  }

  async function loadAttendanceData() {
    try {
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
    } catch (error) {
      console.error("Error loading attendance data:", error);
    }
  }

  async function loadMeetingDates() {
    try {
      const datesDoc = await getDoc(doc(db, "tracking", "meetingDates"));
      if (datesDoc.exists()) {
        const data = datesDoc.data();
        // Migrate from old format to new format if needed
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
    } catch (error) {
      console.error("Error loading meeting dates:", error);
    }
  }

  async function loadTrackingSettings() {
    try {
      const settingsDoc = await getDoc(doc(db, "tracking", "settings"));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        setShowDuesTracker(data.showDuesTracker || false);
      }
    } catch (error) {
      console.error("Error loading tracking settings:", error);
    }
  }

  async function toggleAttendance(memberId: string, month: string) {
    const isCurrentlyPresent = attendanceData[memberId]?.[month]?.present || false;
    const newAttendanceData = {
      ...attendanceData,
      [memberId]: {
        ...attendanceData[memberId],
        [month]: {
          present: !isCurrentlyPresent,
          excused: !isCurrentlyPresent ? false : (attendanceData[memberId]?.[month]?.excused || false),
        },
      },
    };
    setAttendanceData(newAttendanceData);

    try {
      await setDoc(doc(db, "tracking", "attendance"), newAttendanceData, { merge: true });
    } catch (error) {
      console.error("Error saving attendance:", error);
      toast.error("Failed to save attendance");
      // Revert on error
      setAttendanceData(attendanceData);
    }
  }

  async function toggleExcused(memberId: string, month: string) {
    const isCurrentlyExcused = attendanceData[memberId]?.[month]?.excused || false;
    const newAttendanceData = {
      ...attendanceData,
      [memberId]: {
        ...attendanceData[memberId],
        [month]: {
          present: !isCurrentlyExcused ? false : (attendanceData[memberId]?.[month]?.present || false),
          excused: !isCurrentlyExcused,
        },
      },
    };
    setAttendanceData(newAttendanceData);

    try {
      await setDoc(doc(db, "tracking", "attendance"), newAttendanceData, { merge: true });
    } catch (error) {
      console.error("Error saving attendance:", error);
      toast.error("Failed to save attendance");
      // Revert on error
      setAttendanceData(attendanceData);
    }
  }

  async function toggleDuesPaid(memberId: string) {
    const member = clubMembers.find(m => m.id === memberId);
    if (!member) return;

    const newClubMembers = clubMembers.map(m =>
      m.id === memberId ? { ...m, duesPaid: !m.duesPaid } : m
    );
    setClubMembers(newClubMembers);

    try {
      await updateDoc(doc(db, "users", memberId), { duesPaid: !member.duesPaid });
    } catch (error) {
      console.error("Error saving dues status:", error);
      toast.error("Failed to save dues status");
      // Revert on error
      setClubMembers(clubMembers);
    }
  }

  async function saveMeetingDates() {
    setBusy(true);
    try {
      await setDoc(doc(db, "tracking", "meetingDates"), meetingDates, { merge: true });
      await setDoc(doc(db, "tracking", "settings"), { showDuesTracker }, { merge: true });
      toast.success("Meeting dates saved.");
      setShowDatesModal(false);
    } catch (error) {
      console.error("Error saving meeting dates:", error);
      toast.error("Failed to save meeting dates");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <main className="p-8 text-muted-foreground">Loading…</main>
      </div>
    );
  }

  const visibleMonths = getVisibleMonths(meetingDates);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Meeting Attendance Tracking</h1>
        
        <Card>
          <CardHeader>
            <Button onClick={() => setShowDatesModal(true)} className="w-full">Meeting Dates</Button>
          </CardHeader>
          <CardContent>
            {clubMembers.length === 0 ? (
              <p className="text-muted-foreground">No club members found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-full">
                  <thead>
                    <tr>
                      <th className="border p-2 text-left bg-muted">Member</th>
                      {showDuesTracker && (
                        <th className="border p-2 text-center bg-muted min-w-[100px]">Dues Paid</th>
                      )}
                      {visibleMonths.map(month => {
                        const dateStr = meetingDates[month]?.date;
                        let formattedDate = "No date";
                        let abDay = "";
                        if (dateStr) {
                          try {
                            const date = new Date(dateStr + 'T00:00:00');
                            formattedDate = date.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            });
                            // Get A/B day from calendar
                            const isoDate = date.toISOString().split('T')[0];
                            abDay = AB_CALENDAR[isoDate] || "";
                          } catch (e) {
                            formattedDate = dateStr;
                          }
                        }

                        return (
                          <th key={month} className="border p-2 text-center bg-muted min-w-[100px]">
                            <div className="text-sm font-medium">{month}</div>
                            <div className="text-xs text-muted-foreground">
                              {formattedDate}
                              {abDay && <span className="ml-1 font-semibold text-primary">({abDay})</span>}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {clubMembers.map(member => (
                      <tr key={member.id}>
                        <td className="border p-2 font-medium">{member.displayName}</td>
                        {showDuesTracker && (
                          <td className="border p-2 text-center">
                            <input
                              type="checkbox"
                              checked={member.duesPaid}
                              onChange={() => toggleDuesPaid(member.id)}
                              className="h-5 w-5 cursor-pointer"
                              title="Dues Paid"
                            />
                          </td>
                        )}
                        {visibleMonths.map(month => {
                          const present = attendanceData[member.id]?.[month]?.present || false;
                          const excused = attendanceData[member.id]?.[month]?.excused || false;
                          const meetingDate = meetingDates[month]?.date || "";
                          const bgColor = getAttendanceCellBg(present, excused, meetingDate);

                          return (
                            <td
                              key={month}
                              className="border p-2 text-center"
                              style={{ backgroundColor: bgColor }}
                            >
                              <div className="flex items-center justify-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={present}
                                  onChange={() => toggleAttendance(member.id, month)}
                                  disabled={excused}
                                  className="h-5 w-5 cursor-pointer"
                                  title="Present"
                                />
                                <input
                                  type="checkbox"
                                  checked={excused}
                                  onChange={() => toggleExcused(member.id, month)}
                                  disabled={present}
                                  className="h-5 w-5 cursor-pointer"
                                  title="Excused"
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {showDatesModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg shadow-lg w-[70%] h-[80vh] flex flex-col">
              <div className="border-b bg-card flex items-center px-4 py-3">
                <span className="font-bold text-lg text-primary">Meeting Dates</span>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-3">
                  {MONTHS.map(month => (
                    <div key={month} className="flex items-center gap-3">
                      <Label htmlFor={`date-${month}`} className="font-medium w-24 shrink-0">{month}</Label>
                      <Input
                        id={`date-${month}`}
                        type="date"
                        value={meetingDates[month]?.date || ""}
                        onChange={(e) => setMeetingDates({
                          ...meetingDates,
                          [month]: { ...meetingDates[month], date: e.target.value }
                        })}
                        placeholder="Enter Meeting Date"
                        className="w-36 shrink-0"
                      />
                      <Input
                        id={`note-${month}`}
                        type="text"
                        value={meetingDates[month]?.note || ""}
                        onChange={(e) => setMeetingDates({
                          ...meetingDates,
                          [month]: { ...meetingDates[month], note: e.target.value }
                        })}
                        placeholder="Add a note (e.g., 'Ms. Hafer's Room', 'Bring permission slips')"
                        className="flex-1"
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          id={`publish-${month}`}
                          type="checkbox"
                          checked={meetingDates[month]?.published || false}
                          onChange={(e) => {
                            const newPublished = e.target.checked;
                            setMeetingDates({
                              ...meetingDates,
                              [month]: { 
                                ...meetingDates[month], 
                                published: newPublished,
                                visible: newPublished ? true : meetingDates[month]?.visible || false
                              }
                            });
                          }}
                          className="h-4 w-4 cursor-pointer"
                        />
                        <Label htmlFor={`publish-${month}`} className="text-sm cursor-pointer whitespace-nowrap">
                          Publish
                        </Label>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          id={`visible-${month}`}
                          type="checkbox"
                          checked={meetingDates[month]?.visible || false}
                          onChange={(e) => setMeetingDates({
                            ...meetingDates,
                            [month]: { ...meetingDates[month], visible: e.target.checked }
                          })}
                          className="h-4 w-4 cursor-pointer"
                        />
                        <Label htmlFor={`visible-${month}`} className="text-sm cursor-pointer whitespace-nowrap">
                          Visible
                        </Label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4 border-t space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    id="show-dues-tracker"
                    type="checkbox"
                    checked={showDuesTracker}
                    onChange={(e) => setShowDuesTracker(e.target.checked)}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <Label htmlFor="show-dues-tracker" className="text-sm cursor-pointer">
                    Show Dues Tracker
                  </Label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowDatesModal(false)} disabled={busy}>Cancel</Button>
                  <Button onClick={saveMeetingDates} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default TrackingPage;
