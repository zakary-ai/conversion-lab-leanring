/**
 * End-to-end verification of the core user journey (spec §46) against the
 * running server, with DB checks through Prisma.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
let cookie = "";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function call(path: string, method = "GET", body?: unknown, useCookie = cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(useCookie ? { Cookie: useCookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie && setCookie.includes("academy_session")) {
    cookie = setCookie.split(";")[0];
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data: data as Record<string, unknown> & Record<string, never> };
}

async function main() {
  const email = `journey-${Date.now()}@test.dev`;

  // 1. NEW USER signs up
  const signup = await call("/api/auth/signup", "POST", {
    name: "Journey Tester",
    email,
    password: "password123",
  });
  check("Signup succeeds", signup.status === 200);
  const user = await db.user.findUnique({ where: { email } });
  check("Starts with 0 Stars", user?.starBalance === 0);

  // 1b. Onboarding asks for a time zone and stores it on the account
  const onboarding = await call("/api/onboarding", "POST", { headline: "Journey tester", timezone: "America/Chicago" });
  const onboarded = await db.user.findUnique({ where: { email } });
  check("Onboarding saves the time zone on the account", onboarding.status === 200 && onboarded?.timezone === "America/Chicago", onboarded?.timezone ?? "unset");
  const badZone = await call("/api/profile", "PATCH", { timezone: "Mars/Olympus_Mons" });
  check("Unknown time zone rejected (400)", badZone.status === 400);

  // 2. Backend enforces star gates via direct URL/API access
  const closingModule = await db.module.findFirst({ where: { title: "Closing" } });
  const closingLesson = await db.lesson.findFirst({ where: { moduleId: closingModule!.id } });
  const blocked = await call(`/api/lessons/${closingLesson!.id}/complete`, "POST");
  check("Locked module lesson completion blocked (403)", blocked.status === 403);

  // 3. Complete Module 1 (Sales Foundations) lessons
  const foundations = await db.module.findFirst({
    where: { title: "Sales Foundations" },
    include: { lessons: { orderBy: { sortOrder: "asc" } }, quizzes: true },
  });
  for (const lesson of foundations!.lessons) {
    await call(`/api/lessons/${lesson.id}/start`, "POST");
    const done = await call(`/api/lessons/${lesson.id}/complete`, "POST");
    if (done.status !== 200) check(`Complete lesson ${lesson.title}`, false, JSON.stringify(done.data));
  }
  const progressCount = await db.lessonProgress.count({
    where: { userId: user!.id, completedAt: { not: null } },
  });
  check("Lesson progress persisted", progressCount === foundations!.lessons.length, `${progressCount} lessons`);

  // No star yet — quiz still pending
  const midUser = await db.user.findUnique({ where: { email } });
  check("No star before quiz passed", midUser?.starBalance === 0);

  // 4. Take the quiz — first FAIL it (all wrong answers)
  const quiz = await db.quiz.findFirst({
    where: { moduleId: foundations!.id },
    include: { questions: { include: { answers: true } } },
  });
  const wrongResponses: Record<string, string[]> = {};
  for (const q of quiz!.questions) {
    wrongResponses[q.id] = [q.answers.find((a) => !a.isCorrect)!.id];
  }
  const failAttempt = await call(`/api/quizzes/${quiz!.id}/submit`, "POST", { responses: wrongResponses });
  check("Failing quiz returns passed=false", failAttempt.status === 200 && failAttempt.data.passed === false, `score ${failAttempt.data.score}`);
  const afterFail = await db.user.findUnique({ where: { email } });
  check("No star after failed attempt", afterFail?.starBalance === 0);

  // 5. Retry and PASS
  const rightResponses: Record<string, string[]> = {};
  for (const q of quiz!.questions) {
    rightResponses[q.id] = q.answers.filter((a) => a.isCorrect).map((a) => a.id);
  }
  const passAttempt = await call(`/api/quizzes/${quiz!.id}/submit`, "POST", { responses: rightResponses });
  check("Passing quiz returns passed=true", passAttempt.status === 200 && passAttempt.data.passed === true, `score ${passAttempt.data.score}`);
  const award = passAttempt.data.award as { stars: number; newBalance: number; unlocks: unknown[] } | null;
  check("Star award returned in response", award !== null && award.stars === 1);

  // 6. Star transaction recorded, balance updated
  const afterPass = await db.user.findUnique({ where: { email } });
  check("Star balance is now 1", afterPass?.starBalance === 1);
  const txs = await db.starTransaction.findMany({ where: { userId: user!.id } });
  check("Exactly one star transaction recorded", txs.length === 1 && txs[0].type === "AUTOMATIC_REWARD");
  check("Transaction stores balances", txs[0].previousBalance === 0 && txs[0].newBalance === 1);

  // 7. Idempotency: re-submitting the quiz must NOT double-award
  await call(`/api/quizzes/${quiz!.id}/submit`, "POST", { responses: rightResponses });
  const lessonAgain = await call(`/api/lessons/${foundations!.lessons[0].id}/complete`, "POST");
  check("Re-completing lesson doesn't re-award", lessonAgain.data.award === null);
  const txs2 = await db.starTransaction.findMany({ where: { userId: user!.id, sourceType: "module" } });
  check("Star awarded exactly once", txs2.length === 1, `${txs2.length} module transactions`);
  const finalBalance = await db.user.findUnique({ where: { email } });
  check("Balance still 1 after re-submissions", finalBalance?.starBalance === 1);

  // 8. Notifications + unlock events written
  const notifications = await db.notification.findMany({ where: { userId: user!.id } });
  check(
    "Star + quiz notifications created",
    notifications.some((n) => n.type === "STAR_EARNED") && notifications.some((n) => n.type === "QUIZ_RESULT")
  );

  // 9. Admin manual stars (tests admin flow + ledger)
  const adminLogin = await call("/api/auth/demo", "POST", { email: "admin@demo.conversionlab.io" }, "");
  const adminCookie = cookie;
  check("Admin demo login works", adminLogin.status === 200);
  const adjust = await fetch(`${BASE}/api/admin/users/${user!.id}/stars`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ amount: 2, reason: "Roleplay certification (journey test)" }),
  });
  check("Admin manual star award works", adjust.status === 200);
  const boosted = await db.user.findUnique({ where: { email } });
  check("Balance now 3 after manual award", boosted?.starBalance === 3);
  const manualTx = await db.starTransaction.findFirst({ where: { userId: user!.id, type: "MANUAL_AWARD" } });
  check("Manual award in ledger with actor + reason", manualTx !== null && manualTx.createdById !== null && manualTx.reason.includes("Roleplay"));

  // 9b. Recurring live calls: one rule creates every occurrence; cancelling the series cancels the future ones
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const seriesStart = ymd(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const seriesEnd = ymd(new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)); // 28 days → each weekday 4×
  const seriesRes = await fetch(`${BASE}/api/admin/calls`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      title: "Journey weekly roleplay",
      date: seriesStart,
      time: "18:00",
      timezone: "America/New_York",
      durationMin: 45,
      hostOnZoom: false,
      repeat: { daysOfWeek: [1, 3], intervalWeeks: 1, endsOn: seriesEnd },
    }),
  });
  const seriesData = (await seriesRes.json().catch(() => ({}))) as { series?: { id: string }; calls?: unknown[] };
  check("Admin can schedule a repeating call", seriesRes.status === 200 && Boolean(seriesData.series?.id), JSON.stringify(seriesData).slice(0, 120));
  const seriesCalls = seriesData.series ? await db.liveCall.findMany({ where: { seriesId: seriesData.series.id }, orderBy: { scheduledAt: "asc" } }) : [];
  check("Series created 8 sessions (Mon + Wed × 4 weeks)", seriesCalls.length === 8, `${seriesCalls.length} sessions`);
  const sixPmEastern = seriesCalls.every((c) => {
    const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(c.scheduledAt));
    return h === 18;
  });
  check("Every session is at 6 PM Eastern", sixPmEastern);
  const seriesNotice = await db.notification.findFirst({ where: { userId: user!.id, type: "CALL_UPCOMING", title: { contains: "Journey weekly" } } });
  check("Learner notified once about the series", seriesNotice !== null && Boolean(seriesNotice?.body?.includes("Every Monday and Wednesday")));
  if (seriesData.series) {
    const cancelSeries = await fetch(`${BASE}/api/admin/call-series/${seriesData.series.id}`, { method: "DELETE", headers: { Cookie: adminCookie } });
    const cancelledCount = await db.liveCall.count({ where: { seriesId: seriesData.series.id, status: "CANCELLED" } });
    check("Cancelling the series cancels all upcoming sessions", cancelSeries.status === 200 && cancelledCount === 8, `${cancelledCount} cancelled`);
  }

  // 10. 1-on-1 bookings: host opens availability, learner books, double-booking blocked, cancel frees the slot
  const availabilityBody = {
    timezone: "UTC",
    slotMinutes: 30,
    minNoticeMinutes: 0,
    acceptingBookings: true,
    zoomUserId: "",
    windows: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startMinute: 0, endMinute: 1440 })),
  };
  const setAvailability = await fetch(`${BASE}/api/one-on-ones/availability`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify(availabilityBody),
  });
  check("Admin can set 1-on-1 availability", setAvailability.status === 200);

  cookie = "";
  await call("/api/auth/signin", "POST", { email, password: "password123" });
  const learnerAvailability = await call("/api/one-on-ones/availability", "PUT", availabilityBody);
  check("Learner cannot set availability (403)", learnerAvailability.status === 403);

  const adminUser = await db.user.findUnique({ where: { email: "admin@demo.conversionlab.io" } });
  const slotFrom = new Date();
  const slotTo = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const slotsRes = await call(
    `/api/one-on-ones/hosts/${adminUser!.id}/slots?from=${slotFrom.toISOString()}&to=${slotTo.toISOString()}`
  );
  const slots = ((slotsRes.data as unknown as { slots?: { startsAt: string }[] }).slots ?? []);
  check("Learner sees open slots", slotsRes.status === 200 && slots.length > 0, `${slots.length} slots`);
  const chosen = slots[0]?.startsAt;

  const bookingBody = { hostId: adminUser!.id, startsAt: chosen, learnerTz: "UTC", note: "Journey test session" };
  const booked = await call("/api/one-on-ones/bookings", "POST", bookingBody);
  check("Booking succeeds", booked.status === 200, JSON.stringify(booked.data).slice(0, 120));
  const booking = await db.booking.findFirst({ where: { learnerId: user!.id, status: "CONFIRMED" } });
  check("Booking persisted as CONFIRMED with slotKey", booking !== null && booking.slotKey !== null);
  const duplicate = await call("/api/one-on-ones/bookings", "POST", bookingBody);
  check("Same slot cannot be booked twice (409)", duplicate.status === 409);
  const learnerNotice = await db.notification.findFirst({ where: { userId: user!.id, type: "BOOKING_CONFIRMED" } });
  const hostNotice = await db.notification.findFirst({
    where: { userId: adminUser!.id, type: "BOOKING_CONFIRMED", createdAt: { gte: slotFrom } },
  });
  check("Both people notified of the booking", learnerNotice !== null && hostNotice !== null);

  const cancelled = await call(`/api/one-on-ones/bookings/${booking!.id}/cancel`, "POST", { reason: "Journey test cancel" });
  check("Learner can cancel", cancelled.status === 200);
  const afterCancel = await db.booking.findUnique({ where: { id: booking!.id } });
  check("Cancelled booking frees its slot", afterCancel?.status === "CANCELLED" && afterCancel.slotKey === null);
  const cancelNotice = await db.notification.findFirst({
    where: { userId: adminUser!.id, type: "BOOKING_CANCELLED", createdAt: { gte: slotFrom } },
  });
  check("Host notified of cancellation", cancelNotice !== null);
  const rebooked = await call("/api/one-on-ones/bookings", "POST", bookingBody);
  check("Freed slot can be booked again", rebooked.status === 200);

  // 11. Community + DM security spot checks
  const staffChannel = await db.channel.findFirst({ where: { slug: "moderators" } });
  const staffBlocked = await call(`/api/channels/${staffChannel!.id}/messages`);
  check("Learner blocked from staff channel (403)", staffBlocked.status === 403);

  const foreignDm = await db.dmConversation.findFirst();
  const dmBlocked = await call(`/api/dms/${foreignDm!.id}/messages`);
  check("Learner blocked from others' DMs (403)", dmBlocked.status === 403);

  const generalChannel = await db.channel.findFirst({ where: { slug: "general" } });
  const post = await call(`/api/channels/${generalChannel!.id}/messages`, "POST", {
    content: "Just passed the Foundations assessment — Star #1 earned! 🎉",
  });
  check("Community message persists", post.status === 200);

  console.log(failures === 0 ? "\n🎉 CORE JOURNEY: ALL CHECKS PASSED" : `\n💥 ${failures} CHECKS FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => db.$disconnect());
