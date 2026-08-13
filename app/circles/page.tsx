import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { memberErrorMessage } from "@/lib/member-error";
import {
  CirclesHub,
  type CircleCycle,
  type MyCircle,
  type CircleMember,
  type CirclePrompt,
  type CircleResponse,
} from "@/components/member/circles-hub";
import { MemberHeader } from "@/components/member/member-header";
export const dynamic = "force-dynamic";
export default async function CirclesPage({
  searchParams,
}: {
  searchParams: Promise<{ circle?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_status")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.access_status !== "active") redirect("/home");
  const { data: flag } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", "circles")
    .maybeSingle();
  if (!flag?.enabled)
    return (
      <main className="circles-page">
        <MemberHeader label="Circles" />
        <section className="community-hold">
          <p className="eyebrow">Small rooms, deliberate chemistry</p>
          <h1>Circles are being prepared.</h1>
          <p>
            Matching will open only after the cycle, facilitation and privacy
            boundaries pass review.
          </p>
          <Link className="button button-outline" href="/home">
            Return home
          </Link>
        </section>
      </main>
    );
  const [cycleResult, circleResult] = await Promise.all([
    supabase.rpc("list_circle_cycles"),
    supabase.rpc("list_my_circles"),
  ]);
  const circles = (circleResult.data as MyCircle[] | null) ?? [];
  const requested = (await searchParams).circle;
  const selected = circles.some((c) => c.circle_id === requested)
    ? (requested ?? null)
    : (circles[0]?.circle_id ?? null);
  const [memberResult, promptResult] = selected
    ? await Promise.all([
        supabase.rpc("list_circle_members", { p_circle_id: selected }),
        supabase.rpc("list_circle_prompts", { p_circle_id: selected }),
      ])
    : [{ data: [] }, { data: [] }];
  const prompts = (promptResult.data as CirclePrompt[] | null) ?? [];
  const responseResults = await Promise.all(
    prompts.map((prompt) =>
      supabase.rpc("list_circle_responses", { p_prompt_id: prompt.prompt_id }),
    ),
  );
  const responses = Object.fromEntries(
    prompts.map((prompt, index) => [
      prompt.prompt_id,
      (responseResults[index].data as CircleResponse[] | null) ?? [],
    ]),
  );
  const journeyError = cycleResult.error ?? circleResult.error;
  return (
    <main className="circles-page">
      <MemberHeader label="Circles" />
      <section className="circles-hero">
        <p className="eyebrow">Small groups, thoughtfully matched</p>
        <h1>
          A smaller table
          <br />
          within the table.
        </h1>
        <p>
          Short, guided groups shaped around shared goals and complementary
          experience. Our team reviews every match before a Circle opens.
        </p>
      </section>
      {journeyError ? (
        <section className="network-error" role="alert">
          <strong>Circles are not ready.</strong>
          <p>{memberErrorMessage(journeyError, "load your Circles")}</p>
          <div className="journey-state-actions">
            <Link className="button button-primary" href="/circles">
              Try again
            </Link>
            <Link className="button button-outline" href="/support">
              Contact support
            </Link>
          </div>
        </section>
      ) : (
        <CirclesHub
          cycles={(cycleResult.data as CircleCycle[] | null) ?? []}
          circles={circles}
          selected={selected}
          members={(memberResult.data as CircleMember[] | null) ?? []}
          prompts={prompts}
          responses={responses}
        />
      )}
    </main>
  );
}
