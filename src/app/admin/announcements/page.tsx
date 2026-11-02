"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, deleteField, collection, getDocs, addDoc, deleteDoc, query, where, orderBy } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Pencil, Trash2, Plus } from "lucide-react";

type Settings = {
  reminderEmails: boolean;
  summerHoursCap: number;
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
  autoAbsenceWarnings: boolean;
  meetingReminders: boolean;
  parentMeetingReminders: boolean;
};

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  recipientType: 'all' | 'members' | 'members-parents' | 'admin' | 'specific';
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

function AnnouncementsPage() {
  const { user, loading, isReviewer } = useAuth();
  const router = useRouter();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Custom email form state
  const [customEmail, setCustomEmail] = useState({
    subject: "",
    body: "",
    recipientType: "all" as "all" | "members" | "members-parents" | "admin" | "specific",
    specificRecipients: [] as string[],
  });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; email: string; displayName: string; role: string }>>([]);
  const [specificRecipientSearch, setSpecificRecipientSearch] = useState("");
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [clubEmail, setClubEmail] = useState("broadrunkeyclub@gmail.com");

  useEffect(() => {
    if (loading) return;
    if (!user) router.push("/auth");
    else if (!isReviewer) { toast.error("Reviewers only."); router.push("/"); }
  }, [loading, user, isReviewer, router]);

  useEffect(() => {
    if (!isReviewer) return;
    
    // Load settings
    (async () => {
      try {
        const settingsDoc = await getDoc(doc(db, "settings", "config"));
        if (!settingsDoc.exists()) {
          console.log("Settings document does not exist, creating with defaults");
          const defaultSettings: Settings = {
            reminderEmails: false,
            summerHoursCap: 10,
            hourGoalFreshman: 30,
            hourGoalSophomore: 30,
            hourGoalJunior: 30,
            hourGoalSenior: 30,
            allowRegistration: true,
            allowTeamChanges: true,
            infoPageContentLight: "",
            infoPageContentDark: "",
            autoAbsenceWarnings: false,
            meetingReminders: false,
            parentMeetingReminders: false,
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
        setClubEmail(settingsData.clubEmail || "broadrunkeyclub@gmail.com");
      } catch (error) {
        console.error("Error loading settings:", error);
        toast.error("Failed to load settings. Check console for details.");
        setS(null);
      }
    })();

    // Load email templates
    (async () => {
      try {
        const templatesSnap = await getDocs(collection(db, "emailTemplates"));
        const templatesData = templatesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as EmailTemplate[];
        setTemplates(templatesData);
      } catch (error) {
        console.error("Error loading email templates:", error);
      }
    })();

    // Load all users for specific recipient selection
    (async () => {
      try {
        const usersSnapshot = await getDocs(query(collection(db, "users"), orderBy("lastName")));
        const users = usersSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .map((u: any) => ({
            id: u.id,
            email: u.email,
            displayName: `${u.firstName} ${u.lastName}`,
            role: u.role,
          }));
        setAllUsers(users);
      } catch (error) {
        console.error("Error loading users:", error);
      }
    })();
  }, [isReviewer]);

  async function createDefaultTemplate(name: string, displayName: string, subject: string, body: string, recipientType: 'all' | 'members' | 'members-parents' | 'admin') {
    const newTemplate = {
      name,
      subject,
      body,
      recipientType,
      isActive: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setBusy(true);
    try {
      const docRef = await addDoc(collection(db, "emailTemplates"), newTemplate);
      toast.success(`${displayName} template created.`);
      
      // Reload templates
      const templatesSnap = await getDocs(collection(db, "emailTemplates"));
      const templatesData = templatesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as EmailTemplate[];
      setTemplates(templatesData);
      
      // Open edit modal with the new template
      const newTemplateData = templatesData.find(t => t.id === docRef.id);
      if (newTemplateData) {
        setEditingTemplate(newTemplateData);
        setIsEditModalOpen(true);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create template");
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (!editingTemplate) return;
    if (!editingTemplate.name.trim() || !editingTemplate.subject.trim() || !editingTemplate.body.trim()) {
      return toast.error("Please fill in all fields.");
    }

    setBusy(true);
    try {
      if (editingTemplate.id) {
        // Update existing template
        await updateDoc(doc(db, "emailTemplates", editingTemplate.id), {
          name: editingTemplate.name,
          subject: editingTemplate.subject,
          body: editingTemplate.body,
          recipientType: editingTemplate.recipientType,
          updatedAt: Date.now(),
        });
        toast.success("Template saved.");
      } else {
        // Create new template
        const docRef = await addDoc(collection(db, "emailTemplates"), {
          name: editingTemplate.name,
          subject: editingTemplate.subject,
          body: editingTemplate.body,
          recipientType: editingTemplate.recipientType,
          isActive: editingTemplate.isActive,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        toast.success("Template created.");
        
        // Reload templates
        const templatesSnap = await getDocs(collection(db, "emailTemplates"));
        const templatesData = templatesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as EmailTemplate[];
        setTemplates(templatesData);
        
        // Open edit modal with the new template
        const newTemplateData = templatesData.find(t => t.id === docRef.id);
        if (newTemplateData) {
          setEditingTemplate(newTemplateData);
        }
      }
      setIsEditModalOpen(false);
      
      // Reload templates for updates
      const templatesSnap = await getDocs(collection(db, "emailTemplates"));
      const templatesData = templatesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as EmailTemplate[];
      setTemplates(templatesData);
    } catch (error: any) {
      toast.error(error.message || "Failed to save template");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(templateId: string) {
    if (!confirm("Are you sure you want to delete this template?")) return;
    
    setBusy(true);
    try {
      await deleteDoc(doc(db, "emailTemplates", templateId));
      toast.success("Template deleted.");
      
      // Reload templates
      const templatesSnap = await getDocs(collection(db, "emailTemplates"));
      const templatesData = templatesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as EmailTemplate[];
      setTemplates(templatesData);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete template");
    } finally {
      setBusy(false);
    }
  }

  async function sendCustomEmail() {
    if (!customEmail.subject.trim() || !customEmail.body.trim()) {
      toast.error('Subject and message body are required.');
      return;
    }

    if (customEmail.recipientType === 'specific' && customEmail.specificRecipients.length === 0) {
      toast.error('Please select at least one specific recipient.');
      return;
    }

    const appsScriptUrl = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL;
    if (!appsScriptUrl) {
      toast.error('Email service is not configured. Contact a developer.');
      return;
    }

    setSendingEmail(true);

    try {
      // Get current user for authentication
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error('You must be logged in to send emails.');
        setSendingEmail(false);
        return;
      }

      const webhookSecret = process.env.NEXT_PUBLIC_WEBHOOK_SECRET;
      if (!webhookSecret) {
        toast.error('Email service secret not configured. Contact a developer.');
        setSendingEmail(false);
        return;
      }
      const uid = currentUser.uid;

      // Build recipient list from Firestore based on the selected recipient type
      let recipients: string[] = [];
      
      if (customEmail.recipientType === 'specific') {
        recipients = customEmail.specificRecipients;
      } else {
        let recipientQuery;
        if (customEmail.recipientType === 'all') {
          recipientQuery = query(collection(db, 'users'));
        } else if (customEmail.recipientType === 'members') {
          // Send to actual members only
          recipientQuery = query(
            collection(db, 'users'),
            where('role', '==', 'member')
          );
        } else if (customEmail.recipientType === 'members-parents') {
          // Send to members and parents only
          recipientQuery = query(
            collection(db, 'users'),
            where('role', 'in', ['member', 'parent'])
          );
        } else if (customEmail.recipientType === 'admin') {
          // Send to coordinators and sponsors
          recipientQuery = query(
            collection(db, 'users'),
            where('role', 'in', ['board', 'sponsor'])
          );
        } else {
          recipientQuery = query(collection(db, 'users'));
        }

        const snapshot = await getDocs(recipientQuery);
        recipients = snapshot.docs
          .map(d => d.data().email as string)
          .filter(Boolean);
      }

      if (recipients.length === 0) {
        toast.error('No recipients found for the selected group.');
        setSendingEmail(false);
        return;
      }

      // Call the Apps Script web app endpoint.
      // Content-Type is intentionally omitted (defaults to text/plain)
      // to avoid CORS preflight on the Apps Script endpoint.
      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        body: JSON.stringify({
          webhookSecret,
          uid,
          recipients,
          subject: customEmail.subject.trim(),
          body: customEmail.body.trim(),
        }),
        redirect: 'follow',
      });

      // Read raw text first so we can log it even if JSON parsing fails
      const rawText = await response.text();
      console.log('[Email] Apps Script response status:', response.status);
      console.log('[Email] Apps Script raw response:', rawText);

      let result;
      try {
        result = JSON.parse(rawText);
      } catch (parseErr) {
        console.error('[Email] Response was not valid JSON. Raw body logged above.');
        toast.error(
          'Email service returned an unexpected response (status ' +
          response.status + '). Check the browser console for details.'
        );
        setSendingEmail(false);
        return;
      }

      if (result.error) {
        console.error('[Email] Apps Script returned error:', result.error);
        toast.error('Email failed: ' + result.error);
      } else {
        toast.success(
          'Email sent to ' + result.sent + ' recipient' +
          (result.sent !== 1 ? 's' : '') + '.'
        );
        if (result.errors && result.errors.length > 0) {
          console.warn('[Email] Some recipients failed:', result.errors);
        }
        // Clear the form after successful send
        setCustomEmail({ subject: "", body: "", recipientType: "all", specificRecipients: [] });
        setSpecificRecipientSearch("");
        setShowMemberDropdown(false);
      }

    } catch (err) {
      console.error('[Email] Fetch threw an exception:', err);
      console.error('[Email] Error type:', err instanceof TypeError ? 'TypeError (likely network/CORS)' : typeof err);
      toast.error(
        'Failed to reach the email service. Open the browser console (F12) ' +
        'and check for the [Email] error lines to diagnose the issue.'
      );
    } finally {
      setSendingEmail(false);
    }
  }

  if (!s) return (<div className="min-h-screen bg-background"><Nav /><main className="p-8 text-muted-foreground">Loading…</main></div>);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Announcements & Email</h1>

        {/* Email Automation Settings */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Automated Emails</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-gray-500 mb-4">
                Emails are sent from {clubEmail}. Make sure email
                automation is configured in Firebase before enabling these.
              </p>

              <div className="space-y-4">
                {/* Meeting Reminder Emails Toggle */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3 flex-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const meetingReminderTemplate = templates.find(t => t.name === 'meeting-reminder');
                        if (meetingReminderTemplate) {
                          setEditingTemplate(meetingReminderTemplate);
                          setIsEditModalOpen(true);
                        } else {
                          // Create the template if it doesn't exist
                          createDefaultTemplate('meeting-reminder', 'Meeting Reminder', 'Meeting Reminder for {month} {meetingDate}', 'Hi {name},\n\nThis is a reminder that we have a ServeTrack meeting tomorrow, {month} {meetingDate}. Please make sure to attend.\n\nThanks,\nServeTrack Board', 'all');
                        }
                      }}
                    >
                      <Pencil size={14} />
                    </Button>
                    <div className="flex-1">
                      <p className="font-medium">Meeting Reminder Emails (Members)</p>
                      <p className="text-sm text-gray-500">
                        Emails all members the morning before each scheduled meeting
                        (8:30 AM). Excludes members who are already excused from the meeting.
                        Currently disabled — enable only after confirming email delivery is working correctly.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={s.meetingReminders}
                    onCheckedChange={async (checked) => {
                      setS({ ...s, meetingReminders: checked });
                      try {
                        await updateDoc(doc(db, "settings", "config"), {
                          meetingReminders: checked,
                        });
                        toast.success("Meeting reminders updated.");
                      } catch (error: any) {
                        toast.error(error.message || "Failed to update setting");
                        setS({ ...s, meetingReminders: !checked }); // Revert on error
                      }
                    }}
                  />
                </div>

                {/* Parent Meeting Reminder Emails Toggle */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3 flex-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const parentMeetingReminderTemplate = templates.find(t => t.name === 'parent-meeting-reminder');
                        if (parentMeetingReminderTemplate) {
                          setEditingTemplate(parentMeetingReminderTemplate);
                          setIsEditModalOpen(true);
                        } else {
                          // Create the template if it doesn't exist
                          createDefaultTemplate('parent-meeting-reminder', 'Parent Meeting Reminder', 'Meeting Reminder for {month} {meetingDate}', 'Hi {name},\n\nThis is a reminder that your child has a ServeTrack meeting tomorrow, {month} {meetingDate}. Please encourage them to attend.\n\nThanks,\nServeTrack Board', 'all');
                        }
                      }}
                    >
                      <Pencil size={14} />
                    </Button>
                    <div className="flex-1">
                      <p className="font-medium">Meeting Reminder Emails (Parents)</p>
                      <p className="text-sm text-gray-500">
                        Emails parents the morning before each scheduled meeting (8:30 AM).
                        Only sends if their child is not excused from the meeting. If a parent has multiple children,
                        sends if any child is not excused. Currently disabled — enable only after confirming email delivery is working correctly.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={s.parentMeetingReminders}
                    onCheckedChange={async (checked) => {
                      setS({ ...s, parentMeetingReminders: checked });
                      try {
                        await updateDoc(doc(db, "settings", "config"), {
                          parentMeetingReminders: checked,
                        });
                        toast.success("Parent meeting reminders updated.");
                      } catch (error: any) {
                        toast.error(error.message || "Failed to update setting");
                        setS({ ...s, parentMeetingReminders: !checked }); // Revert on error
                      }
                    }}
                  />
                </div>

                {/* Automatic Missed Meeting Emails Toggle */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3 flex-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const absenceWarningTemplate = templates.find(t => t.name === 'absence-warning');
                        if (absenceWarningTemplate) {
                          setEditingTemplate(absenceWarningTemplate);
                          setIsEditModalOpen(true);
                        } else {
                          // Create the template if it doesn't exist
                          createDefaultTemplate('absence-warning', 'Absence Warning', 'Absence Warning - {month} {meetingDate}', 'Hi {name},\n\nWe noticed you missed our ServeTrack meeting on {month} {meetingDate}. Please make sure to attend future meetings.\n\nIf you have any questions or there was a reason for your absence, please let us know.\n\nThanks,\nServeTrack Board', 'all');
                        }
                      }}
                    >
                      <Pencil size={14} />
                    </Button>
                    <div className="flex-1">
                      <p className="font-medium">Automatic Missed Meeting Emails</p>
                      <p className="text-sm text-gray-500">
                        Emails members who missed a meeting the morning after it
                        occurs (8:30 AM). Only triggers on days immediately
                        following a scheduled meeting date.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={s.autoAbsenceWarnings}
                    onCheckedChange={async (checked) => {
                      setS({ ...s, autoAbsenceWarnings: checked });
                      try {
                        await updateDoc(doc(db, "settings", "config"), {
                          autoAbsenceWarnings: checked,
                        });
                        toast.success("Absence warnings updated.");
                      } catch (error: any) {
                        toast.error(error.message || "Failed to update setting");
                        setS({ ...s, autoAbsenceWarnings: !checked }); // Revert on error
                      }
                    }}
                  />
                </div>

                {/* Create New Automated Email Button */}
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingTemplate({
                      id: '',
                      name: '',
                      subject: '',
                      body: '',
                      recipientType: 'all',
                      isActive: true,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    });
                    setIsEditModalOpen(true);
                  }}
                  className="w-full"
                >
                  <Plus size={16} className="mr-2" />
                  Create New Automated Email
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custom Email Drafting */}
        <Card>
          <CardHeader>
            <CardTitle>Send Custom Email</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="recipientType">Recipients</Label>
                <select
                  id="recipientType"
                  value={customEmail.recipientType}
                  onChange={(e) => {
                    setCustomEmail({ ...customEmail, recipientType: e.target.value as any, specificRecipients: [] });
                    setSpecificRecipientSearch("");
                    setShowMemberDropdown(false);
                  }}
                  className="w-full mt-1 p-2 border rounded-md bg-background text-foreground"
                >
                  <option value="all">All Club Members</option>
                  <option value="members">Members Only</option>
                  <option value="members-parents">Members & Parents Only</option>
                  <option value="admin">Admin Only (Board & Sponsors)</option>
                  <option value="specific">Specific Member(s)</option>
                </select>
              </div>

              {customEmail.recipientType === 'specific' && (
                <div className="relative">
                  <Label htmlFor="specificRecipient">Select Member(s)</Label>
                  <Input
                    id="specificRecipient"
                    type="text"
                    value={specificRecipientSearch}
                    onChange={(e) => {
                      setSpecificRecipientSearch(e.target.value);
                      setShowMemberDropdown(true);
                    }}
                    onFocus={() => setShowMemberDropdown(true)}
                    onBlur={() => setTimeout(() => setShowMemberDropdown(false), 200)}
                    placeholder="Search by name or email..."
                    className="w-full mt-1"
                  />
                  {/* Selected recipients chips */}
                  {customEmail.specificRecipients.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {customEmail.specificRecipients.map(email => {
                        const user = allUsers.find(u => u.email === email);
                        return (
                          <div
                            key={email}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded-md text-sm"
                          >
                            <span>{user?.displayName || email}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setCustomEmail({
                                  ...customEmail,
                                  specificRecipients: customEmail.specificRecipients.filter(r => r !== email)
                                });
                              }}
                              className="ml-1 hover:text-red-200"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {showMemberDropdown && specificRecipientSearch && (
                    <div className="absolute z-10 w-full mt-1 border rounded-md max-h-48 overflow-y-auto bg-background shadow-lg">
                      {allUsers
                        .filter(user => 
                          !customEmail.specificRecipients.includes(user.email) &&
                          (user.displayName.toLowerCase().includes(specificRecipientSearch.toLowerCase()) ||
                          user.email.toLowerCase().includes(specificRecipientSearch.toLowerCase()))
                        )
                        .slice(0, 10)
                        .map(user => (
                          <div
                            key={user.id}
                            onMouseDown={() => {
                              setCustomEmail({
                                ...customEmail,
                                specificRecipients: [...customEmail.specificRecipients, user.email]
                              });
                              setSpecificRecipientSearch("");
                              setShowMemberDropdown(false);
                            }}
                            className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                          >
                            <div className="font-medium">{user.displayName}</div>
                            <div className="text-sm text-muted-foreground">{user.email}</div>
                            <div className="text-xs text-muted-foreground">Role: {user.role}</div>
                          </div>
                        ))}
                      {allUsers.filter(user => 
                        !customEmail.specificRecipients.includes(user.email) &&
                        (user.displayName.toLowerCase().includes(specificRecipientSearch.toLowerCase()) ||
                        user.email.toLowerCase().includes(specificRecipientSearch.toLowerCase()))
                      ).length === 0 && (
                        <div className="p-2 text-muted-foreground">No users found</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={customEmail.subject}
                  onChange={(e) => setCustomEmail({ ...customEmail, subject: e.target.value })}
                  placeholder="Email subject"
                />
              </div>

              <div>
                <Label htmlFor="body">Message</Label>
                <Textarea
                  id="body"
                  value={customEmail.body}
                  onChange={(e) => setCustomEmail({ ...customEmail, body: e.target.value })}
                  placeholder="Write your email message here... Use {name} for recipient name"
                  rows={8}
                />
              </div>

              <Button
                onClick={sendCustomEmail}
                disabled={sendingEmail}
                className="w-full"
              >
                {sendingEmail ? "Sending…" : "Send Email"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Edit Template Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl [&_[data-radix-dialog-close]]:hidden">
          <DialogHeader>
            <DialogTitle>{editingTemplate?.id ? 'Edit Email Template' : 'Create Email Template'}</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="templateName">Template Name</Label>
                <Input
                  id="templateName"
                  value={editingTemplate.name}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                  placeholder="e.g., Monthly Newsletter"
                />
              </div>
              <div>
                <Label htmlFor="templateSubject">Subject</Label>
                <Input
                  id="templateSubject"
                  value={editingTemplate.subject}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                  placeholder="Use {name}, {month}, {meetingDate} for variables"
                />
              </div>
              <div>
                <Label htmlFor="templateBody">Body</Label>
                <Textarea
                  id="templateBody"
                  value={editingTemplate.body}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                  rows={8}
                  placeholder="Use {name}, {month}, {meetingDate} for variables"
                />
              </div>
              <div>
                <Label htmlFor="templateRecipientType">Recipient Type</Label>
                <select
                  id="templateRecipientType"
                  value={editingTemplate.recipientType}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, recipientType: e.target.value as any })}
                  disabled={editingTemplate.name === 'meeting-reminder' || editingTemplate.name === 'parent-meeting-reminder'}
                  className="w-full mt-1 p-2 border rounded-md bg-background text-foreground"
                >
                  <option value="all">All Club Members</option>
                  <option value="members">Members Only</option>
                  <option value="members-parents">Members & Parents Only</option>
                  <option value="admin">Admin Only (Board & Sponsors)</option>
                  <option value="specific">Specific Member(s)</option>
                </select>
                {(editingTemplate.name === 'meeting-reminder' || editingTemplate.name === 'parent-meeting-reminder') && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Recipient type is fixed for automated meeting reminders.
                  </p>
                )}
              </div>
              {!editingTemplate.id && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="templateActive"
                    checked={editingTemplate.isActive}
                    onCheckedChange={(checked) => setEditingTemplate({ ...editingTemplate, isActive: checked })}
                  />
                  <Label htmlFor="templateActive">Active</Label>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {editingTemplate?.id && (
              <Button
                variant="destructive"
                onClick={() => {
                  if (editingTemplate && confirm("Are you sure you want to delete this template?")) {
                    deleteTemplate(editingTemplate.id);
                    setIsEditModalOpen(false);
                  }
                }}
                disabled={busy}
              >
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate} disabled={busy}>{busy ? "Saving…" : editingTemplate?.id ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AnnouncementsPage;
