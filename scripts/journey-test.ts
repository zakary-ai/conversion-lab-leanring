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

  // 2. Backend enforces star gates via direct URL/API access
  const closingModule = await db.module.findFirst({ where: { title: "Closing" } });
  const closingLesson = await db.lesson.findFirst({ where: { moduleId: closingModule!.id } });
  const blocked = await call(`/api/lessons/${closingLesson!.id}/complete`, "POST");
  check("Locked module lesson completion blocked (403)", blocked.status === 403);

  const jobs = await db.job.findMany({ where: { status: "PUBLISHED" }, orderBy: { minStars: "asc" } });
  const applyBlocked = await call(`/api/jobs/${jobs[0].id}/apply`, "POST", { message: "hi" });
  check("Job application blocked before Job Board unlock (403)", applyBlocked.status === 403);

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

  // 9. Reach Job Board threshold via admin manual stars (tests admin flow + ledger)
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
  check("Balance now 3 (Job Board threshold)", boosted?.starBalance === 3);
  const manualTx = await db.starTransaction.findFirst({ where: { userId: user!.id, type: "MANUAL_AWARD" } });
  check("Manual award in ledger with actor + reason", manualTx !== null && manualTx.createdById !== null && manualTx.reason.includes("Roleplay"));
  const jobUnlockNotice = await db.notification.findFirst({ where: { userId: user!.id, type: "JOB_UNLOCKED" } });
  check("Job Board unlock notification sent", jobUnlockNotice !== null);

  // 10. User opens a job and applies (as the learner again)
  cookie = "";
  await call("/api/auth/signin", "POST", { email, password: "password123" });
  const eligibleJob = jobs.find((j) => j.minStars <= 3)!;
  const apply = await call(`/api/jobs/${eligibleJob.id}/apply`, "POST", {
    message: "I just completed Foundations and earned my roleplay certification. Ready to work.",
  });
  check("Job application submitted", apply.status === 200);
  const application = await db.jobApplication.findFirst({
    where: { userId: user!.id },
    include: { job: true },
  });
  check("Application persisted in My Applications", application !== null && application.status === "APPLIED");

  // 5-star job should still be blocked
  const eliteJob = jobs.find((j) => j.minStars === 5);
  if (eliteJob) {
    const eliteBlocked = await call(`/api/jobs/${eliteJob.id}/apply`, "POST", { message: "hi" });
    check("5-star job still blocked at 3 stars (403)", eliteBlocked.status === 403);
  }

  // 11. Admin sees and updates the application → applicant notified
  const updateApp = await fetch(`${BASE}/api/admin/applications/${application!.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ status: "UNDER_REVIEW" }),
  });
  check("Admin can update application status", updateApp.status === 200);
  const updated = await db.jobApplication.findUnique({ where: { id: application!.id } });
  check("Status persisted as Under Review", updated?.status === "UNDER_REVIEW");
  const appNotice = await db.notification.findFirst({
    where: { userId: user!.id, type: "APPLICATION_UPDATE" },
  });
  check("Applicant notified of status change", appNotice !== null);

  // 12. Community + DM security spot checks
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

  // Search doesn't leak restricted jobs (5-star job at 3 stars)
  const search = await call(`/api/search?q=Closer`);
  const searchResults = (search.data.results ?? []) as { title: string; type: string }[];
  check(
    "Search hides jobs above star level",
    !searchResults.some((r) => r.type === "Jobs" && r.title.includes("High-Ticket"))
  );

  console.log(failures === 0 ? "\n🎉 CORE JOURNEY: ALL CHECKS PASSED" : `\n💥 ${failures} CHECKS FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => db.$disconnect());
