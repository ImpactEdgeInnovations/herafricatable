type ErrorLike = {
  code?: unknown;
  message?: unknown;
};

const technicalMessagePatterns = [
  /column .* does not exist/i,
  /duplicate key/i,
  /function .* does not exist/i,
  /invalid input syntax/i,
  /permission denied/i,
  /relation .* does not exist/i,
  /row-level security/i,
  /schema cache/i,
  /sqlstate/i,
  /violates .* constraint/i,
];

function recoveryMessage(action: string) {
  return `We couldn't ${action}. Please try again. If it still doesn't work, contact support from your account.`;
}

export function memberErrorMessage(error: unknown, action: string) {
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

  if (/failed to fetch|network|load failed/i.test(message)) {
    return "We couldn't connect. Check your internet connection and try again.";
  }

  if (/jwt|session|authentication|not authenticated/i.test(message)) {
    return "Your session has expired. Sign in again, then retry this action.";
  }

  if (/please wait before requesting this connection again/i.test(message)) {
    return "Give this member some time before requesting another introduction.";
  }

  if (/outstanding connection request limit/i.test(message)) {
    return "You have several introductions awaiting a response. Give members time to reply before sending more.";
  }

  if (/daily connection request limit/i.test(message)) {
    return "You’ve reached today’s introduction limit. You can send more tomorrow.";
  }

  if (/rate limit|too many requests/i.test(message)) {
    return "Too many attempts were made. Wait a moment, then try again.";
  }

  const hasTechnicalCode = /^(?:PGRST|22|23|25|40|42|53|54|55|57|58|XX)/.test(
    code,
  );
  const hasTechnicalMessage = technicalMessagePatterns.some((pattern) =>
    pattern.test(message),
  );

  if (
    !message ||
    hasTechnicalCode ||
    hasTechnicalMessage ||
    message.length > 240
  ) {
    return recoveryMessage(action);
  }

  return message;
}
