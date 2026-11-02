import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, deleteField, getDocs, collection } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Settings — Admin" }] }),
  component: SettingsPage,
});

type Settings = {
  reminderEmails: boolean;
  summerHoursCap: number;
  outOfClubHoursCap: number;
  hourGoalFreshman: number;
  hourGoalSophomore: number;
  hourGoalJunior: number;
  hourGoalSenior: number;
  allowRegistration: boolean;
  allowTeamChanges: boolean;
  infoPageContentLight: string;
  infoPageContentDark: string;
  infoPageLastUpdated?: any;
  infoPageLastEditedBy?: string;
  academicYear: string;
  clubEmail: string;
  instagramHandle: string;
};

function SettingsPage() {
  const { user, loading, isReviewer, role } = useAuth();
  const nav = useNavigate();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [showFixFormattingModal, setShowFixFormattingModal] = useState(false);
  const [fixNames, setFixNames] = useState(false);
  const [fixPhones, setFixPhones] = useState(false);
  const [cleanSponsors, setCleanSponsors] = useState(false);
  const [fixTimezones, setFixTimezones] = useState(false);
  const [validateHours, setValidateHours] = useState(false);
  const [ensureRequiredFields, setEnsureRequiredFields] = useState(false);
  const [fixResults, setFixResults] = useState<string[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) nav({ to: "/auth" });
    else if (!isReviewer) { toast.error("Reviewers only."); nav({ to: "/" }); }
  }, [loading, user, isReviewer, nav]);

  useEffect(() => {
    if (!isReviewer) return;
    (async () => {
      try {
        const settingsDoc = await getDoc(doc(db, "settings", "config"));
        if (!settingsDoc.exists()) {
          console.log("Settings document does not exist, creating with defaults");
          const defaultSettings: Settings = {
            reminderEmails: false,
            summerHoursCap: 10,
            outOfClubHoursCap: 15,
            hourGoalFreshman: 30,
            hourGoalSophomore: 30,
            hourGoalJunior: 30,
            hourGoalSenior: 30,
            allowRegistration: true,
            allowTeamChanges: true,
            infoPageContentLight: "",
            infoPageContentDark: "",
            academicYear: "2026–2027",
            clubEmail: "broadrunkeyclub@gmail.com",
            instagramHandle: "@brkeyclub",
          };
          await setDoc(doc(db, "settings", "config"), {
            ...defaultSettings,
            updatedAt: serverTimestamp(),
          });
          setS(defaultSettings);
          toast.success("Settings created with default values");
          return;
        }
        const settingsData = settingsDoc.data();
        setS(settingsData as Settings | null);
      } catch (error) {
        console.error("Error loading settings:", error);
        toast.error("Failed to load settings. Check console for details.");
        setS(null);
      }
    })();
  }, [isReviewer]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    if (s.summerHoursCap < 1) return toast.error("Summer cap must be at least 1.");
    if (s.outOfClubHoursCap < 1) return toast.error("Out of club cap must be at least 1.");
    setBusy(true);
    try {
      await updateDoc(doc(db, "settings", "config"), {
        ...s,
        clubName: deleteField(),
      });
      toast.success("Settings saved.");
    } catch (error: any) {
      toast.error(error.message || "Failed to save settings");
    } finally {
      setBusy(false);
    }
  }

  async function migrateToNextYear() {
    if (!s) return;
    if (!confirm("Are you sure you want to migrate to the next academic year? This will update the year across the entire application.")) return;
    setBusy(true);
    try {
      // Parse current year (e.g., "2026–2027") and increment both parts
      const currentYear = s.academicYear;
      const match = currentYear.match(/(\d{4})–(\d{4})/);
      if (!match) {
        toast.error("Invalid academic year format");
        setBusy(false);
        return;
      }
      const startYear = parseInt(match[1]) + 1;
      const endYear = parseInt(match[2]) + 1;
      const newYear = `${startYear}–${endYear}`;

      await updateDoc(doc(db, "settings", "config"), {
        academicYear: newYear,
        updatedAt: serverTimestamp(),
      });
      setS({ ...s, academicYear: newYear });
      toast.success(`Migrated to ${newYear} academic year`);
    } catch (error: any) {
      toast.error(error.message || "Failed to migrate year");
    } finally {
      setBusy(false);
    }
  }

  // Helper function to capitalize names (first letter uppercase, rest lowercase)
  function capitalizeName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  async function runFixFormatting() {
    if (!fixNames && !fixPhones && !cleanSponsors && !fixTimezones && !validateHours && !ensureRequiredFields) return;
    if (!confirm("Are you sure you want to run the selected formatting fixes? This will modify user data.")) return;

    // Security check: only board and sponsor roles can run this operation
    if (role !== 'board' && role !== 'sponsor') {
      toast.error("Only board members and sponsors can run formatting fixes.");
      return;
    }

    setBusy(true);
    setFixResults([]);
    const results: string[] = [];

    try {
      const usersSnapshot = await getDocs(collection(db, "users"));
      let updatedCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      let validationIssues = 0;

      // Fetch settings for operation 5 (hours validation)
      let settingsData: any = null;
      if (validateHours) {
        const settingsDoc = await getDoc(doc(db, "settings", "config"));
        if (settingsDoc.exists()) {
          settingsData = settingsDoc.data();
        } else {
          results.push("WARNING: Settings document not found. Hours validation may be incomplete.");
        }
      }

      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const updates: any = {};
        const userIdentifier = `${userData.firstName || 'Unknown'} ${userData.lastName || 'Unknown'} (${userData.email || 'no email'})`;

        // Operation 1: Fix names
        if (fixNames) {
          if (userData.firstName && typeof userData.firstName === 'string') {
            const capitalized = capitalizeName(userData.firstName);
            if (capitalized !== userData.firstName) {
              updates.firstName = capitalized;
            }
          }
          if (userData.lastName && typeof userData.lastName === 'string') {
            const capitalized = capitalizeName(userData.lastName);
            if (capitalized !== userData.lastName) {
              updates.lastName = capitalized;
            }
          }
          if (userData.parentRequestedStudentName && typeof userData.parentRequestedStudentName === 'string') {
            const capitalized = capitalizeName(userData.parentRequestedStudentName);
            if (capitalized !== userData.parentRequestedStudentName) {
              updates.parentRequestedStudentName = capitalized;
            }
          }
        }

        // Operation 2: Fix phone numbers
        if (fixPhones && userData.phone) {
          const phoneStr = String(userData.phone);
          const digits = phoneStr.replace(/\D/g, '');

          if (digits.length === 10) {
            // Valid phone number, store only digits
            if (phoneStr !== digits) {
              updates.phone = digits;
            }
          } else if (digits.length > 0) {
            // Invalid phone number - has digits but not exactly 10
            results.push(`ERROR: ${userIdentifier} - Phone number has ${digits.length} digits (expected 10). Skipping.`);
            errorCount++;
            skippedCount++;
            continue; // Skip this user entirely for phone errors
          }
          // If no digits found, skip silently (might be null or empty string)
        }

        // Operation 3: Clean sponsors
        if (cleanSponsors && userData.role === 'sponsor') {
          const fieldsToNullify = [
            'effectiveTotalHours',
            'grade',
            'inClubHours',
            'outOfClubHours',
            'requestedRole',
            'smallGroupId',
            'summerHoursRaw'
          ];

          for (const field of fieldsToNullify) {
            if (userData[field] !== null && userData[field] !== undefined) {
              updates[field] = null;
            }
          }
          updates.updatedAt = new Date();
        }

        // Operation 4: Fix timezones (convert Date objects to UTC timestamps)
        if (fixTimezones) {
          const timestampFields = ['updatedAt', 'createdAt'];
          for (const field of timestampFields) {
            const value = userData[field];
            if (value) {
              // Check if it's a JavaScript Date object (not a Firestore Timestamp)
              // Firestore Timestamps have toDate() method, Date objects don't
              if (value instanceof Date) {
                // Convert to UTC by using the timestamp value
                updates[field] = new Date(value.getTime());
              } else if (typeof value === 'object' && value.toDate && typeof value.toDate === 'function') {
                // It's a Firestore Timestamp, already in UTC, no change needed
                // But we can normalize it by converting to Date and back
                const date = value.toDate();
                updates[field] = new Date(date.getTime());
              } else if (typeof value === 'string') {
                // It's a string, try to parse it
                try {
                  const parsedDate = new Date(value);
                  if (!isNaN(parsedDate.getTime())) {
                    updates[field] = new Date(parsedDate.getTime());
                  } else {
                    results.push(`WARNING: ${userIdentifier} - ${field} is an invalid date string. Skipping.`);
                  }
                } catch (e) {
                  results.push(`WARNING: ${userIdentifier} - ${field} could not be parsed as date. Skipping.`);
                }
              }
            }
          }
        }

        // Operation 5: Validate hours (read-only, just report issues)
        if (validateHours) {
          const inClub = Number(userData.inClubHours) || 0;
          const outOfClubRaw = Number(userData.outOfClubHours) || 0;
          const summerRaw = Number(userData.summerHoursRaw) || 0;
          const effectiveTotal = Number(userData.effectiveTotalHours) || 0;

          const summerCap = settingsData?.summerHoursCap || 10;
          const outOfClubCap = settingsData?.outOfClubHoursCap || 15;

          // Calculate expected capped values (on the fly)
          const expectedSummerCapped = Math.min(summerRaw, summerCap);
          const expectedOutOfClubCapped = Math.min(outOfClubRaw, outOfClubCap);
          const expectedEffectiveTotal = inClub + expectedOutOfClubCapped + expectedSummerCapped;

          // Check effective total matches expected
          if (effectiveTotal !== expectedEffectiveTotal) {
            results.push(`VALIDATION ISSUE: ${userIdentifier} - Effective total mismatch. Stored: ${effectiveTotal}, Expected: ${expectedEffectiveTotal} (inClub: ${inClub}, outOfClub: ${outOfClubRaw}→${expectedOutOfClubCapped}, summer: ${summerRaw}→${expectedSummerCapped})`);
            validationIssues++;
          }

          // Check for negative values
          if (inClub < 0) {
            results.push(`VALIDATION ISSUE: ${userIdentifier} - In club hours is negative: ${inClub}`);
            validationIssues++;
          }
          if (outOfClubRaw < 0) {
            results.push(`VALIDATION ISSUE: ${userIdentifier} - Out of club hours is negative: ${outOfClubRaw}`);
            validationIssues++;
          }
          if (summerRaw < 0) {
            results.push(`VALIDATION ISSUE: ${userIdentifier} - Summer hours is negative: ${summerRaw}`);
            validationIssues++;
          }
        }

        // Operation 6: Ensure required fields are present
        if (ensureRequiredFields) {
          const criticalFields = ['firstName', 'lastName', 'email', 'role'];
          let missingCritical = false;

          // Check critical fields (cannot auto-fix)
          for (const field of criticalFields) {
            if (!userData[field] || (typeof userData[field] === 'string' && userData[field].trim() === '')) {
              results.push(`CRITICAL MISSING: ${userIdentifier} - Required field '${field}' is missing or empty. Manual intervention required.`);
              missingCritical = true;
            }
          }

          if (missingCritical) {
            errorCount++;
            continue; // Skip this user entirely if critical fields are missing
          }

          // Check and fix hour fields (can smart-fill)
          const inClub = Number(userData.inClubHours) || 0;
          const outOfClubRaw = Number(userData.outOfClubHours) || 0;
          const summerRaw = Number(userData.summerHoursRaw) || 0;

          // Ensure inClubHours exists
          if (userData.inClubHours === undefined || userData.inClubHours === null) {
            updates.inClubHours = 0;
          }

          // Ensure outOfClubHours exists
          if (userData.outOfClubHours === undefined || userData.outOfClubHours === null) {
            updates.outOfClubHours = 0;
          }

          // Ensure summerHoursRaw exists
          if (userData.summerHoursRaw === undefined || userData.summerHoursRaw === null) {
            updates.summerHoursRaw = 0;
          }

          // Smart-fill effectiveTotalHours if missing or incorrect (calculated on the fly)
          const summerCap = settingsData?.summerHoursCap || 10;
          const outOfClubCap = settingsData?.outOfClubHoursCap || 15;
          const summerCapped = Math.min(summerRaw, summerCap);
          const outOfClubCapped = Math.min(outOfClubRaw, outOfClubCap);
          const expectedEffectiveTotal = inClub + outOfClubCapped + summerCapped;

          if (userData.effectiveTotalHours === undefined || userData.effectiveTotalHours === null) {
            updates.effectiveTotalHours = expectedEffectiveTotal;
          } else if (userData.effectiveTotalHours !== expectedEffectiveTotal) {
            updates.effectiveTotalHours = expectedEffectiveTotal;
          }

          // Ensure role is valid
          const validRoles = ['member', 'parent', 'board', 'sponsor'];
          if (!validRoles.includes(userData.role)) {
            results.push(`WARNING: ${userIdentifier} - Invalid role '${userData.role}'. Setting to 'member'.`);
            updates.role = 'member';
          }

          // Ensure requestedRole is null if it matches the actual role (should only be set for pending approvals)
          if (userData.requestedRole === userData.role) {
            updates.requestedRole = null;
          }

          // Ensure createdAt exists
          if (!userData.createdAt) {
            updates.createdAt = new Date();
          }

          // Ensure updatedAt exists
          if (!userData.updatedAt) {
            updates.updatedAt = new Date();
          }

          // For members, ensure grade exists and is valid
          if (userData.role === 'member') {
            const validGrades = ['Freshman', 'Sophomore', 'Junior', 'Senior'];
            if (!userData.grade || !validGrades.includes(userData.grade)) {
              if (!userData.grade) {
                results.push(`WARNING: ${userIdentifier} - Missing grade for member. Setting to 'Freshman'.`);
                updates.grade = 'Freshman';
              } else {
                results.push(`WARNING: ${userIdentifier} - Invalid grade '${userData.grade}'. Setting to 'Freshman'.`);
                updates.grade = 'Freshman';
              }
            }
          }

          // For parents, ensure parentRequestedStudentName exists if they're a parent
          if (userData.role === 'parent' && !userData.parentRequestedStudentName) {
            results.push(`WARNING: ${userIdentifier} - Parent account missing parentRequestedStudentName. Manual review recommended.`);
          }

          // For sponsors, ensure hour fields are null (should have been cleaned by operation 3, but check anyway)
          if (userData.role === 'sponsor') {
            const sponsorHourFields = ['inClubHours', 'outOfClubHours', 'summerHoursRaw', 'effectiveTotalHours', 'grade', 'smallGroupId'];
            for (const field of sponsorHourFields) {
              if (userData[field] !== null && userData[field] !== undefined) {
                updates[field] = null;
              }
            }
          }
        }

        // Apply updates if any (only for operations 1-4 and 6, not 5)
        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, "users", userDoc.id), updates);
          updatedCount++;
        } else {
          skippedCount++;
        }
      }

      let summary = `Operation complete. Updated: ${updatedCount} users, Skipped: ${skippedCount} users`;
      if (errorCount > 0) summary += `, Errors: ${errorCount}`;
      if (validationIssues > 0) summary += `, Validation Issues: ${validationIssues}`;
      results.push(summary);

      if (errorCount > 0) {
        toast.warning(`Completed with ${errorCount} errors. Check results for details.`);
      } else if (validationIssues > 0) {
        toast.warning(`Completed with ${validationIssues} validation issues. Check results for details.`);
      } else {
        toast.success(`Formatting complete. Updated ${updatedCount} users.`);
      }
    } catch (error: any) {
      results.push(`ERROR: ${error.message || 'Unknown error occurred'}`);
      toast.error(error.message || "Failed to run formatting fixes");
    } finally {
      setFixResults(results);
      setBusy(false);
    }
  }

  if (!s) return (<div className="min-h-screen bg-background"><Nav /><main className="p-8 text-muted-foreground">Loading…</main></div>);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Settings</h1>
        <Card>
          <CardHeader><CardTitle>Club configuration</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4" noValidate>
              <Field label="Summer hours cap">
                <Input type="number" min="1" max="100" value={s.summerHoursCap}
                  onChange={(e) => setS({ ...s, summerHoursCap: Number(e.target.value) })} />
              </Field>
              <Field label="Out of club hours cap">
                <Input type="number" min="1" max="100" value={s.outOfClubHoursCap}
                  onChange={(e) => setS({ ...s, outOfClubHoursCap: Number(e.target.value) })} />
              </Field>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(["freshman","sophomore","junior","senior"] as const).map((g) => (
                  <Field key={g} label={`Goal — ${g[0].toUpperCase()+g.slice(1)}`}>
                    <Input type="number" min="0" max="500"
                      value={(s as any)[`hourGoal${g[0].toUpperCase()+g.slice(1)}`]}
                      onChange={(e) => setS({ ...s, [`hourGoal${g[0].toUpperCase()+g.slice(1)}`]: Number(e.target.value) } as Settings)} />
                  </Field>
                ))}
              </div>
              <label className="flex items-center gap-2 pt-2">
                <input type="checkbox" checked={s.allowRegistration}
                  onChange={(e) => setS({ ...s, allowRegistration: e.target.checked })} />
                <span className="text-sm">Allow new registrations</span>
              </label>
              <label className="flex items-center gap-2 pt-2">
                <input type="checkbox" checked={s.allowTeamChanges}
                  onChange={(e) => setS({ ...s, allowTeamChanges: e.target.checked })} />
                <span className="text-sm">Allow team changes</span>
              </label>

              <div className="pt-4 border-t space-y-4">
                <div>
                  <Label>Current academic year</Label>
                  <Input value={s.academicYear} onChange={(e) => setS({ ...s, academicYear: e.target.value })} />
                </div>
                <Button type="button" variant="outline" onClick={migrateToNextYear} disabled={busy}>
                  {busy ? "Migrating…" : "Migrate to next year"}
                </Button>
              </div>

              <div className="pt-4 border-t space-y-4">
                <div>
                  <Label>Club email</Label>
                  <Input value={s.clubEmail} onChange={(e) => setS({ ...s, clubEmail: e.target.value })} />
                </div>
                <div>
                  <Label>Instagram handle</Label>
                  <Input value={s.instagramHandle} onChange={(e) => setS({ ...s, instagramHandle: e.target.value })} />
                </div>
              </div>

              <div className="pt-4 border-t space-y-4">
                <div>
                  <Button type="button" variant="outline" onClick={() => setShowFixFormattingModal(true)} disabled={busy}>
                    Fix Formatting
                  </Button>
                  <p className="text-sm text-muted-foreground mt-2">
                    Bulk fix user data formatting issues (names, phone numbers, sponsor cleanup, timezones, hours validation, required fields).
                  </p>
                </div>
              </div>

              <div className="h-8"></div>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button>
            </form>
          </CardContent>
        </Card>

        {/* Fix Formatting Modal */}
        {showFixFormattingModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle>Fix Formatting</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Select the formatting operations to perform. These will modify user data in Firestore.
                </p>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fixNames}
                    onChange={(e) => setFixNames(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Fix name capitalization (convert "JOSEPH FERRIGNO" → "Joseph Ferrigno")</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fixPhones}
                    onChange={(e) => setFixPhones(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Fix phone number formatting (extract 10 digits, skip invalid numbers)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cleanSponsors}
                    onChange={(e) => setCleanSponsors(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Clean sponsor accounts (nullify hour fields, grade, group for sponsors only)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fixTimezones}
                    onChange={(e) => setFixTimezones(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Fix timezones (convert all date fields to UTC)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={validateHours}
                    onChange={(e) => setValidateHours(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Validate hours data (read-only check, reports mismatches)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ensureRequiredFields}
                    onChange={(e) => setEnsureRequiredFields(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Ensure required fields (smart-fill missing fields, report critical issues)</span>
                </label>

                {fixResults.length > 0 && (
                  <div className="bg-muted/30 rounded-md p-3 max-h-48 overflow-y-auto">
                    <p className="text-xs font-semibold mb-2">Results:</p>
                    {fixResults.map((result, i) => (
                      <p key={i} className="text-xs font-mono whitespace-pre-wrap mb-1">{result}</p>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={runFixFormatting}
                    disabled={busy || (!fixNames && !fixPhones && !cleanSponsors && !fixTimezones && !validateHours && !ensureRequiredFields)}
                    className="flex-1"
                  >
                    {busy ? "Running…" : "Run Selected Operations"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowFixFormattingModal(false);
                      setFixResults([]);
                      setFixNames(false);
                      setFixPhones(false);
                      setCleanSponsors(false);
                      setFixTimezones(false);
                      setValidateHours(false);
                      setEnsureRequiredFields(false);
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="space-y-1"><Label>{label}</Label>{children}</div>);
}
