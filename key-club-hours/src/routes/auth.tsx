import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { friendlyError } from "@/lib/errors";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Key Club Hours" }] }),
  validateSearch: searchSchema,
  component: AuthPage,
});

type RequestedRole = "member" | "parent" | "board" | "sponsor";

function AuthPage() {
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [grade, setGrade] = useState("Freshman");
  const [childName, setChildName] = useState("");
  const [requestedRole, setRequestedRole] = useState<RequestedRole>("member");
  const [busy, setBusy] = useState(false);
  const [hasScrolledRules, setHasScrolledRules] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [academicYear, setAcademicYear] = useState("2026–2027");
  const [clubEmail, setClubEmail] = useState("broadrunkeyclub@gmail.com");
  const [instagramHandle, setInstagramHandle] = useState("@brkeyclub");
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const settingsDoc = await getDoc(doc(db, "settings", "config"));
        if (settingsDoc.exists()) {
          const settingsData = settingsDoc.data();
          setAcademicYear(settingsData.academicYear || "2026–2027");
          setClubEmail(settingsData.clubEmail || "broadrunkeyclub@gmail.com");
          setInstagramHandle(settingsData.instagramHandle || "@brkeyclub");
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      }
    })();
  }, []);
  const { user } = useAuth();

  useEffect(() => {
    if (search.mode && search.mode !== mode) setMode(search.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.mode]);

  useEffect(() => {
    if (user) nav({ to: "/dashboard" });
  }, [user, nav]);

  // Helper function to capitalize names (first letter uppercase, rest lowercase)
  function capitalizeName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!rulesAccepted) {
          toast.error(
            "Please scroll through and accept the Rules & Expectations to continue."
          );
          setBusy(false);
          return;
        }

        // Validate phone number has exactly 10 digits
        if (requestedRole !== "parent") {
          const phoneDigits = phone.replace(/\D/g, '');
          if (phoneDigits.length !== 10) {
            toast.error("Phone number must have exactly 10 digits.");
            setBusy(false);
            return;
          }
        }

        // Validate email format for member role (must be LCPS school email)
        if (requestedRole === "member") {
          const lcpsEmailRegex = /^\d{7}@lcps\.org$/;
          if (!lcpsEmailRegex.test(email)) {
            toast.error("Email must be a school email.");
            setBusy(false);
            return;
          }
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Create user document in Firestore
        const userData: any = {
          firstName: capitalizeName(firstName),
          lastName: capitalizeName(lastName),
          email: email,
          role: requestedRole === "board" || requestedRole === "sponsor" ? "member" : requestedRole,
          requestedRole: requestedRole === "board" || requestedRole === "sponsor" ? requestedRole : null,
          inClubHours: 0,
          outOfClubHours: 0,
          summerHoursRaw: 0,
          effectiveTotalHours: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        // Only add member-specific fields
        if (requestedRole !== "parent") {
          userData.grade = grade;
          userData.phone = phone.replace(/\D/g, ''); // Store only the 10 digits
        } else {
          userData.parentRequestedStudentName = capitalizeName(childName);
        }
        
        await setDoc(doc(db, "users", user.uid), userData);
        
        const needsApproval = requestedRole === "board" || requestedRole === "sponsor";
        toast.success(
          needsApproval
            ? `Account created as Member. Your ${requestedRole} request is pending review.`
            : "Account created. You're signed in."
        );
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      nav({ to: "/dashboard" });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Auth error:", err);
      // eslint-disable-next-line no-console
      console.error("Error code:", err?.code);
      // eslint-disable-next-line no-console
      console.error("Error message:", err?.message);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: "signin" | "signup") {
    setMode(next);
    setHasScrolledRules(false);
    setRulesAccepted(false);
    nav({ to: "/auth", search: { mode: next }, replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>{mode === "signin" ? "Sign in" : "Create account"}</CardTitle>
            {mode === "signup" && (
              <p className="text-sm text-muted-foreground">Fields marked with * are required</p>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {mode === "signup" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="fn">First name *</Label>
                      <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ln">Last name *</Label>
                      <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rr">Requested role *</Label>
                    <select id="rr" value={requestedRole} onChange={(e) => setRequestedRole(e.target.value as RequestedRole)} required
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm h-9">
                      <option value="member">Member</option>
                      <option value="parent">Parent</option>
                      <option value="board">Board (requires approval)</option>
                      <option value="sponsor">Sponsor (requires sponsor approval)</option>
                    </select>
                    {(requestedRole === "board" || requestedRole === "sponsor") && (
                      <p className="text-xs text-muted-foreground">
                        You'll start as a Member until a {requestedRole === "sponsor" ? "sponsor" : "board member or sponsor"} approves your request.
                      </p>
                    )}
                  </div>
                  {requestedRole === "parent" ? (
                    <div className="space-y-1">
                      <Label htmlFor="cn">Child's name *</Label>
                      <Input id="cn" value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="Your child's full name" required />
                      <p className="text-xs text-muted-foreground">A board member will review and link your account to your child.</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="ph">Phone number *</Label>
                        <Input
                          id="ph"
                          type="tel"
                          value={phone}
                          onChange={(e) => {
                            // Only allow numbers, parentheses, and dashes
                            const value = e.target.value.replace(/[^0-9()\-]/g, '');
                            // Ensure no more than 10 digits
                            const digits = value.replace(/\D/g, '');
                            if (digits.length <= 10) {
                              setPhone(value);
                            }
                          }}
                          placeholder="(555) 555-5555"
                          required
                        />
                        {phone.replace(/\D/g, '').length > 0 && phone.replace(/\D/g, '').length < 10 && (
                          <p className="text-xs text-muted-foreground">Phone number must have exactly 10 digits</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="gr">Grade *</Label>
                        <select id="gr" value={grade} onChange={(e) => setGrade(e.target.value)} required
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm h-9">
                          <option>Freshman</option><option>Sophomore</option><option>Junior</option><option>Senior</option>
                        </select>
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="space-y-1">
                <Label htmlFor="em">{mode === "signup" && requestedRole !== "parent" ? "School Email *" : "Email *"}</Label>
                <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                {mode === "signup" && requestedRole === "member" && email && !/^\d{7}@lcps\.org$/.test(email) && (
                  <p className="text-xs text-muted-foreground">Email must be a school email</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="pw">Password *</Label>
                <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              {mode === "signup" && (
                <div className="space-y-3">
                  {/* Header */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Rules & Expectations
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Please read the following carefully. You must scroll to the
                      bottom before you can agree and create your account.
                    </p>
                  </div>

                  {/* Scrollable rules box */}
                  <div
                    className="h-90 overflow-y-auto rounded-lg border border-border
                               bg-muted/30 p-4 text-sm text-foreground leading-relaxed
                               scroll-smooth"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      // Consider "scrolled to bottom" when within 8px of the bottom
                      if (el.scrollHeight - el.scrollTop - el.clientHeight <= 8) {
                        setHasScrolledRules(true);
                      }
                    }}
                  >
                    {/* Rules content — each bullet as its own paragraph for readability */}
                    <p className="mb-3 text-xs text-muted-foreground italic">
                      The Rules and Expectations of Broad Run Key Club may be updated
                      throughout the school year. Key Club members will be notified of
                      any changes.
                    </p>

                    <ul className="space-y-3 list-none p-0">
                      <li className="flex gap-2">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span>
                          Members represent Broad Run Key Club and should always maintain
                          a positive attitude, show respect towards others, and act
                          appropriately, no matter the type of interaction that takes place.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span>
                          Broad Run Key Club requires that members attend the monthly club
                          meetings throughout the school year. Meeting dates are posted on
                          the Broad Run Key Club website. Members are allowed two unexcused
                          absences (arriving to the meeting after it has already started,
                          failing to notify your absence 24 hours prior to the meeting,
                          etc.). Any member who is unable to attend a meeting should notify
                          the Key Club officers via email at {clubEmail} 24
                          hours prior to the meeting date. If you do not email Broad Run Key
                          Club, your absence will be marked as unexcused. Any student who
                          misses more than two meetings due to unexcused absences will no
                          longer be considered an active member in the club and will not be
                          eligible for a membership certificate at the end of the year.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span>
                          All members are required to earn a minimum of 30 service hours by
                          the deadline set by the Broad Run Key Club officers for the
                          {academicYear} school year. Members are highly recommended to have 15
                          hours completed for the mid-year hour check, but it is not
                          required. At least 15 of the 30 required service hours must be
                          in-club service hours. The rest of your hours can be either in or
                          out of club. If hours are completed and submitted before the
                          deadline, members are still required to attend general meetings
                          to remain an active member.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span>
                          Members are responsible for checking their own hours and notifying
                          their group leader or another board member with discrepancies prior to the deadline.
                          Members can check their hours anytime through this website. Hours
                          of volunteer service completed to meet requirements for membership
                          in another organization do not count toward Key Club service hours.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span>
                          Opportunities counted for in-club hours are those posted to our
                          Volunteering Opportunities document or any activities
                          sponsored or promoted by Broad Run High School Key Club.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span>
                          Out-of-club hours are not sponsored by BRHS Key Club, but may be
                          used toward your total hour count if approved by BRHS Key Club
                          before the event occurs. Members must email {clubEmail} 24 hours
                          before the event for hours to be counted. There is no minimum
                          requirement for these hours.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span>
                          All volunteer hours must be submitted via the hour submission form
                          on this website. Members must submit a photo clearly indicating
                          that they were at the event. If no photo is provided, the hours
                          will not be counted.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span>
                          If possible, we encourage members to follow Key Club on Instagram
                          ({instagramHandle}) to stay up-to-date on important information.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span>
                          The advisors of Broad Run Key Club shall determine, in their sole
                          discretion, whether hours submitted by any member meet the
                          requirements of the club. Any questions regarding whether an
                          activity will count as service hours should be submitted via email
                          at broadrunkeyclub@gmail.com.
                        </span>
                      </li>
                    </ul>

                    {/* Bottom anchor so the scroll detection fires reliably */}
                    <p className="mt-4 text-xs text-muted-foreground text-center">
                      — End of Rules & Expectations —
                    </p>
                  </div>

                  {/* Scroll prompt — shown until scrolled to bottom */}
                  {!hasScrolledRules && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <svg
                        className="w-3 h-3 animate-bounce shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                      Scroll to the bottom of the rules to continue.
                    </p>
                  )}

                  {/* Checkbox — disabled until scrolled to bottom */}
                  {hasScrolledRules && (
                    <div className="flex items-start gap-3 rounded-lg border border-border
                                    bg-background p-3">
                      <Checkbox
                        id="rules-accepted"
                        checked={rulesAccepted}
                        onCheckedChange={(checked) =>
                          setRulesAccepted(checked === true)
                        }
                        className="mt-0.5 shrink-0"
                      />
                      <Label
                        htmlFor="rules-accepted"
                        className="text-sm leading-snug cursor-pointer"
                      >
                        I have read and agree to the Broad Run Key Club Rules &
                        Expectations for the {academicYear} school year. I understand that
                        failure to meet these requirements may affect my membership
                        status.
                      </Label>
                    </div>
                  )}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={busy || (mode === "signup" && !rulesAccepted)}>
                {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              </Button>
              <button type="button" className="w-full text-sm text-muted-foreground hover:underline"
                onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}>
                {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
              </button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
