import styles from "./event-networking.module.css";

export type EventNetworkingSchedule = {
  starts_at: string; ends_at: string; minutes: number; status: string; disabled: boolean;
};
export function NetworkingSchedule({ schedule, timeZone, failed = false }: { schedule: EventNetworkingSchedule | null; timeZone: string; failed?: boolean }) {
  if (failed) return <aside className={styles.publicSchedule} role="status"><h3>Networking</h3><p>Networking times couldn’t load. Please reload the event page before making plans.</p></aside>;
  if (!schedule) return null;
  const time = (value: string) => new Intl.DateTimeFormat("en-KE", { hour:"numeric", minute:"2-digit", timeZone }).format(new Date(value));
  return <aside className={styles.publicSchedule} aria-label="Networking schedule"><div><h3>Networking</h3><p><time dateTime={schedule.starts_at}>{time(schedule.starts_at)}</time>–<time dateTime={schedule.ends_at}>{time(schedule.ends_at)}</time> <span>· {schedule.minutes}-minute conversations</span></p></div><p>{schedule.disabled || schedule.status === "paused" ? "Currently paused. Check the event page for updates." : schedule.status === "finished" ? "This networking session has finished." : "Optional introductions. Check in when you arrive to take part."}</p></aside>;
}
