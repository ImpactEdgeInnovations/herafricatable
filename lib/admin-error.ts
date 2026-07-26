type ErrorLike = {
  code?: unknown;
  message?: unknown;
};

const configurationPatterns = [
  /bucket/i,
  /could not find/i,
  /does not exist/i,
  /migration/i,
  /schema cache/i,
];

const technicalPatterns = [
  /duplicate key/i,
  /invalid input syntax/i,
  /permission denied for (?:relation|schema|sequence|table)/i,
  /row-level security/i,
  /sqlstate/i,
  /violates .* constraint/i,
];

function recoveryMessage(action: string) {
  return `We couldn't ${action}. Try again once. If it still fails, contact technical support from the Admin support area.`;
}

export function adminErrorMessage(error: unknown, action: string) {
  const candidate =
    typeof error === "string"
      ? error
      : error && typeof error === "object"
        ? (error as ErrorLike)
        : null;
  const message =
    typeof candidate === "string"
      ? candidate.trim()
      : typeof candidate?.message === "string"
        ? candidate.message.trim()
        : "";
  const code =
    typeof candidate === "object" && typeof candidate?.code === "string"
      ? candidate.code.toUpperCase()
      : "";

  if (/failed to fetch|load failed|network/i.test(message)) {
    return "The platform could not connect. Check your internet connection and try again.";
  }

  if (/jwt|session|authentication|not authenticated/i.test(message)) {
    return "Your Admin session has expired. Sign in again, then retry this action.";
  }

  if (/rate limit|too many requests/i.test(message)) {
    return "Too many attempts were made. Wait a moment, then try again.";
  }

  if (
    /not authorized|super admin required|admin required/i.test(message) ||
    code === "42501"
  ) {
    return "Your Admin role does not allow this action. Ask a Super Admin for help.";
  }

  if (configurationPatterns.some((pattern) => pattern.test(message))) {
    return "This feature is not fully configured yet. Contact technical support before retrying.";
  }

  const hasTechnicalCode = /^(?:PGRST|22|23|25|40|42|53|54|55|57|58|XX)/.test(
    code,
  );
  const hasTechnicalMessage = technicalPatterns.some((pattern) =>
    pattern.test(message),
  );

  if (
    !message ||
    hasTechnicalCode ||
    hasTechnicalMessage ||
    message.length > 280
  ) {
    return recoveryMessage(action);
  }

  return message;
}
