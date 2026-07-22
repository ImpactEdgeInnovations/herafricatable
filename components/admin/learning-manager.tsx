"use client";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CourseSummary } from "@/components/member/learning-catalog";
import { useActionDialog } from "@/components/ui/action-dialog";
export type AdminLesson = {
  id: string;
  course_id: string;
  title: string;
  summary: string | null;
  lesson_type: string;
  content: string | null;
  asset_path: string | null;
  external_url: string | null;
  duration_minutes: number | null;
  status: string;
  sort_order: number;
};
export type CourseOrder = {
  order_id: string;
  reference: string;
  course_id: string;
  course_title: string;
  user_id: string;
  email: string;
  display_name: string | null;
  status: string;
  processing_mode: string;
  total_minor: number;
  currency: string;
  submitted_reference: string | null;
  submitter_note: string | null;
  created_at: string;
};
export function LearningManager({
  courses,
  lessons,
  orders,
  events,
  enabled,
  migrationReady,
}: {
  courses: CourseSummary[];
  lessons: AdminLesson[];
  orders: CourseOrder[];
  events: { id: string; title: string }[];
  enabled: boolean;
  migrationReady: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [courseId, setCourseId] = useState(courses[0]?.course_id ?? "");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const course = courses.find((item) => item.course_id === courseId);
  async function toggle() {
    setBusy("flag");
    const { error } = await supabase.rpc("set_feature_flag", {
      p_enabled: !enabled,
      p_key: "learning",
    });
    setBusy("");
    setMessage(
      error ? error.message : `Learning ${enabled ? "disabled" : "enabled"}.`,
    );
    if (!error) window.location.reload();
  }
  async function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const access = String(form.get("access_type"));
    setBusy("course");
    const { error } = await supabase.rpc("save_course", {
      p_access_type: access,
      p_course_id: form.get("id") || null,
      p_currency: form.get("currency"),
      p_description: form.get("description"),
      p_event_id:
        access === "event_bundle" ? form.get("event_id") || null : null,
      p_instructor: form.get("instructor"),
      p_payment_mode: form.get("payment_mode"),
      p_price_minor:
        access === "purchase" ? Math.round(Number(form.get("price")) * 100) : 0,
      p_slug: form.get("slug"),
      p_status: form.get("status"),
      p_summary: form.get("summary"),
      p_title: form.get("title"),
    });
    setBusy("");
    setMessage(error ? error.message : "Course saved and audited.");
    if (!error) window.location.reload();
  }
  async function saveLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("asset") as File;
    let path = "";
    setBusy("lesson");
    if (file?.size) {
      if (file.size > 50 * 1024 * 1024) {
        setBusy("");
        setMessage("Course assets must be 50 MB or smaller.");
        return;
      }
      path = `${courseId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const upload = await supabase.storage
        .from("course-assets")
        .upload(path, file, { upsert: false });
      if (upload.error) {
        setBusy("");
        setMessage(upload.error.message);
        return;
      }
    }
    const { error } = await supabase.rpc("save_course_lesson", {
      p_asset_path: path || null,
      p_content: form.get("content"),
      p_course_id: courseId,
      p_duration: Number(form.get("duration")) || null,
      p_external_url: form.get("external_url"),
      p_lesson_id: null,
      p_lesson_type: form.get("lesson_type"),
      p_sort_order: Number(form.get("sort_order")) || 0,
      p_status: form.get("status"),
      p_summary: form.get("summary"),
      p_title: form.get("title"),
    });
    setBusy("");
    setMessage(
      error ? error.message : "Lesson saved with protected delivery metadata.",
    );
    if (!error) window.location.reload();
  }
  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("grant");
    const { error } = await supabase.rpc("grant_course_access", {
      p_course_id: courseId,
      p_note: form.get("note"),
      p_user_email: form.get("email"),
    });
    setBusy("");
    setMessage(error ? error.message : "Course access granted and audited.");
    if (!error) window.location.reload();
  }
  async function review(id: string, action: string) {
    const result = await ask({ title: action === "approve" ? "Approve this course order?" : "Reject this course order?", description: action === "approve" ? "Confirm that the submitted manual payment evidence has been checked. Approval grants protected course access." : "Course access will not be granted. Record a clear reason for the audit history.", confirmLabel: action === "approve" ? "Approve order" : "Reject order", tone: action === "reject" ? "danger" : "default", fields: [{ name: "note", label: action === "approve" ? "Approval note (optional)" : "Reason for rejection", type: "textarea", required: action === "reject", minLength: action === "reject" ? 5 : undefined, maxLength: 500, help: "Do not include full card or bank account details." }] });
    if (!result) return;
    const note = String(result.note ?? "");
    setBusy(id);
    const { error } = await supabase.rpc("review_course_order", {
      p_action: action,
      p_note: note,
      p_order_id: id,
    });
    setBusy("");
    setMessage(error ? error.message : `Course order ${action}d.`);
    if (!error) window.location.reload();
  }
  if (!migrationReady)
    return (
      <section className="admin-section" id="learning-admin">
        <div className="admin-empty">
          <strong>Learning migration required</strong>
          <p>
            Apply the latest learning foundation migration to activate course
            operations.
          </p>
        </div>
      </section>
    );
  return (
    <section className="admin-section learning-admin" id="learning-admin">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Controlled P1 release</p>
          <h2>Learning studio</h2>
          <p>
            Manage courses, protected lessons, access and purchases through the
            shared payment engine.
          </p>
        </div>
        <button
          className={enabled ? "danger-action" : ""}
          disabled={busy === "flag"}
          onClick={() => void toggle()}
        >
          {enabled ? "Disable member access" : "Enable after sign-off"}
        </button>
      </div>
      <div className="learning-admin-tabs">
        <label>
          Working course
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">Create new course</option>
            {courses.map((item) => (
              <option key={item.course_id} value={item.course_id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="learning-admin-grid">
        <form onSubmit={(event) => void saveCourse(event)}>
          <h3>Course definition</h3>
          <input type="hidden" name="id" value={course?.course_id ?? ""} />
          <label>
            Title
            <input
              name="title"
              required
              minLength={5}
              defaultValue={course?.title ?? ""}
              key={`title-${courseId}`}
            />
          </label>
          <label>
            URL slug
            <input
              name="slug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              defaultValue={course?.slug ?? ""}
              key={`slug-${courseId}`}
            />
          </label>
          <label>
            Summary
            <textarea
              name="summary"
              required
              minLength={20}
              maxLength={300}
              defaultValue={course?.summary ?? ""}
              key={`summary-${courseId}`}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              required
              minLength={30}
              defaultValue={course?.description ?? ""}
              key={`description-${courseId}`}
            />
          </label>
          <label>
            Instructor
            <input
              name="instructor"
              required
              defaultValue={course?.instructor_name ?? ""}
              key={`instructor-${courseId}`}
            />
          </label>
          <div className="admin-form-row">
            <label>
              Access
              <select
                name="access_type"
                defaultValue={course?.access_type ?? "free"}
                key={`access-${courseId}`}
              >
                <option value="free">Free</option>
                <option value="purchase">Purchase</option>
                <option value="event_bundle">Event bundle</option>
                <option value="manual">Manual grant</option>
              </select>
            </label>
            <label>
              Payment mode
              <select
                name="payment_mode"
                defaultValue={course?.payment_mode ?? "closed"}
                key={`paymode-${courseId}`}
              >
                <option value="closed">Closed</option>
                <option value="manual_review">Manual review</option>
                <option value="automatic">Paystack automatic</option>
              </select>
            </label>
          </div>
          <div className="admin-form-row">
            <label>
              Price
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                defaultValue={course ? course.price_minor / 100 : 0}
                key={`price-${courseId}`}
              />
            </label>
            <label>
              Currency
              <input
                name="currency"
                pattern="[A-Z]{3}"
                defaultValue={course?.currency ?? "KES"}
                key={`currency-${courseId}`}
              />
            </label>
          </div>
          <label>
            Bundled event
            <select name="event_id" defaultValue="">
              <option value="">None</option>
              {events.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              name="status"
              defaultValue={course?.status ?? "draft"}
              key={`course-status-${courseId}`}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <button
            className="button button-primary"
            disabled={busy === "course"}
          >
            Save course
          </button>
        </form>
        <div>
          {courseId ? (
            <>
              <form onSubmit={(event) => void saveLesson(event)}>
                <h3>Add lesson</h3>
                <label>
                  Title
                  <input name="title" required />
                </label>
                <label>
                  Summary
                  <textarea name="summary" />
                </label>
                <div className="admin-form-row">
                  <label>
                    Type
                    <select name="lesson_type">
                      <option value="text">Text</option>
                      <option value="video">Video</option>
                      <option value="file">File</option>
                      <option value="live">Live</option>
                    </select>
                  </label>
                  <label>
                    Duration minutes
                    <input name="duration" type="number" min="1" />
                  </label>
                </div>
                <label>
                  Lesson content
                  <textarea name="content" />
                </label>
                <label>
                  External URL
                  <input name="external_url" type="url" />
                </label>
                <label>
                  Protected asset
                  <input
                    name="asset"
                    type="file"
                    accept="application/pdf,video/mp4,video/webm,image/jpeg,image/png,image/webp"
                  />
                </label>
                <div className="admin-form-row">
                  <label>
                    Order
                    <input
                      name="sort_order"
                      type="number"
                      min="0"
                      defaultValue={
                        lessons.filter((item) => item.course_id === courseId)
                          .length
                      }
                    />
                  </label>
                  <label>
                    Status
                    <select name="status">
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </label>
                </div>
                <button disabled={busy === "lesson"}>Add lesson</button>
              </form>
              <div className="admin-lesson-list">
                {lessons
                  .filter((item) => item.course_id === courseId)
                  .map((item) => (
                    <article key={item.id}>
                      <span>{item.sort_order + 1}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <small>
                          {item.lesson_type} · {item.status}
                          {item.duration_minutes
                            ? ` · ${item.duration_minutes} min`
                            : ""}
                        </small>
                      </div>
                    </article>
                  ))}
              </div>
              <form
                className="course-grant"
                onSubmit={(event) => void grant(event)}
              >
                <h3>Manual access</h3>
                <label>
                  Active member email
                  <input name="email" type="email" required />
                </label>
                <label>
                  Grant reason
                  <input name="note" minLength={5} required />
                </label>
                <button disabled={busy === "grant"}>Grant course access</button>
              </form>
            </>
          ) : (
            <div className="admin-empty">
              <strong>Save the course first</strong>
              <p>Lessons and access controls require a course record.</p>
            </div>
          )}
        </div>
      </div>
      <div className="course-order-list">
        <h3>Course purchase reviews</h3>
        {orders.length ? (
          orders.map((order) => (
            <article key={order.order_id}>
              <div>
                <strong>{order.course_title}</strong>
                <small>
                  {order.reference} · {order.display_name || order.email}
                </small>
                {order.submitted_reference ? (
                  <span>Payment reference: {order.submitted_reference}</span>
                ) : null}
              </div>
              <span>{order.status}</span>
              {order.status === "pending_review" ? (
                <div className="member-actions">
                  <button
                    disabled={busy === order.order_id}
                    onClick={() => void review(order.order_id, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy === order.order_id}
                    onClick={() => void review(order.order_id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <div className="admin-empty">
            <strong>No course orders</strong>
            <p>Manual and automatic course purchases will appear here.</p>
          </div>
        )}
      </div>
      {message ? (
        <p className="manager-message content-manager-message">{message}</p>
      ) : null}
      {dialog}
    </section>
  );
}
