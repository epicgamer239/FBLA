import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback, Component } from "react";
import { Nav } from "@/components/nav";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import FontFamily from "@tiptap/extension-font-family";
import Underline from "@tiptap/extension-underline";
import { db } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  getDoc,
  collection,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { toast } from "sonner";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Link as LinkIcon,
  Undo,
  Redo,
  Eye,
  Pencil,
  Save,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/opportunities")({
  head: () => ({ meta: [{ title: "Hour Opportunities" }] }),
  component: OpportunitiesPage,
});

// ─── Types ─────────────────────────────────────────────────────────────────

interface Opportunity {
  id: string;
  title: string;
  description: string;
  link?: string;
  isOneDay: boolean;
  isDonation: boolean;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  date?: string; // YYYY-MM-DD (if isOneDay)
  maxHours?: number;
  hoursPerItem?: number;
  possibleHours?: number;
  createdAt: number;
}

// ─── Toolbar Component ───────────────────────────────────────────────────────
// Renders above the editor in edit mode only.
// Each button calls a Tiptap command on the shared editor instance.

function EditorToolbar({
  editor,
  autoSaveStatus,
  onManualSave,
  isSaving,
}: {
  editor: ReturnType<typeof useEditor>;
  autoSaveStatus: "idle" | "saving" | "saved" | "error";
  onManualSave: () => void;
  isSaving: boolean;
}) {
  if (!editor) return null;

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href ?? "";
    const url = window.prompt("Enter URL:", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  };

  const statusText =
    autoSaveStatus === "saving"
      ? "Saving…"
      : autoSaveStatus === "saved"
      ? "Saved to cloud ✓"
      : autoSaveStatus === "error"
      ? "Save failed — check connection"
      : "";

  return (
    <div className="info-editor-toolbar">
      {/* Undo / Redo */}
      <button
        className="toolbar-btn"
        title="Undo"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo size={14} />
      </button>
      <button
        className="toolbar-btn"
        title="Redo"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo size={14} />
      </button>

      <div className="toolbar-divider" />

      {/* Font family */}
      <select
        className="toolbar-select"
        style={{ width: 130 }}
        title="Font family"
        onChange={(e) =>
          editor.chain().focus().setFontFamily(e.target.value).run()
        }
        value={editor.getAttributes("textStyle").fontFamily ?? "Arial"}
      >
        <option value="Arial">Arial</option>
        <option value="Times New Roman">Times New Roman</option>
        <option value="Georgia">Georgia</option>
        <option value="Courier New">Courier New</option>
        <option value="Verdana">Verdana</option>
        <option value="Trebuchet MS">Trebuchet MS</option>
      </select>

      {/* Font size via heading levels + paragraph */}
      <select
        className="toolbar-select"
        style={{ width: 70 }}
        title="Text size"
        onChange={(e) => {
          const val = e.target.value;
          if (val === "p")
            editor.chain().focus().setParagraph().run();
          else
            editor
              .chain()
              .focus()
              .toggleHeading({ level: parseInt(val) as 1 | 2 | 3 | 4 })
              .run();
        }}
        value={
          editor.isActive("heading", { level: 1 })
            ? "1"
            : editor.isActive("heading", { level: 2 })
            ? "2"
            : editor.isActive("heading", { level: 3 })
            ? "3"
            : editor.isActive("heading", { level: 4 })
            ? "4"
            : "p"
        }
      >
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
        <option value="4">Heading 4</option>
        <option value="p">Normal</option>
      </select>

      <div className="toolbar-divider" />

      {/* Bold */}
      <button
        className={`toolbar-btn ${editor.isActive("bold") ? "is-active" : ""}`}
        title="Bold (Ctrl+B)"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={14} />
      </button>

      {/* Italic */}
      <button
        className={`toolbar-btn ${editor.isActive("italic") ? "is-active" : ""}`}
        title="Italic (Ctrl+I)"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={14} />
      </button>

      {/* Underline */}
      <button
        className={`toolbar-btn ${editor.isActive("underline") ? "is-active" : ""}`}
        title="Underline (Ctrl+U)"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon size={14} />
      </button>

      {/* Strikethrough */}
      <button
        className={`toolbar-btn ${editor.isActive("strike") ? "is-active" : ""}`}
        title="Strikethrough"
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={14} />
      </button>

      <div className="toolbar-divider" />

      {/* Text color */}
      <label className="toolbar-btn" title="Text color" style={{ position: "relative" }}>
        <span style={{ fontSize: 12, fontWeight: "bold" }}>A</span>
        <input
          type="color"
          style={{
            position: "absolute",
            opacity: 0,
            width: "100%",
            height: "100%",
            cursor: "pointer",
            top: 0,
            left: 0,
          }}
          onInput={(e) =>
            editor
              .chain()
              .focus()
              .setColor((e.target as HTMLInputElement).value)
              .run()
          }
        />
      </label>

      {/* Highlight */}
      <label className="toolbar-btn" title="Highlight color" style={{ position: "relative" }}>
        <span style={{ fontSize: 12, background: "#FFFF00", padding: "1px 2px" }}>H</span>
        <input
          type="color"
          style={{
            position: "absolute",
            opacity: 0,
            width: "100%",
            height: "100%",
            cursor: "pointer",
            top: 0,
            left: 0,
          }}
          onInput={(e) =>
            editor
              .chain()
              .focus()
              .setHighlight({ color: (e.target as HTMLInputElement).value })
              .run()
          }
        />
      </label>

      <div className="toolbar-divider" />

      {/* Alignment */}
      <button
        className={`toolbar-btn ${editor.isActive({ textAlign: "left" }) ? "is-active" : ""}`}
        title="Align left"
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft size={14} />
      </button>
      <button
        className={`toolbar-btn ${editor.isActive({ textAlign: "center" }) ? "is-active" : ""}`}
        title="Align center"
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter size={14} />
      </button>
      <button
        className={`toolbar-btn ${editor.isActive({ textAlign: "right" }) ? "is-active" : ""}`}
        title="Align right"
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight size={14} />
      </button>

      <div className="toolbar-divider" />

      {/* Lists */}
      <button
        className={`toolbar-btn ${editor.isActive("bulletList") ? "is-active" : ""}`}
        title="Bullet list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={14} />
      </button>
      <button
        className={`toolbar-btn ${editor.isActive("orderedList") ? "is-active" : ""}`}
        title="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={14} />
      </button>

      <div className="toolbar-divider" />

      {/* Link */}
      <button
        className={`toolbar-btn ${editor.isActive("link") ? "is-active" : ""}`}
        title="Insert link"
        onClick={setLink}
      >
        <LinkIcon size={14} />
      </button>

      {/* Auto-save status + manual save */}
      <span className="autosave-status">{statusText}</span>
      <Button
        size="sm"
        variant="outline"
        onClick={onManualSave}
        disabled={isSaving}
        className="ml-2 h-7 text-xs"
      >
        <Save size={12} className="mr-1" />
        Save now
      </Button>
    </div>
  );
}

// ─── Error Boundary for Guidelines Modal ───────────────────────────────────────

class GuidelinesModalErrorBoundary extends Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[GuidelinesModal] crashed:", error, info.componentStack);
    toast.error("Couldn't open the guidelines. Please refresh and try again.");
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

// ─── Guidelines Modal Component ───────────────────────────────────────────────────

function GuidelinesModal({
  isOpen,
  onClose,
  clubEmail,
}: {
  isOpen: boolean;
  onClose: () => void;
  clubEmail: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Out of Club Hours Request Guidelines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Email us at{" "}
            <a href={`mailto:${clubEmail}`} className="text-primary hover:underline">
              {clubEmail}
            </a>{" "}
            with any volunteer activities you do on your own time (e.g., youth groups, volunteering in organizations not listed here, etc.){" "}
            <strong>24 HOURS BEFORE THE ACTIVITY</strong> to get approval.
          </p>

          <div className="bg-muted p-4 rounded-lg">
            <p className="font-semibold mb-2">Important Note:</p>
            <p className="text-sm">
              This cannot comprise of hours counted towards another club, such as Mu Alpha Theta, Interact Club, NHS, etc.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Include ALL information in the email:</h3>
            <ul className="space-y-3">
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <div>
                  <strong>Description of the activity</strong> (what will you be doing)
                  <p className="text-sm text-muted-foreground mt-1">
                    Examples: Packing bags for the homeless, helping with set-up and clean-up at the local church bake sale, etc.
                  </p>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <div>
                  <strong>Event logistics</strong> (total duration of the activity, location, event organizer)
                  <p className="text-sm text-muted-foreground mt-1">
                    Duration examples: 9:00 am-11:30 am, 5:00 pm-9:00 pm, etc.<br />
                    Location examples: Claude Moore Park, Ashby Ponds, etc.<br />
                    Organizer examples: Women Giving Back, Loudoun Hunger Relief, INOVA, etc.
                  </p>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <div>
                  <strong>Event supervisor/organizer contact information</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    Examples: Email (janedoe@nonprofit.org), phone (703-000-0000), website (www.volunteerorganization.com), etc.
                  </p>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <div>
                  <strong>How many hours of volunteer time you will be completing</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    Examples: 5 hours, 30 minutes, etc.
                  </p>
                </div>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <div>
                  <strong>Written confirmation</strong> that you will take picture proof of yourself volunteering at this event to submit to the hours form after completion of the event
                </div>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <div>
                  <strong>Anything else you think we should know</strong> about the event/your participation in it
                  <p className="text-sm text-muted-foreground mt-1">
                    Examples: Registration links, etc.
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={onClose}>Close</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Opportunity Modal Component ───────────────────────────────────────────────

function OpportunityModal({
  isOpen,
  onClose,
  onSave,
  opportunity,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Opportunity>) => void;
  opportunity?: Opportunity;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [isOneDay, setIsOneDay] = useState(false);
  const [isDonation, setIsDonation] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [date, setDate] = useState("");
  const [maxHours, setMaxHours] = useState("");
  const [hoursPerItem, setHoursPerItem] = useState("");
  const [possibleHours, setPossibleHours] = useState("");

  // Reset form when modal opens or opportunity changes
  useEffect(() => {
    if (isOpen) {
      if (opportunity) {
        setTitle(opportunity.title || "");
        setDescription(opportunity.description || "");
        setLink(opportunity.link || "");
        setIsOneDay(opportunity.isOneDay || false);
        setIsDonation(opportunity.isDonation || false);
        setStartDate(opportunity.startDate || "");
        setEndDate(opportunity.endDate || "");
        setDate(opportunity.date || "");
        setMaxHours(opportunity.maxHours?.toString() || "");
        setHoursPerItem(opportunity.hoursPerItem?.toString() || "");
        setPossibleHours(opportunity.possibleHours?.toString() || "");
      } else {
        setTitle("");
        setDescription("");
        setLink("");
        setIsOneDay(false);
        setIsDonation(false);
        setStartDate("");
        setEndDate("");
        setDate("");
        setMaxHours("");
        setHoursPerItem("");
        setPossibleHours("");
      }
    }
  }, [isOpen, opportunity]);

  const handleSave = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    const data: Partial<Opportunity> = {
      title: title.trim(),
      description: description.trim(),
      link: link.trim(),
      isOneDay,
      isDonation,
    };

    if (isOneDay) {
      if (!date) {
        toast.error("Date is required for one-day events");
        return;
      }
      data.date = date;
    } else {
      if (!startDate) {
        toast.error("Start date is required");
        return;
      }
      data.startDate = startDate;
      data.endDate = endDate;
    }

    if (isDonation) {
      if (!maxHours || !hoursPerItem) {
        toast.error("Max hours and hours per item are required for donation events");
        return;
      }
      data.maxHours = parseFloat(maxHours);
      data.hoursPerItem = parseFloat(hoursPerItem);
    } else {
      if (!possibleHours) {
        toast.error("Possible hours is required");
        return;
      }
      data.possibleHours = parseFloat(possibleHours);
    }

    onSave(data);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{opportunity ? "Edit Opportunity" : "Add Opportunity"}</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X size={20} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter opportunity title"
            />
          </div>

          <div>
            <Label htmlFor="link">Link</Label>
            <Input
              id="link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Enter signup link or information URL"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isOneDay"
              checked={isOneDay}
              onCheckedChange={(checked) => setIsOneDay(checked as boolean)}
            />
            <Label htmlFor="isOneDay">One day event</Label>
          </div>

          {isOneDay ? (
            <div>
              <Label htmlFor="date">Date of event *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isDonation"
              checked={isDonation}
              onCheckedChange={(checked) => setIsDonation(checked as boolean)}
            />
            <Label htmlFor="isDonation">Donation event</Label>
          </div>

          {isDonation ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="maxHours">Max Hours *</Label>
                <Input
                  id="maxHours"
                  type="number"
                  step="0.5"
                  min="0"
                  value={maxHours}
                  onChange={(e) => setMaxHours(e.target.value)}
                  placeholder="e.g., 10"
                />
              </div>
              <div>
                <Label htmlFor="hoursPerItem">Hours Per Item *</Label>
                <Input
                  id="hoursPerItem"
                  type="number"
                  step="0.5"
                  min="0"
                  value={hoursPerItem}
                  onChange={(e) => setHoursPerItem(e.target.value)}
                  placeholder="e.g., 0.5"
                />
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="possibleHours">Possible Hours *</Label>
              <Input
                id="possibleHours"
                type="number"
                step="0.5"
                min="0"
                value={possibleHours}
                onChange={(e) => setPossibleHours(e.target.value)}
                placeholder="e.g., 5"
              />
            </div>
          )}

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter opportunity description"
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {opportunity ? "Update" : "Add"} Opportunity
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────

function OpportunitiesPage() {
  const { user, isReviewer } = useAuth();
  const { theme } = useTheme();

  // isReviewer should be true for 'board' and 'sponsor' roles.
  const isAdmin = isReviewer;

  const [isEditMode, setIsEditMode] = useState(false);
  const [loadedContentLight, setLoadedContentLight] = useState<string>("");
  const [loadedContentDark, setLoadedContentDark] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // Track whether the content loaded from Firestore has been set into
  // the editor. We only do this once on initial load (or when switching
  // from preview back to edit after a remote change).
  const editorInitialized = useRef(false);

  // Auto-save timer
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Opportunities state
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | undefined>();
  const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
  const [clubEmail, setClubEmail] = useState("broadrunkeyclub@gmail.com");

  // ── Load opportunities from Firestore ─────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "opportunities"), orderBy("createdAt", "desc")),
      (snapshot) => {
        const loaded = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Opportunity[];
        setOpportunities(loaded);
      },
      (error) => {
        console.error("Error loading opportunities:", error);
        toast.error("Could not load opportunities.");
      }
    );

    return () => unsubscribe();
  }, []);

  // ── Load club email from Firestore settings ───────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const settingsDoc = await getDoc(doc(db, "settings", "config"));
        if (settingsDoc.exists()) {
          const settingsData = settingsDoc.data();
          setClubEmail(settingsData.clubEmail || "broadrunkeyclub@gmail.com");
        }
      } catch (error) {
        console.error("Error loading club email:", error);
      }
    })();
  }, []);

  // ── Add new opportunity ─────────────────────────────────────────────────────
  const handleAddOpportunity = async (data: Partial<Opportunity>) => {
    try {
      await addDoc(collection(db, "opportunities"), {
        ...data,
        createdAt: Date.now(),
      });
      toast.success("Opportunity added successfully");
    } catch (error) {
      console.error("Error adding opportunity:", error);
      toast.error("Failed to add opportunity");
    }
  };

  // ── Edit opportunity ───────────────────────────────────────────────────────
  const handleEditOpportunity = async (data: Partial<Opportunity>) => {
    if (!editingOpportunity) return;
    try {
      await updateDoc(doc(db, "opportunities", editingOpportunity.id), data);
      toast.success("Opportunity updated successfully");
      setEditingOpportunity(undefined);
    } catch (error) {
      console.error("Error updating opportunity:", error);
      toast.error("Failed to update opportunity");
    }
  };

  // ── Delete opportunity ─────────────────────────────────────────────────────
  const handleDeleteOpportunity = async (id: string) => {
    if (!confirm("Are you sure you want to delete this opportunity?")) return;
    try {
      await deleteDoc(doc(db, "opportunities", id));
      toast.success("Opportunity deleted successfully");
    } catch (error) {
      console.error("Error deleting opportunity:", error);
      toast.error("Failed to delete opportunity");
    }
  };

  // ── Categorize opportunities ───────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeOpportunities = opportunities.filter((opp) => {
    const dateStr = opp.isOneDay ? opp.date : opp.startDate;
    if (!dateStr) return false;
    const oppDate = new Date(dateStr + 'T00:00:00');
    const endDateStr = opp.isOneDay ? dateStr : (opp.endDate || dateStr);
    const oppEndDate = new Date(endDateStr + 'T00:00:00');
    return oppDate.getTime() <= today.getTime() && oppEndDate.getTime() >= today.getTime();
  }).sort((a, b) => {
    const dateA = new Date((a.isOneDay ? a.date : a.startDate || '') + 'T00:00:00').getTime();
    const dateB = new Date((b.isOneDay ? b.date : b.startDate || '') + 'T00:00:00').getTime();
    return dateA - dateB;
  });

  const upcomingOpportunities = opportunities.filter((opp) => {
    const dateStr = opp.isOneDay ? opp.date : opp.startDate;
    if (!dateStr) return false;
    const oppDate = new Date(dateStr + 'T00:00:00');
    return oppDate.getTime() > today.getTime();
  }).sort((a, b) => {
    const dateA = new Date((a.isOneDay ? a.date : a.startDate || '') + 'T00:00:00').getTime();
    const dateB = new Date((b.isOneDay ? b.date : b.startDate || '') + 'T00:00:00').getTime();
    return dateA - dateB;
  });

  const pastOpportunities = opportunities.filter((opp) => {
    const endDateStr = opp.isOneDay ? opp.date : (opp.endDate || opp.startDate);
    if (!endDateStr) return false;
    const oppEndDate = new Date(endDateStr + 'T00:00:00');
    return oppEndDate.getTime() < today.getTime();
  }).sort((a, b) => {
    const dateA = new Date((a.isOneDay ? a.date : a.startDate || '') + 'T00:00:00').getTime();
    const dateB = new Date((b.isOneDay ? b.date : b.startDate || '') + 'T00:00:00').getTime();
    return dateB - dateA; // Most recent past first
  });

  // ── Tiptap editor instance ─────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit,           // Bold, italic, strike, lists, headings, undo/redo
      Underline,
      TextStyle,            // Required peer for Color and FontFamily
      Color,                // Text color via inline style
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false }),
      FontFamily,
    ],
    content: "",
    editable: false,        // Start read-only; switched to true in edit mode
    onUpdate: ({ editor }) => {
      // Only track changes when in edit mode
      if (!isEditMode) return;
      setHasUnsavedChanges(true);
      scheduleAutoSave(editor.getHTML());
    },
  });

  // ── Firestore: load content once, then stay live only in preview mode ──
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "settings", "config"),
      (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        
        // Load opportunities content
        let contentLight: string = data.opportunitiesContentLight ?? "";
        let contentDark: string = data.opportunitiesContentDark ?? "";

        setLoadedContentLight(contentLight);
        setLoadedContentDark(contentDark);

        // Only push content into the editor when:
        // 1. It hasn't been initialized yet (first load), OR
        // 2. We are in preview mode (not editing)
        // Never overwrite the editor during an active edit session.
        if (editor && (!editorInitialized.current || !isEditMode)) {
          const currentContent = theme === "dark" ? contentDark : contentLight;
          editor.commands.setContent(currentContent, false);
          editorInitialized.current = true;
        }
      },
      (error) => {
        console.error("Failed to load opportunities content:", error);
        toast.error("Could not load page content.");
      }
    );

    return () => unsubscribe();
    // NOTE: isEditMode intentionally omitted from deps — we do NOT want
    // this effect to re-subscribe every time edit mode toggles.
    // The isEditMode check inside the callback is a read, not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, theme]);

  // ── Toggle edit / preview mode ─────────────────────────────────────────
  const handleToggleMode = async () => {
    if (isEditMode) {
      // Switching from edit → preview:
      // Save unsaved changes first, then switch.
      if (hasUnsavedChanges) {
        await saveContent();
      }
      editor?.setEditable(false);
      setIsEditMode(false);
    } else {
      // Switching from preview → edit:
      // Make sure editor has the latest content for current theme, then enable editing.
      const currentContent = theme === "dark" ? loadedContentDark : loadedContentLight;
      if (currentContent) {
        editor?.commands.setContent(currentContent, false);
      }
      editor?.setEditable(true);
      editor?.commands.focus();
      setIsEditMode(true);
    }
  };

  // ── Handle theme changes while editing ─────────────────────────────────────
  useEffect(() => {
    if (!editor || !isEditMode) return;

    // When theme changes while in edit mode, save current and load the other theme's content
    const currentContent = editor.getHTML();
    const isDark = theme === "dark";

    if (isDark) {
      // Switching to dark mode: save current to light, load dark content
      setLoadedContentLight(currentContent);
      if (loadedContentDark) {
        editor.commands.setContent(loadedContentDark, false);
      }
    } else {
      // Switching to light mode: save current to dark, load light content
      setLoadedContentDark(currentContent);
      if (loadedContentLight) {
        editor.commands.setContent(loadedContentLight, false);
      }
    }
  }, [theme, isEditMode, editor, loadedContentLight, loadedContentDark]);

  // ── Save to Firestore ─────────────────────────────────────────────────
  const saveContent = useCallback(async () => {
    if (!editor) return;
    setIsSaving(true);
    setAutoSaveStatus("saving");
    try {
      const html = editor.getHTML();
      const isDark = theme === "dark";
      
      await updateDoc(doc(db, "settings", "config"), {
        [isDark ? "opportunitiesContentDark" : "opportunitiesContentLight"]: html,
        opportunitiesLastUpdated: serverTimestamp(),
        opportunitiesLastEditedBy: user?.uid ?? "unknown",
      });
      
      // Update local state
      if (isDark) {
        setLoadedContentDark(html);
      } else {
        setLoadedContentLight(html);
      }
      
      setHasUnsavedChanges(false);
      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus("idle"), 2500);
    } catch (err) {
      console.error("Save failed:", err);
      setAutoSaveStatus("error");
      toast.error("Save failed. Check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }, [editor, user?.uid, theme, loadedContentLight, loadedContentDark]);

  // ── Debounced auto-save ───────────────────────────────────────────────
  const scheduleAutoSave = useCallback(
    (_html: string) => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      setAutoSaveStatus("saving");
      autoSaveTimer.current = setTimeout(() => {
        saveContent();
      }, 6000); // 6-second debounce after last keystroke
    },
    [saveContent]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && isEditMode) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, isEditMode]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        {/* ── Guidelines Button ── */}
        <Button
          className="w-full h-12 text-base font-semibold"
          onClick={() => setIsGuidelinesOpen(true)}
        >
          Out of Club Hours Guidelines
        </Button>

        {/* ── Admin toggle bar ── */}
        {isAdmin && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {/* {isEditMode ? (
                <>
                  <Pencil size={14} />
                  <span>Editing</span>
                </>
              ) : (
                <>
                  <Eye size={14} />
                  <span>Preview</span>
                </>
              )} */}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingOpportunity(undefined);
                  setIsModalOpen(true);
                }}
              >
                <Plus size={14} className="mr-1.5" />
                Add Opportunity
              </Button>
              {/* <Button
                variant={isEditMode ? "default" : "outline"}
                size="sm"
                onClick={handleToggleMode}
                disabled={isSaving}
              >
                {isEditMode ? (
                  <>
                    <Eye size={14} className="mr-1.5" />
                    {isSaving ? "Saving…" : "Back to Preview"}
                  </>
                ) : (
                  <>
                    <Pencil size={14} className="mr-1.5" />
                    Edit Page
                  </>
                )}
              </Button> */}
            </div>
          </div>
        )}

        {/* ── Currently Active Opportunities ── */}
        {activeOpportunities.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Currently Active Opportunities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeOpportunities.map((opp) => (
                <div key={opp.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{opp.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {opp.isOneDay ? (
                          new Date(opp.date + 'T00:00:00').toLocaleDateString()
                        ) : (
                          `${new Date(opp.startDate + 'T00:00:00').toLocaleDateString()} - ${opp.endDate ? new Date(opp.endDate + 'T00:00:00').toLocaleDateString() : 'Ongoing'}`
                        )}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingOpportunity(opp);
                            setIsModalOpen(true);
                          }}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteOpportunity(opp.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                  {opp.description && (
                    <p className="text-sm">{opp.description}</p>
                  )}
                  {opp.link && (
                    <a
                      href={opp.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary underline"
                    >
                      More information
                    </a>
                  )}
                  <div className="text-sm font-medium">
                    {opp.isDonation ? (
                      `Max: ${opp.maxHours} hours | ${opp.hoursPerItem} hours per item`
                    ) : (
                      `Possible Hours: ${opp.possibleHours}`
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Upcoming Opportunities ── */}
        {upcomingOpportunities.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Opportunities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {upcomingOpportunities.map((opp) => (
                <div key={opp.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{opp.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {opp.isOneDay ? (
                          new Date(opp.date + 'T00:00:00').toLocaleDateString()
                        ) : (
                          `${new Date(opp.startDate + 'T00:00:00').toLocaleDateString()} - ${opp.endDate ? new Date(opp.endDate + 'T00:00:00').toLocaleDateString() : 'Ongoing'}`
                        )}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingOpportunity(opp);
                            setIsModalOpen(true);
                          }}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteOpportunity(opp.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                  {opp.description && (
                    <p className="text-sm">{opp.description}</p>
                  )}
                  {opp.link && (
                    <a
                      href={opp.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary underline"
                    >
                      More information
                    </a>
                  )}
                  <div className="text-sm font-medium">
                    {opp.isDonation ? (
                      `Max: ${opp.maxHours} hours | ${opp.hoursPerItem} hours per item`
                    ) : (
                      `Possible Hours: ${opp.possibleHours}`
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Toolbar (edit mode only) ── */}
        {/* {isAdmin && isEditMode && (
          <EditorToolbar
            editor={editor}
            autoSaveStatus={autoSaveStatus}
            onManualSave={saveContent}
            isSaving={isSaving}
          />
        )} */}

        {/* ── Document area ── */}
        {/* <Card>
          <CardHeader>
            <CardTitle>Hour Opportunities</CardTitle>
          </CardHeader>
          <CardContent className="info-editor-container p-6">
            <EditorContent editor={editor} />
          </CardContent>
        </Card> */}

        {/* ── Past Opportunities ── */}
        {pastOpportunities.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Past Opportunities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pastOpportunities.map((opp) => (
                <div key={opp.id} className="border rounded-lg p-4 space-y-2 opacity-75">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{opp.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {opp.isOneDay ? (
                          new Date(opp.date + 'T00:00:00').toLocaleDateString()
                        ) : (
                          `${new Date(opp.startDate + 'T00:00:00').toLocaleDateString()} - ${opp.endDate ? new Date(opp.endDate + 'T00:00:00').toLocaleDateString() : 'Ongoing'}`
                        )}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingOpportunity(opp);
                            setIsModalOpen(true);
                          }}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteOpportunity(opp.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                  {opp.description && (
                    <p className="text-sm">{opp.description}</p>
                  )}
                  {opp.link && (
                    <a
                      href={opp.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary underline"
                    >
                      More information
                    </a>
                  )}
                  <div className="text-sm font-medium">
                    {opp.isDonation ? (
                      `Max: ${opp.maxHours} hours | ${opp.hoursPerItem} hours per item`
                    ) : (
                      `Possible Hours: ${opp.possibleHours}`
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Opportunity Modal ── */}
        <OpportunityModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingOpportunity(undefined);
          }}
          onSave={editingOpportunity ? handleEditOpportunity : handleAddOpportunity}
          opportunity={editingOpportunity}
        />

        {/* ── Guidelines Modal ── */}
        <GuidelinesModalErrorBoundary onError={() => setIsGuidelinesOpen(false)}>
          <GuidelinesModal
            isOpen={isGuidelinesOpen}
            onClose={() => setIsGuidelinesOpen(false)}
            clubEmail={clubEmail || "broadrunkeyclub@gmail.com"}
          />
        </GuidelinesModalErrorBoundary>
      </main>
    </div>
  );
}
