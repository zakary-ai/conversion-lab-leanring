"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/ui/icons";
import { enumLabel } from "@/lib/format";

type LessonData = {
  id: string;
  title: string;
  description: string;
  type: "VIDEO" | "TEXT" | "DOCUMENT" | "LINK";
  status: string;
  durationMin: number | null;
  /** Video asset provider ("youtube", "vimeo", "url", "file"), or "" when none */
  videoProvider: string;
  videoUrl: string;
  content: string;
  linkUrl: string;
  fileUrl: string;
};

/**
 * Upload a video file: ask /api/admin/uploads for a presigned URL (object
 * storage) or fall back to a multipart POST (local disk in development).
 * Resolves to the storage key to persist on the lesson.
 */
async function uploadVideoFile(file: File, onProgress: (pct: number) => void): Promise<string> {
  const negotiate = await fetch("/api/admin/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  });
  if (!negotiate.ok) {
    const data = (await negotiate.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Upload failed");
  }
  const plan = (await negotiate.json()) as { mode: "presigned" | "form"; uploadUrl?: string; key?: string };

  if (plan.mode === "presigned" && plan.uploadUrl && plan.key) {
    await xhrUpload("PUT", plan.uploadUrl, file, file.type, onProgress);
    return plan.key;
  }
  const form = new FormData();
  form.append("file", file);
  const response = await xhrUpload("POST", "/api/admin/uploads", form, null, onProgress);
  return (JSON.parse(response) as { key: string }).key;
}

/** fetch() has no upload progress, so uploads go through XMLHttpRequest. */
function xhrUpload(
  method: string,
  url: string,
  body: File | FormData,
  contentType: string | null,
  onProgress: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
      else {
        let message = `Upload failed (${xhr.status})`;
        try {
          message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
        } catch {}
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.send(body);
  });
}

type QuizData = {
  id: string;
  title: string;
  status: string;
  passingScore: number;
  questionCount: number;
  attemptCount: number;
};

type ModuleData = {
  id: string;
  title: string;
  description: string;
  minStars: number;
  starReward: number;
  status: string;
  prerequisiteId: string | null;
  lessons: LessonData[];
  quizzes: QuizData[];
};

type CourseData = {
  id: string;
  title: string;
  description: string;
  minStars: number;
  status: string;
  modules: ModuleData[];
};

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`chip ${status === "PUBLISHED" ? "chip-good" : status === "DRAFT" ? "chip-accent" : ""}`}
    >
      {enumLabel(status)}
    </span>
  );
}

export function CourseBuilder({ course }: { course: CourseData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function api(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? "Something went wrong");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function reorder(entity: "module" | "lesson", ids: string[], from: number, to: number) {
    if (to < 0 || to >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    await api("/api/admin/reorder", "POST", { entity, orderedIds: next });
  }

  return (
    <div className="animate-rise max-w-4xl">
      <Link href="/admin/training" className="text-xs text-ink-dim hover:text-ink mb-4 inline-block">
        ← All courses
      </Link>

      {/* Course header */}
      <div className="card p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-60">
            <InlineText
              value={course.title}
              className="text-2xl font-bold tracking-tight"
              onSave={(title) => void api(`/api/admin/courses/${course.id}`, "PATCH", { title })}
            />
            <InlineText
              value={course.description}
              placeholder="Add a course description…"
              className="text-sm text-ink-mid mt-1"
              multiline
              onSave={(description) =>
                void api(`/api/admin/courses/${course.id}`, "PATCH", { description })
              }
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusChip status={course.status} />
            <label className="chip cursor-pointer" title="Minimum stars to access">
              ⭐
              <input
                type="number"
                min={0}
                defaultValue={course.minStars}
                className="w-10 bg-transparent outline-none text-center"
                onBlur={(e) =>
                  void api(`/api/admin/courses/${course.id}`, "PATCH", {
                    minStars: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
            {course.status !== "PUBLISHED" ? (
              <button
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => void api(`/api/admin/courses/${course.id}`, "PATCH", { status: "PUBLISHED" })}
              >
                Publish
              </button>
            ) : (
              <button
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => void api(`/api/admin/courses/${course.id}`, "PATCH", { status: "DRAFT" })}
              >
                Unpublish
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => void api(`/api/admin/courses/${course.id}`, "PATCH", { status: "ARCHIVED" })}
            >
              Archive
            </button>
            <Link href={`/training/course/${course.id}`} className="btn btn-secondary btn-sm">
              Preview as learner
            </Link>
          </div>
        </div>
      </div>

      {/* Modules */}
      <div className="space-y-4">
        {course.modules.map((mod, mi) => (
          <ModuleCard
            key={mod.id}
            module={mod}
            index={mi}
            course={course}
            busy={busy}
            api={api}
            onMove={(dir) =>
              void reorder("module", course.modules.map((m) => m.id), mi, mi + dir)
            }
          />
        ))}
      </div>

      <AddModuleForm courseId={course.id} api={api} busy={busy} />
    </div>
  );
}

function ModuleCard({
  module: mod,
  index,
  course,
  busy,
  api,
  onMove,
}: {
  module: ModuleData;
  index: number;
  course: CourseData;
  busy: boolean;
  api: (path: string, method: string, body?: unknown) => Promise<boolean>;
  onMove: (dir: -1 | 1) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [addingLesson, setAddingLesson] = useState(false);
  const [addingQuiz, setAddingQuiz] = useState(false);

  async function reorderLesson(from: number, to: number) {
    if (to < 0 || to >= mod.lessons.length) return;
    const ids = mod.lessons.map((l) => l.id);
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    await api("/api/admin/reorder", "POST", { entity: "lesson", orderedIds: next });
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 bg-raised/40 border-b border-edge">
        <div className="flex flex-col gap-0.5">
          <button className="text-ink-dim hover:text-ink disabled:opacity-30" onClick={() => onMove(-1)} disabled={busy || index === 0} aria-label="Move module up">▲</button>
          <button className="text-ink-dim hover:text-ink disabled:opacity-30" onClick={() => onMove(1)} disabled={busy || index === course.modules.length - 1} aria-label="Move module down">▼</button>
        </div>
        <button onClick={() => setExpanded((v) => !v)} className="text-ink-dim">
          <Icons.chevronDown className={`h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-ink-dim">MODULE {index + 1}</span>
            <InlineText
              value={mod.title}
              className="font-bold"
              onSave={(title) => void api(`/api/admin/modules/${mod.id}`, "PATCH", { title })}
            />
            <StatusChip status={mod.status} />
          </div>
          <p className="text-xs text-ink-dim mt-0.5">
            {mod.lessons.length} lessons · {mod.quizzes.length} quizzes
            {mod.prerequisiteId && (
              <> · requires {course.modules.find((m) => m.id === mod.prerequisiteId)?.title ?? "module"}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="chip cursor-pointer" title="Stars required to access this module">
            🔒⭐
            <input
              type="number"
              min={0}
              defaultValue={mod.minStars}
              className="w-8 bg-transparent outline-none text-center"
              onBlur={(e) =>
                void api(`/api/admin/modules/${mod.id}`, "PATCH", {
                  minStars: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </label>
          <label className="chip chip-accent cursor-pointer" title="Stars awarded on completion">
            🎁⭐
            <input
              type="number"
              min={0}
              defaultValue={mod.starReward}
              className="w-8 bg-transparent outline-none text-center"
              onBlur={(e) =>
                void api(`/api/admin/modules/${mod.id}`, "PATCH", {
                  starReward: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </label>
          <select
            className="input py-1 px-2 text-xs w-auto"
            value={mod.prerequisiteId ?? ""}
            onChange={(e) =>
              void api(`/api/admin/modules/${mod.id}`, "PATCH", {
                prerequisiteId: e.target.value || null,
              })
            }
            title="Prerequisite module"
          >
            <option value="">No prerequisite</option>
            {course.modules
              .filter((m) => m.id !== mod.id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  Requires: {m.title}
                </option>
              ))}
          </select>
          {mod.status !== "PUBLISHED" ? (
            <button className="btn btn-primary btn-sm" disabled={busy}
              onClick={() => void api(`/api/admin/modules/${mod.id}`, "PATCH", { status: "PUBLISHED" })}>
              Publish
            </button>
          ) : (
            <button className="btn btn-secondary btn-sm" disabled={busy}
              onClick={() => void api(`/api/admin/modules/${mod.id}`, "PATCH", { status: "DRAFT" })}>
              Unpublish
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm hover:text-bad"
            disabled={busy}
            onClick={() => {
              if (confirm(`Delete module "${mod.title}" and all its lessons?`)) {
                void api(`/api/admin/modules/${mod.id}`, "DELETE");
              }
            }}
            aria-label="Delete module"
          >
            <Icons.trash />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 py-3">
          <ul className="divide-y divide-edge/60">
            {mod.lessons.map((lesson, li) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                busy={busy}
                api={api}
                onMove={(dir) => void reorderLesson(li, li + dir)}
                first={li === 0}
                last={li === mod.lessons.length - 1}
              />
            ))}
            {mod.quizzes.map((quiz) => (
              <li key={quiz.id} className="flex items-center gap-3 py-2.5">
                <span className="text-accent-hi text-sm w-5 text-center">★</span>
                <Link
                  href={`/admin/training/quiz/${quiz.id}`}
                  className="text-sm font-semibold hover:text-accent-hi transition-colors"
                >
                  Quiz: {quiz.title}
                </Link>
                <StatusChip status={quiz.status} />
                <span className="text-xs text-ink-dim">
                  {quiz.questionCount} questions · pass ≥{quiz.passingScore}% · {quiz.attemptCount} attempts
                </span>
                <Link href={`/admin/training/quiz/${quiz.id}`} className="btn btn-secondary btn-sm ml-auto">
                  Edit quiz
                </Link>
              </li>
            ))}
            {mod.lessons.length === 0 && mod.quizzes.length === 0 && (
              <li className="py-3 text-sm text-ink-dim">No content yet — add a lesson below.</li>
            )}
          </ul>

          <div className="flex gap-2 pt-3 border-t border-edge/60 mt-1">
            {addingLesson ? (
              <NewLessonForm
                moduleId={mod.id}
                api={api}
                busy={busy}
                onDone={() => setAddingLesson(false)}
              />
            ) : addingQuiz ? (
              <NewQuizForm moduleId={mod.id} busy={busy} onDone={() => setAddingQuiz(false)} />
            ) : (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => setAddingLesson(true)}>
                  <Icons.plus className="h-3.5 w-3.5" />
                  Add lesson
                </button>
                {mod.quizzes.length === 0 && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setAddingQuiz(true)}>
                    <Icons.plus className="h-3.5 w-3.5" />
                    Add quiz
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function LessonRow({
  lesson,
  busy,
  api,
  onMove,
  first,
  last,
}: {
  lesson: LessonData;
  busy: boolean;
  api: (path: string, method: string, body?: unknown) => Promise<boolean>;
  onMove: (dir: -1 | 1) => void;
  first: boolean;
  last: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const typeIcons = { VIDEO: "🎬", TEXT: "📃", DOCUMENT: "📄", LINK: "🔗" };

  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex flex-col -my-1">
          <button className="text-ink-dim hover:text-ink text-[10px] disabled:opacity-30" onClick={() => onMove(-1)} disabled={busy || first} aria-label="Move up">▲</button>
          <button className="text-ink-dim hover:text-ink text-[10px] disabled:opacity-30" onClick={() => onMove(1)} disabled={busy || last} aria-label="Move down">▼</button>
        </div>
        <span className="text-sm w-5 text-center">{typeIcons[lesson.type]}</span>
        <span className="text-sm font-medium truncate">{lesson.title}</span>
        <StatusChip status={lesson.status} />
        {lesson.durationMin ? <span className="text-xs text-ink-dim">{lesson.durationMin} min</span> : null}
        <div className="ml-auto flex items-center gap-1.5">
          {lesson.status !== "PUBLISHED" ? (
            <button className="btn btn-primary btn-sm" disabled={busy}
              onClick={() => void api(`/api/admin/lessons/${lesson.id}`, "PATCH", { status: "PUBLISHED" })}>
              Publish
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" disabled={busy}
              onClick={() => void api(`/api/admin/lessons/${lesson.id}`, "PATCH", { status: "DRAFT" })}>
              Unpublish
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing((v) => !v)}>
            <Icons.edit className="h-3.5 w-3.5" />
          </button>
          <button
            className="btn btn-ghost btn-sm hover:text-bad"
            disabled={busy}
            onClick={() => {
              if (confirm(`Delete lesson "${lesson.title}"?`)) {
                void api(`/api/admin/lessons/${lesson.id}`, "DELETE");
              }
            }}
          >
            <Icons.trash className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {editing && (
        <LessonForm
          initial={lesson}
          busy={busy}
          onSubmit={async (fields) => {
            const ok = await api(`/api/admin/lessons/${lesson.id}`, "PATCH", fields);
            if (ok) setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </li>
  );
}

function NewLessonForm({
  moduleId,
  api,
  busy,
  onDone,
}: {
  moduleId: string;
  api: (path: string, method: string, body?: unknown) => Promise<boolean>;
  busy: boolean;
  onDone: () => void;
}) {
  return (
    <LessonForm
      initial={{
        id: "",
        title: "",
        description: "",
        type: "VIDEO",
        status: "DRAFT",
        durationMin: null,
        videoProvider: "",
        videoUrl: "",
        content: "",
        linkUrl: "",
        fileUrl: "",
      }}
      busy={busy}
      onSubmit={async (fields) => {
        const ok = await api("/api/admin/lessons", "POST", { moduleId, ...fields });
        if (ok) onDone();
      }}
      onCancel={onDone}
    />
  );
}

function LessonForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: LessonData;
  busy: boolean;
  onSubmit: (fields: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [type, setType] = useState(initial.type);
  const [description, setDescription] = useState(initial.description);
  const [videoUrl, setVideoUrl] = useState(initial.videoUrl);
  const [content, setContent] = useState(initial.content);
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl);
  const [fileUrl, setFileUrl] = useState(initial.fileUrl);
  const [durationMin, setDurationMin] = useState(initial.durationMin?.toString() ?? "");
  const [videoMode, setVideoMode] = useState<"url" | "upload">(
    initial.videoProvider === "file" ? "upload" : "url"
  );
  const [videoKey, setVideoKey] = useState("");
  const [uploadedName, setUploadedName] = useState("");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");

  const uploading = uploadPct !== null && uploadPct < 100;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setUploadError("Please choose a video file (MP4, WebM, MOV…)");
      return;
    }
    setUploadError("");
    setUploadPct(0);
    try {
      const key = await uploadVideoFile(file, setUploadPct);
      setVideoKey(key);
      setUploadedName(file.name);
      setUploadPct(100);
    } catch (err) {
      setUploadPct(null);
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  function submit() {
    const fields: Record<string, unknown> = {
      title: title.trim(),
      type,
      description: description.trim() || undefined,
      durationMin: durationMin ? Number(durationMin) : null,
    };
    if (type === "VIDEO") {
      if (videoMode === "upload" && videoKey) fields.videoKey = videoKey;
      else if (videoMode === "url" && videoUrl.trim()) fields.videoUrl = videoUrl.trim();
    }
    if (type === "TEXT") fields.content = content;
    if (type === "LINK" && linkUrl.trim()) fields.linkUrl = linkUrl.trim();
    if (type === "DOCUMENT" && fileUrl.trim()) fields.fileUrl = fileUrl.trim();
    void onSubmit(fields);
  }

  return (
    <div className="card-raised p-4 mt-2 w-full grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="label">Type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as LessonData["type"])}>
            <option value="VIDEO">Video</option>
            <option value="TEXT">Text</option>
            <option value="DOCUMENT">Document</option>
            <option value="LINK">Link</option>
          </select>
        </div>
        <div className="w-24">
          <label className="label">Minutes</label>
          <input className="input" type="number" min={0} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
        </div>
      </div>
      {type === "VIDEO" && (
        <div className="sm:col-span-2">
          <div className="flex items-center gap-2 mb-1.5">
            <label className="label mb-0">Video</label>
            <div className="flex gap-1">
              <button
                type="button"
                className={`chip cursor-pointer ${videoMode === "url" ? "chip-accent" : ""}`}
                onClick={() => setVideoMode("url")}
              >
                Link URL
              </button>
              <button
                type="button"
                className={`chip cursor-pointer ${videoMode === "upload" ? "chip-accent" : ""}`}
                onClick={() => setVideoMode("upload")}
              >
                Upload file
              </button>
            </div>
          </div>
          {videoMode === "url" ? (
            <input
              className="input"
              placeholder="https://youtube.com/watch?v=… (YouTube, Vimeo, or direct MP4/HLS)"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
          ) : (
            <div className="grid gap-1.5">
              <input
                className="input"
                type="file"
                accept="video/*"
                disabled={uploading}
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
              {uploadPct !== null && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="h-1.5 flex-1 rounded-full bg-overlay overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent-hi transition-all"
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                  <span className="text-ink-dim w-24">
                    {videoKey ? `Uploaded ✓` : `Uploading ${uploadPct}%`}
                  </span>
                </div>
              )}
              {videoKey ? (
                <p className="text-xs text-ink-dim">
                  {uploadedName} — saved when you {initial.id ? "save" : "add"} the lesson.
                </p>
              ) : initial.videoProvider === "file" && uploadPct === null ? (
                <p className="text-xs text-ink-dim">
                  This lesson has an uploaded video. Choose a file to replace it.
                </p>
              ) : null}
              {uploadError && <p className="text-xs text-bad">{uploadError}</p>}
            </div>
          )}
        </div>
      )}
      {type === "TEXT" && (
        <div className="sm:col-span-2">
          <label className="label">Lesson content</label>
          <textarea className="input min-h-28 resize-y" value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
      )}
      {type === "LINK" && (
        <div className="sm:col-span-2">
          <label className="label">External link</label>
          <input className="input" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
        </div>
      )}
      {type === "DOCUMENT" && (
        <div className="sm:col-span-2">
          <label className="label">Document URL (PDF etc.)</label>
          <input className="input" placeholder="https://…" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} />
        </div>
      )}
      <div className="sm:col-span-2">
        <label className="label">Description</label>
        <textarea className="input min-h-16 resize-y" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="sm:col-span-2 flex gap-2">
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy || uploading || !title.trim()}>
          {initial.id ? "Save lesson" : "Add lesson"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function NewQuizForm({
  moduleId,
  busy,
  onDone,
}: {
  moduleId: string;
  busy: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");

  async function create() {
    if (!title.trim()) return;
    const res = await fetch("/api/admin/quizzes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleId, title: title.trim() }),
    });
    if (res.ok) {
      const data = (await res.json()) as { quiz: { id: string } };
      router.push(`/admin/training/quiz/${data.quiz.id}`);
      router.refresh();
    }
    onDone();
  }

  return (
    <div className="flex gap-2 items-center w-full">
      <input
        className="input flex-1"
        placeholder="Quiz title (e.g. Discovery Mastery Assessment)"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void create()}
      />
      <button className="btn btn-primary btn-sm" onClick={() => void create()} disabled={busy || !title.trim()}>
        Create & edit
      </button>
      <button className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
    </div>
  );
}

function AddModuleForm({
  courseId,
  api,
  busy,
}: {
  courseId: string;
  api: (path: string, method: string, body?: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  if (!open) {
    return (
      <button className="btn btn-secondary mt-4" onClick={() => setOpen(true)}>
        <Icons.plus className="h-4 w-4" />
        Add module
      </button>
    );
  }
  return (
    <div className="card p-4 mt-4 flex gap-2 items-center">
      <input
        className="input flex-1"
        placeholder="Module title (e.g. Objection Handling)"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter" && title.trim()) {
            const ok = await api("/api/admin/modules", "POST", { courseId, title: title.trim() });
            if (ok) {
              setTitle("");
              setOpen(false);
            }
          }
        }}
      />
      <button
        className="btn btn-primary"
        disabled={busy || !title.trim()}
        onClick={async () => {
          const ok = await api("/api/admin/modules", "POST", { courseId, title: title.trim() });
          if (ok) {
            setTitle("");
            setOpen(false);
          }
        }}
      >
        Add
      </button>
      <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

/** Click-to-edit text that saves on blur/Enter. */
function InlineText({
  value,
  onSave,
  className = "",
  placeholder,
  multiline,
}: {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        className={`text-left hover:bg-overlay/50 rounded px-1 -mx-1 transition-colors ${className} ${!value ? "text-ink-dim italic" : ""}`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Click to edit"
      >
        {value || placeholder || "Click to edit"}
      </button>
    );
  }

  function commit() {
    setEditing(false);
    if (draft.trim() && draft !== value) onSave(draft.trim());
  }

  return multiline ? (
    <textarea
      className={`input mt-1 ${className}`}
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
    />
  ) : (
    <input
      className={`input inline-block w-auto min-w-48 ${className}`}
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}
