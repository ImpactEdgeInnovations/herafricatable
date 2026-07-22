"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";

type DialogValue = boolean | string;
type DialogResult = Record<string, DialogValue>;

type DialogField = {
  help?: string;
  initialValue?: DialogValue;
  integer?: boolean;
  label: string;
  maxLength?: number;
  max?: number;
  matchValue?: string;
  minLength?: number;
  min?: number;
  name: string;
  options?: { label: string; value: string }[];
  placeholder?: string;
  required?: boolean;
  step?: number;
  type?: "checkbox" | "number" | "select" | "text" | "textarea";
};

type DialogOptions = {
  confirmLabel: string;
  description: string;
  fields?: DialogField[];
  title: string;
  tone?: "default" | "danger";
};

type PendingDialog = DialogOptions & {
  resolve: (result: DialogResult | null) => void;
};

function ActionDialog({ pending, settle }: { pending: PendingDialog; settle: (result: DialogResult | null) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [values, setValues] = useState<DialogResult>(() => Object.fromEntries((pending.fields ?? []).map((field) => [field.name, field.initialValue ?? (field.type === "checkbox" ? false : "")])));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    for (const field of pending.fields ?? []) {
      if (field.type === "checkbox") continue;
      const value = String(values[field.name] ?? "").trim();
      if (field.required && !value) nextErrors[field.name] = `${field.label} is required.`;
      else if (field.minLength && value.length < field.minLength) nextErrors[field.name] = `Enter at least ${field.minLength} characters.`;
      else if (field.matchValue !== undefined && value !== field.matchValue) nextErrors[field.name] = "The value does not match. Check it and try again.";
      else if (field.type === "number") {
        const number = Number(value);
        if (!Number.isFinite(number)) nextErrors[field.name] = "Enter a valid number.";
        else if (field.integer && !Number.isInteger(number)) nextErrors[field.name] = "Enter a whole number.";
        else if (field.min !== undefined && number < field.min) nextErrors[field.name] = `Enter ${field.min} or more.`;
        else if (field.max !== undefined && number > field.max) nextErrors[field.name] = `Enter ${field.max} or less.`;
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    settle(values);
  }

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="action-dialog"
      onCancel={(event) => { event.preventDefault(); settle(null); }}
      ref={dialogRef}
    >
      <form method="dialog" noValidate onSubmit={submit}>
        <header>
          <p className="eyebrow">Confirm action</p>
          <h2 id={titleId}>{pending.title}</h2>
          <p id={descriptionId}>{pending.description}</p>
        </header>
        {pending.fields?.length ? <div className="action-dialog-fields">{pending.fields.map((field) => {
          const fieldId = `${titleId}-${field.name}`;
          const errorId = `${fieldId}-error`;
          const helpId = `${fieldId}-help`;
          const describedBy = [field.help ? helpId : "", errors[field.name] ? errorId : ""].filter(Boolean).join(" ") || undefined;
          const value = values[field.name];
          if (field.type === "checkbox") return <label className="action-dialog-check" htmlFor={fieldId} key={field.name}><input checked={Boolean(value)} id={fieldId} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.checked }))} type="checkbox"/><span>{field.label}{field.help ? <small id={helpId}>{field.help}</small> : null}</span></label>;
          return <label htmlFor={fieldId} key={field.name}>{field.label}
            {field.type === "select" ? <select aria-describedby={describedBy} aria-invalid={Boolean(errors[field.name])} id={fieldId} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} value={String(value ?? "")}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              : field.type === "textarea" ? <textarea aria-describedby={describedBy} aria-invalid={Boolean(errors[field.name])} autoFocus id={fieldId} maxLength={field.maxLength} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} placeholder={field.placeholder} rows={4} value={String(value ?? "")}/>
                : <input aria-describedby={describedBy} aria-invalid={Boolean(errors[field.name])} autoFocus id={fieldId} max={field.max} maxLength={field.maxLength} min={field.min} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} placeholder={field.placeholder} step={field.step} type={field.type ?? "text"} value={String(value ?? "")}/>}
            {field.help ? <small className="field-help" id={helpId}>{field.help}</small> : null}
            {errors[field.name] ? <span className="field-error" id={errorId} role="alert">{errors[field.name]}</span> : null}
          </label>;
        })}</div> : null}
        <footer>
          <button onClick={() => settle(null)} type="button">Cancel</button>
          <button className={pending.tone === "danger" ? "danger" : "button-primary"} type="submit">{pending.confirmLabel}</button>
        </footer>
      </form>
    </dialog>
  );
}

export function useActionDialog(): { ask: (options: DialogOptions) => Promise<DialogResult | null>; dialog: ReactNode } {
  const [pending, setPending] = useState<PendingDialog | null>(null);
  const ask = useCallback((options: DialogOptions) => new Promise<DialogResult | null>((resolve) => setPending({ ...options, resolve })), []);
  const settle = useCallback((result: DialogResult | null) => {
    setPending((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);
  return { ask, dialog: pending ? <ActionDialog pending={pending} settle={settle} /> : null };
}
