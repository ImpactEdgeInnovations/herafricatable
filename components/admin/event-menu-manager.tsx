"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AdminEvent } from "@/components/admin/event-manager";
import { createClient } from "@/lib/supabase/client";

export type AdminMenu = { embassy_note: string | null; event_id: string; id: string; introduction: string | null; status: "draft" | "published" | "archived"; title: string };
export type AdminMenuCourse = { description: string | null; id: string; menu_id: string; name: string; sort_order: number };
export type AdminMenuItem = { allergen_notes: string | null; course_id: string; cultural_origin: string | null; cultural_story: string | null; description: string | null; dietary_tags: string[]; id: string; ingredients: string[]; name: string; sort_order: number; status: "draft" | "published" | "archived" };
export type AdminMenuFeedback = { comment: string | null; is_favorite: boolean; item_id: string; moderation_status: "pending" | "approved" | "hidden"; rating: number | null; user_id: string };

const emptyMenu = { title: "At the Table", introduction: "", embassyNote: "", status: "draft" as AdminMenu["status"] };
const emptyItem = { id: null as string | null, courseName: "", courseDescription: "", courseOrder: "0", name: "", description: "", culturalOrigin: "", culturalStory: "", ingredients: "", dietaryTags: "", allergenNotes: "", status: "draft" as AdminMenuItem["status"], sortOrder: "0" };
const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

export function EventMenuManager({ events, initialMenus, initialCourses, initialItems, initialFeedback, migrationReady }: { events: AdminEvent[]; initialMenus: AdminMenu[]; initialCourses: AdminMenuCourse[]; initialItems: AdminMenuItem[]; initialFeedback: AdminMenuFeedback[]; migrationReady: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const selectedMenu = initialMenus.find((menu) => menu.event_id === eventId);
  const [menuForm, setMenuForm] = useState(() => selectedMenu ? { title: selectedMenu.title, introduction: selectedMenu.introduction ?? "", embassyNote: selectedMenu.embassy_note ?? "", status: selectedMenu.status } : emptyMenu);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const courses = selectedMenu ? initialCourses.filter((course) => course.menu_id === selectedMenu.id) : [];
  const items = initialItems.filter((item) => courses.some((course) => course.id === item.course_id));
  const feedback = initialFeedback.filter((entry) => items.some((item) => item.id === entry.item_id));

  function chooseEvent(nextId: string) {
    const menu = initialMenus.find((item) => item.event_id === nextId);
    setEventId(nextId); setItemForm(emptyItem); setMessage("");
    setMenuForm(menu ? { title: menu.title, introduction: menu.introduction ?? "", embassyNote: menu.embassy_note ?? "", status: menu.status } : emptyMenu);
  }

  function errorMessage(error: { message: string } | null) {
    if (!error) return false;
    setMessage(error.message.includes("schema cache") || error.message.includes("Could not find") ? "Apply 20260721230000_event_menu_operations.sql in Supabase, then retry." : error.message);
    setBusy(false); return true;
  }

  async function saveMenu(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const { error } = await supabase.rpc("save_event_menu", { p_embassy_note: menuForm.embassyNote, p_event_id: eventId, p_introduction: menuForm.introduction, p_status: menuForm.status, p_title: menuForm.title });
    if (errorMessage(error)) return;
    setMessage("Menu narrative saved and audit logged."); setBusy(false); window.location.reload();
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const { error } = await supabase.rpc("save_menu_item", {
      p_allergen_notes: itemForm.allergenNotes, p_course_description: itemForm.courseDescription,
      p_course_name: itemForm.courseName, p_course_sort_order: Number(itemForm.courseOrder) || 0,
      p_cultural_origin: itemForm.culturalOrigin, p_cultural_story: itemForm.culturalStory,
      p_description: itemForm.description, p_dietary_tags: list(itemForm.dietaryTags), p_event_id: eventId,
      p_ingredients: list(itemForm.ingredients), p_item_id: itemForm.id, p_name: itemForm.name,
      p_sort_order: Number(itemForm.sortOrder) || 0, p_status: itemForm.status,
    });
    if (errorMessage(error)) return;
    setMessage("Dish saved and audit logged."); setBusy(false); window.location.reload();
  }

  async function moderate(entry: AdminMenuFeedback, action: "approve" | "hide") {
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("moderate_menu_feedback", { p_action: action, p_item_id: entry.item_id, p_user_id: entry.user_id });
    if (errorMessage(error)) return;
    setBusy(false); setMessage(`Comment ${action === "approve" ? "approved" : "hidden"} and audit logged.`); window.location.reload();
  }

  if (!migrationReady) return <section className="admin-section" id="menu"><div className="admin-empty"><strong>Menu database update required</strong><p>Apply <code>20260721230000_event_menu_operations.sql</code> to enable the dining CMS.</p></div></section>;
  if (!events.length) return null;

  return <section className="admin-section event-menu-manager" id="menu" aria-labelledby="menu-manager-title">
    <div className="admin-section-heading"><div><p className="eyebrow">Dining experience</p><h2 id="menu-manager-title">The table, curated</h2><p>Publish the menu as a cultural story, with clear ingredients, dietary guidance, and moderated member feedback.</p></div><label className="event-content-select">Working event<select value={eventId} onChange={(event) => chooseEvent(event.target.value)}>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div>

    <div className="menu-admin-grid">
      <form className="menu-narrative-form" onSubmit={saveMenu}><p className="eyebrow">01 · Menu narrative</p><div className="form-grid"><label className="form-wide">Menu title<input value={menuForm.title} onChange={(e) => setMenuForm({ ...menuForm, title: e.target.value })} required /></label><label className="form-wide">Introduction<textarea rows={4} value={menuForm.introduction} onChange={(e) => setMenuForm({ ...menuForm, introduction: e.target.value })} placeholder="The culinary idea and journey behind this table…" /></label><label className="form-wide">Embassy or cultural note<textarea rows={4} value={menuForm.embassyNote} onChange={(e) => setMenuForm({ ...menuForm, embassyNote: e.target.value })} placeholder="Optional note from a cultural or diplomatic partner" /></label><label>Status<select value={menuForm.status} onChange={(e) => setMenuForm({ ...menuForm, status: e.target.value as AdminMenu["status"] })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label></div><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save menu"}</button></form>

      <div className="menu-items-workspace"><div className="menu-items-heading"><div><p className="eyebrow">02 · Courses and dishes</p><strong>{items.length} dishes</strong></div><button type="button" onClick={() => setItemForm(emptyItem)}>New dish</button></div>{items.length ? <div className="menu-item-chips">{items.map((item) => { const course = courses.find((entry) => entry.id === item.course_id); return <button type="button" key={item.id} className={itemForm.id === item.id ? "selected" : ""} onClick={() => setItemForm({ id: item.id, courseName: course?.name ?? "", courseDescription: course?.description ?? "", courseOrder: String(course?.sort_order ?? 0), name: item.name, description: item.description ?? "", culturalOrigin: item.cultural_origin ?? "", culturalStory: item.cultural_story ?? "", ingredients: item.ingredients.join(", "), dietaryTags: item.dietary_tags.join(", "), allergenNotes: item.allergen_notes ?? "", status: item.status, sortOrder: String(item.sort_order) })}><span>{item.name}</span><small>{course?.name} · {item.status}</small></button>; })}</div> : <p className="menu-empty-copy">Save the menu narrative, then add the first course and dish.</p>}
        <form className="menu-item-form" onSubmit={saveItem}><div className="form-grid"><label>Course name<input value={itemForm.courseName} onChange={(e) => setItemForm({ ...itemForm, courseName: e.target.value })} placeholder="First course" required /></label><label>Course order<input type="number" min="0" value={itemForm.courseOrder} onChange={(e) => setItemForm({ ...itemForm, courseOrder: e.target.value })} /></label><label className="form-wide">Course description<input value={itemForm.courseDescription} onChange={(e) => setItemForm({ ...itemForm, courseDescription: e.target.value })} /></label><label>Dish name<input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} required /></label><label>Cultural origin<input value={itemForm.culturalOrigin} onChange={(e) => setItemForm({ ...itemForm, culturalOrigin: e.target.value })} placeholder="Coastal Kenya" /></label><label className="form-wide">Description<textarea rows={3} value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} /></label><label className="form-wide">Cultural story<textarea rows={4} value={itemForm.culturalStory} onChange={(e) => setItemForm({ ...itemForm, culturalStory: e.target.value })} /></label><label className="form-wide">Ingredients<input value={itemForm.ingredients} onChange={(e) => setItemForm({ ...itemForm, ingredients: e.target.value })} placeholder="Coconut, cardamom, millet (comma separated)" /></label><label>Dietary tags<input value={itemForm.dietaryTags} onChange={(e) => setItemForm({ ...itemForm, dietaryTags: e.target.value })} placeholder="Vegetarian, gluten-free" /></label><label>Allergen notes<input value={itemForm.allergenNotes} onChange={(e) => setItemForm({ ...itemForm, allergenNotes: e.target.value })} /></label><label>Status<select value={itemForm.status} onChange={(e) => setItemForm({ ...itemForm, status: e.target.value as AdminMenuItem["status"] })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label>Dish order<input type="number" min="0" value={itemForm.sortOrder} onChange={(e) => setItemForm({ ...itemForm, sortOrder: e.target.value })} /></label></div><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save dish"}</button></form>
      </div>
    </div>

    {feedback.length ? <div className="menu-moderation"><p className="eyebrow">Member feedback moderation</p>{feedback.map((entry) => <article key={`${entry.item_id}-${entry.user_id}`}><div><strong>{items.find((item) => item.id === entry.item_id)?.name}</strong><span>{entry.rating ? `${entry.rating}/5 · ` : ""}{entry.is_favorite ? "Favourite · " : ""}{entry.moderation_status}</span><p>{entry.comment || "Rating or favourite only—no public comment."}</p></div>{entry.comment ? <div><button disabled={busy} type="button" onClick={() => void moderate(entry, "approve")}>Approve</button><button disabled={busy} type="button" onClick={() => void moderate(entry, "hide")}>Hide</button></div> : null}</article>)}</div> : null}
    {message ? <p className="manager-message content-manager-message" role="status">{message}</p> : null}
  </section>;
}
