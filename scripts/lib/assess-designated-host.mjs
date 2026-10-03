export function assessDesignatedHost({ account, profile, latestApplicationStatus, assignedUserId }) {
  const accountExists = Boolean(account);
  const emailConfirmed = Boolean(account?.email_confirmed_at);
  const profileStatus = profile?.access_status ?? null;
  const onboardingComplete = Boolean(profile?.onboarding_completed_at);
  const assignedToPilot = Boolean(account?.id && account.id === assignedUserId);
  return {
    accountExists,
    emailConfirmed,
    profileStatus,
    onboardingComplete,
    latestApplicationStatus: latestApplicationStatus ?? null,
    assignedToPilot,
    readyForPilot: emailConfirmed && profileStatus === "active" &&
      onboardingComplete && assignedToPilot,
  };
}
