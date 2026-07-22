"use client";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PartnerPerk } from "@/components/member/perks-gallery";
import { useActionDialog } from "@/components/ui/action-dialog";
export type AdminPartner = {
  id: string;
  slug: string;
  name: string;
  description: string;
  website_url: string | null;
  logo_url: string | null;
  category: string;
  city: string | null;
  country: string;
  status: string;
};
export type PerkRedemption = {
  redemption_id: string;
  redemption_code: string;
  perk_id: string;
  perk_title: string;
  partner_name: string;
  user_id: string;
  email: string;
  display_name: string | null;
  is_test_account: boolean;
  status: string;
  reserved_at: string;
  expires_at: string;
  redeemed_at: string | null;
  review_note: string | null;
};
const localDate = (value: string | null | undefined) =>
  value
    ? new Date(
        new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16)
    : "";
export function PerksManager({
  partners,
  perks,
  redemptions,
  enabled,
  migrationReady,
}: {
  partners: AdminPartner[];
  perks: PartnerPerk[];
  redemptions: PerkRedemption[];
  enabled: boolean;
  migrationReady: boolean;
}) {
  const supabase = createClient();
  const { ask, dialog } = useActionDialog();
  const [partnerId, setPartnerId] = useState("");
  const [perkId, setPerkId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const partner = partners.find((x) => x.id === partnerId);
  const perk = perks.find((x) => x.perk_id === perkId);
  async function toggle() {
    const result = await ask({ title: enabled ? "Pause partner perk reservations?" : "Enable partner perk reservations?", description: enabled ? "Members will keep existing redemption codes, but no new reservations can be created until access is restored." : "Published, currently available benefits will become reservable by eligible members.", confirmLabel: enabled ? "Pause reservations" : "Enable reservations", tone: enabled ? "danger" : "default" });
    if (!result) return;
    setBusy("flag");
    const { error } = await supabase.rpc("set_feature_flag", {
      p_enabled: !enabled,
      p_key: "partner_perks",
    });
    setBusy("");
    setMessage(
      error
        ? error.message
        : `Partner perks ${enabled ? "disabled" : "enabled"}.`,
    );
    if (!error) location.reload();
  }
  async function savePartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy("partner");
    const { error } = await supabase.rpc("save_partner", {
      p_category: f.get("category"),
      p_city: f.get("city"),
      p_country: f.get("country"),
      p_description: f.get("description"),
      p_logo_url: f.get("logo_url"),
      p_name: f.get("name"),
      p_partner_id: f.get("id") || null,
      p_slug: f.get("slug"),
      p_status: f.get("status"),
      p_website_url: f.get("website_url"),
    });
    setBusy("");
    setMessage(error ? error.message : "Partner saved and audited.");
    if (!error) location.reload();
  }
  async function savePerk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy("perk");
    const { error } = await supabase.rpc("save_partner_perk", {
      p_description: f.get("description"),
      p_ends_at: new Date(String(f.get("ends_at"))).toISOString(),
      p_inventory: Number(f.get("inventory")) || null,
      p_member_limit: Number(f.get("member_limit")),
      p_partner_id: f.get("partner_id"),
      p_perk_id: f.get("id") || null,
      p_reservation_days: Number(f.get("reservation_days")),
      p_slug: f.get("slug"),
      p_starts_at: new Date(String(f.get("starts_at"))).toISOString(),
      p_status: f.get("status"),
      p_terms: f.get("terms"),
      p_title: f.get("title"),
    });
    setBusy("");
    setMessage(error ? error.message : "Partner benefit saved and audited.");
    if (!error) location.reload();
  }
  async function review(id: string, action: string) {
    const result = await ask({ title: action === "redeem" ? "Mark this benefit redeemed?" : "Cancel this benefit reservation?", description: action === "redeem" ? "Confirm that the partner delivered the benefit linked to this private redemption code." : "The private code will be cancelled and reserved inventory may become available again.", confirmLabel: action === "redeem" ? "Mark redeemed" : "Cancel reservation", tone: action === "cancel" ? "danger" : "default", fields: [{ name: "note", label: action === "redeem" ? "Redemption note (optional)" : "Cancellation reason", type: "textarea", required: action === "cancel", minLength: action === "cancel" ? 5 : undefined, maxLength: 500, help: "Use a short operational note without payment or identity details." }] });
    if (!result) return;
    const note = String(result.note ?? "");
    setBusy(id);
    const { error } = await supabase.rpc("review_perk_redemption", {
      p_action: action,
      p_note: note,
      p_redemption_id: id,
    });
    setBusy("");
    setMessage(error ? error.message : `Reservation ${action}ed.`);
    if (!error) location.reload();
  }
  async function reconcile() {
    setBusy("reconcile");
    const { data, error } = await supabase.rpc("expire_perk_redemptions");
    setBusy("");
    setMessage(
      error ? error.message : `${data} expired reservations released.`,
    );
    if (!error) location.reload();
  }
  if (!migrationReady)
    return (
      <section className="admin-section" id="perks-admin">
        <div className="admin-empty">
          <strong>Partner perks migration required</strong>
          <p>
            Apply the partner perks and redemption migration to activate
            operations.
          </p>
        </div>
      </section>
    );
  return (
    <section className="admin-section perks-admin" id="perks-admin">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Controlled member value</p>
          <h2>Partners &amp; perks</h2>
          <p>
            Publish reviewed offers, protect limited inventory and reconcile
            every private single-use code.
          </p>
        </div>
        <button
          className={enabled ? "danger-action" : ""}
          disabled={busy === "flag"}
          onClick={() => void toggle()}
        >
          {enabled ? "Pause reservations" : "Enable after sign-off"}
        </button>
      </div>
      <div className="perks-admin-grid">
        <form onSubmit={(event) => void savePartner(event)}>
          <label>
            Partner
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
            >
              <option value="">Create new</option>
              {partners.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="id" value={partner?.id ?? ""} />
          <label>
            Name
            <input
              name="name"
              required
              minLength={2}
              defaultValue={partner?.name ?? ""}
              key={`pn-${partnerId}`}
            />
          </label>
          <label>
            URL slug
            <input
              name="slug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              defaultValue={partner?.slug ?? ""}
              key={`ps-${partnerId}`}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              required
              minLength={20}
              defaultValue={partner?.description ?? ""}
              key={`pd-${partnerId}`}
            />
          </label>
          <div className="admin-form-row">
            <label>
              Category
              <input
                name="category"
                required
                defaultValue={partner?.category ?? ""}
                key={`pc-${partnerId}`}
              />
            </label>
            <label>
              Status
              <select
                name="status"
                defaultValue={partner?.status ?? "draft"}
                key={`pst-${partnerId}`}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <div className="admin-form-row">
            <label>
              City
              <input
                name="city"
                defaultValue={partner?.city ?? ""}
                key={`city-${partnerId}`}
              />
            </label>
            <label>
              Country
              <input
                name="country"
                required
                defaultValue={partner?.country ?? "Kenya"}
                key={`country-${partnerId}`}
              />
            </label>
          </div>
          <label>
            Website URL
            <input
              name="website_url"
              type="url"
              defaultValue={partner?.website_url ?? ""}
              key={`web-${partnerId}`}
            />
          </label>
          <label>
            Logo URL
            <input
              name="logo_url"
              type="url"
              defaultValue={partner?.logo_url ?? ""}
              key={`logo-${partnerId}`}
            />
          </label>
          <button
            className="button button-primary"
            disabled={busy === "partner"}
          >
            Save partner
          </button>
        </form>
        <form onSubmit={(event) => void savePerk(event)}>
          <label>
            Benefit
            <select value={perkId} onChange={(e) => setPerkId(e.target.value)}>
              <option value="">Create new</option>
              {perks.map((x) => (
                <option value={x.perk_id} key={x.perk_id}>
                  {x.title}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="id" value={perk?.perk_id ?? ""} />
          <label>
            Partner
            <select
              name="partner_id"
              required
              defaultValue={perk?.partner_id ?? ""}
              key={`pp-${perkId}`}
            >
              <option value="">Select</option>
              {partners.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input
              name="title"
              required
              minLength={3}
              defaultValue={perk?.title ?? ""}
              key={`pt-${perkId}`}
            />
          </label>
          <label>
            URL slug
            <input
              name="slug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              defaultValue={perk?.slug ?? ""}
              key={`slug-${perkId}`}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              required
              minLength={20}
              defaultValue={perk?.description ?? ""}
              key={`desc-${perkId}`}
            />
          </label>
          <label>
            Terms
            <textarea
              name="terms"
              required
              minLength={10}
              defaultValue={perk?.terms ?? ""}
              key={`terms-${perkId}`}
            />
          </label>
          <div className="admin-form-row">
            <label>
              Inventory
              <input
                name="inventory"
                type="number"
                min="1"
                placeholder="Unlimited"
                defaultValue={perk?.inventory_total ?? ""}
                key={`inv-${perkId}`}
              />
            </label>
            <label>
              Per member
              <input
                name="member_limit"
                type="number"
                min="1"
                max="10"
                defaultValue={perk?.per_member_limit ?? 1}
                key={`limit-${perkId}`}
              />
            </label>
          </div>
          <div className="admin-form-row">
            <label>
              Starts
              <input
                name="starts_at"
                type="datetime-local"
                required
                defaultValue={localDate(perk?.starts_at)}
                key={`start-${perkId}`}
              />
            </label>
            <label>
              Ends
              <input
                name="ends_at"
                type="datetime-local"
                required
                defaultValue={localDate(perk?.ends_at)}
                key={`end-${perkId}`}
              />
            </label>
          </div>
          <div className="admin-form-row">
            <label>
              Hold days
              <input
                name="reservation_days"
                type="number"
                min="1"
                max="30"
                defaultValue={7}
              />
            </label>
            <label>
              Status
              <select
                name="status"
                defaultValue={perk?.status ?? "draft"}
                key={`status-${perkId}`}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="paused">Paused</option>
                <option value="ended">Ended</option>
              </select>
            </label>
          </div>
          <button className="button button-primary" disabled={busy === "perk"}>
            Save benefit
          </button>
        </form>
      </div>
      <div className="perk-redemption-list">
        <header>
          <h3>Redemption ledger</h3>
          <button
            disabled={busy === "reconcile"}
            onClick={() => void reconcile()}
          >
            Release expired holds
          </button>
        </header>
        {redemptions.length ? (
          redemptions.map((r) => (
            <article key={r.redemption_id}>
              <div>
                <strong>{r.redemption_code}</strong>
                <small>
                  {r.perk_title} · {r.partner_name}
                </small>
              </div>
              <div>
                <strong>
                  {r.display_name || r.email}
                  {r.is_test_account ? " · TEST" : ""}
                </strong>
                <small>
                  Expires{" "}
                  {new Intl.DateTimeFormat("en-KE", {
                    dateStyle: "medium",
                  }).format(new Date(r.expires_at))}
                </small>
              </div>
              <span className="member-status">{r.status}</span>
              {r.status === "reserved" ? (
                <div className="member-actions">
                  <button
                    disabled={busy === r.redemption_id}
                    onClick={() => void review(r.redemption_id, "redeem")}
                  >
                    Mark redeemed
                  </button>
                  <button
                    disabled={busy === r.redemption_id}
                    onClick={() => void review(r.redemption_id, "cancel")}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <div className="admin-empty">
            <strong>No reservations</strong>
            <p>Member redemption codes will appear here for reconciliation.</p>
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
