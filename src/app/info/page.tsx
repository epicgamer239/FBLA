"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

// ─── Main Page Component ─────────────────────────────────────────────────────

function InfoPage() {
  const { user, isReviewer } = useAuth();
  const { theme } = useTheme();

  // isReviewer should be true for 'board' and 'sponsor' roles.
  // Adjust this check if your useAuth hook uses different field names.
  const isAdmin = isReviewer;

  const [isEditMode, setIsEditMode] = useState(false);
  const [loadedContentLight, setLoadedContentLight] = useState<string>("");
  const [loadedContentDark, setLoadedContentDark] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [meetingDates, setMeetingDates] = useState<Record<string, { date: string; note: string; published: boolean; visible: boolean }>>({});

  // Track whether the content loaded from Firestore has been set into
  // the editor. We only do this once on initial load (or when switching
  // from preview back to edit after a remote change).
  const editorInitialized = useRef(false);

  // Auto-save timer
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        
        // Handle migration from old single field to new dual fields
        let contentLight: string = data.infoPageContentLight ?? "";
        let contentDark: string = data.infoPageContentDark ?? "";
        
        // If old field exists but new fields don't, migrate content
        if (data.infoPageContent && !contentLight && !contentDark) {
          contentLight = data.infoPageContent;
          contentDark = data.infoPageContent;
          // Auto-migrate to Firestore
          updateDoc(doc(db, "settings", "config"), {
            infoPageContentLight: contentLight,
            infoPageContentDark: contentDark,
          }).catch(err => console.error("Migration failed:", err));
        }

        setLoadedContentLight(contentLight);
        setLoadedContentDark(contentDark);

        // Only push content into the editor when:
        // 1. It hasn't been initialized yet (first load), OR
        // 2. We are in preview mode (not editing)
        // Never overwrite the editor during an active edit session.
        if (editor && (!editorInitialized.current || !isEditMode)) {
          const currentContent = theme === "dark" ? contentDark : contentLight;
          editor.commands.setContent(currentContent, { emitUpdate: false });
          editorInitialized.current = true;
        }
      },
      (error) => {
        console.error("Failed to load info page content:", error);
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
        editor?.commands.setContent(currentContent, { emitUpdate: false });
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
        editor.commands.setContent(loadedContentDark, { emitUpdate: false });
      }
    } else {
      // Switching to light mode: save current to dark, load light content
      setLoadedContentDark(currentContent);
      if (loadedContentLight) {
        editor.commands.setContent(loadedContentLight, { emitUpdate: false });
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
        [isDark ? "infoPageContentDark" : "infoPageContentLight"]: html,
        infoPageLastUpdated: serverTimestamp(),
        infoPageLastEditedBy: user?.uid ?? "unknown",
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

  // ── Load meeting dates ─────────────────────────────────────────────────
  useEffect(() => {
    const loadMeetingDates = async () => {
      try {
        const datesDoc = await getDoc(doc(db, "tracking", "meetingDates"));
        if (datesDoc.exists()) {
          const data = datesDoc.data();
          // Handle both old and new formats
          const migrated: Record<string, { date: string; note: string; published: boolean; visible: boolean }> = {};
          for (const [month, value] of Object.entries(data)) {
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
            }
          }
          setMeetingDates(migrated);
        }
      } catch (error) {
        console.error("Error loading meeting dates:", error);
      }
    };

    loadMeetingDates();
  }, []);

  // ── Split meeting dates into upcoming and past ─────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sortedMeetingDates = Object.entries(meetingDates)
    .filter(([_, data]) => data.date) // Filter out empty dates
    .map(([month, data]) => ({
      month,
      date: new Date(data.date + 'T00:00:00'), // Append time to ensure local time interpretation
      dateStr: data.date,
      note: data.note,
      published: data.published,
      visible: data.visible,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const upcomingMeetings = sortedMeetingDates.filter(
    ({ date }) => date.getTime() >= today.getTime()
  );
  const pastMeetings = sortedMeetingDates.filter(
    ({ date }) => date.getTime() < today.getTime()
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        {/* ── Admin toggle bar ── */}
        {isAdmin && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isEditMode ? (
                <>
                  <Pencil size={14} />
                  <span>Editing</span>
                </>
              ) : (
                <>
                  <Eye size={14} />
                  <span>Preview</span>
                </>
              )}
            </div>
            <Button
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
            </Button>
          </div>
        )}

        {/* ── Upcoming Meetings ── */}
        {upcomingMeetings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar size={20} />
                Upcoming Meetings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {upcomingMeetings.map(({ month, dateStr, note, published }) => (
                  <li key={month} className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{month}:</span>
                      <span className="text-muted-foreground">
                        {new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                    {published && note && (
                      <div className="text-sm text-muted-foreground pl-4">
                        <span className="font-medium">Note:</span> {note}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* ── Past Meetings ── */}
        {pastMeetings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar size={20} />
                Past Meetings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {pastMeetings.map(({ month, dateStr, note, published }) => (
                  <li key={month} className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{month}:</span>
                      <span className="text-muted-foreground">
                        {new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                    {published && note && (
                      <div className="text-sm text-muted-foreground pl-4">
                        <span className="font-medium">Note:</span> {note}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* ── Toolbar (edit mode only) ── */}
        {isAdmin && isEditMode && (
          <EditorToolbar
            editor={editor}
            autoSaveStatus={autoSaveStatus}
            onManualSave={saveContent}
            isSaving={isSaving}
          />
        )}

        {/* ── Document area ── */}
        <Card>
          <CardContent className="info-editor-container p-6">
            <EditorContent editor={editor} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default InfoPage;
