/**
 * Demo seed: a fully-populated academy so every feature is experienceable
 * immediately. Run with `npm run db:seed` (destructive — dev only).
 *
 * Demo accounts (password: academy123):
 *   owner@demo.conversionlab.io   — Super Admin
 *   admin@demo.conversionlab.io   — Admin (John Bennett)
 *   morgan@demo.conversionlab.io  — Moderator (Morgan Hayes)
 *   jordan@demo.conversionlab.io  — Learner, 0 Stars (fresh start)
 *   alex@demo.conversionlab.io    — Learner, 2 Stars (mid-program: Objection Handling)
 *   taylor@demo.conversionlab.io  — Learner, 5 Stars (advanced content unlocked)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { localDateParts, slotKeyFor, zonedTimeToUtc } from "../src/lib/booking";
import { addDaysYmd, seriesOccurrences, type SeriesRule } from "../src/lib/call-series";

const db = new PrismaClient();

// Reliable, publicly hosted sample media so the video player demonstrably works.
const SAMPLE_VIDEOS = [
  "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
];
let videoIndex = 0;
function nextVideo() {
  return SAMPLE_VIDEOS[videoIndex++ % SAMPLE_VIDEOS.length];
}

const daysAgo = (n: number, h = 12) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000 + h * 60 * 60 * 1000 - 12 * 60 * 60 * 1000);
const daysFromNow = (n: number, hour = 19) => {
  const d = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  d.setHours(hour, 0, 0, 0);
  return d;
};

async function main() {
  console.log("Clearing existing data…");
  // Order matters for FK constraints; cascades handle most of it.
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.unlockEvent.deleteMany();
  await db.starTransaction.deleteMany();
  await db.booking.deleteMany();
  await db.availabilityWindow.deleteMany();
  await db.hostAvailability.deleteMany();
  await db.callRecording.deleteMany();
  await db.callAttendee.deleteMany();
  await db.liveCall.deleteMany();
  await db.dmMessage.deleteMany();
  await db.dmParticipant.deleteMany();
  await db.dmConversation.deleteMany();
  await db.messageReaction.deleteMany();
  await db.message.deleteMany();
  await db.channelMembership.deleteMany();
  await db.channel.deleteMany();
  await db.quizAttempt.deleteMany();
  await db.quizAnswer.deleteMany();
  await db.quizQuestion.deleteMany();
  await db.quiz.deleteMany();
  await db.lessonProgress.deleteMany();
  await db.lessonResource.deleteMany();
  await db.lesson.deleteMany();
  await db.videoAsset.deleteMany();
  await db.enrollment.deleteMany();
  await db.module.deleteMany();
  await db.course.deleteMany();
  await db.moderationAction.deleteMany();
  await db.passwordResetToken.deleteMany();
  await db.session.deleteMany();
  await db.profile.deleteMany();
  await db.user.deleteMany();
  await db.platformSetting.deleteMany();

  console.log("Creating users…");
  const password = await bcrypt.hash("academy123", 10);
  const mkUser = (
    email: string,
    name: string,
    role: "SUPER_ADMIN" | "ADMIN" | "MODERATOR" | "LEARNER",
    stars: number,
    profile: { headline?: string; bio?: string; location?: string; skills?: string[]; salesExperience?: string; resumeUrl?: string; linkedinUrl?: string; availability?: string },
    timezone = "America/New_York"
  ) =>
    db.user.create({
      data: {
        email,
        name,
        role,
        passwordHash: password,
        starBalance: stars,
        timezone,
        onboardedAt: daysAgo(30),
        lastActiveAt: daysAgo(0, 10),
        profile: { create: profile },
      },
    });

  const owner = await mkUser("owner@demo.conversionlab.io", "Dana Whitfield", "SUPER_ADMIN", 0, {
    headline: "Founder, Conversion Lab",
  });
  const admin = await mkUser("admin@demo.conversionlab.io", "John Bennett", "ADMIN", 0, {
    headline: "Head of Training",
    bio: "15 years closing enterprise deals. Now I build closers.",
  });
  const moderator = await mkUser("morgan@demo.conversionlab.io", "Morgan Hayes", "MODERATOR", 0, {
    headline: "Community Lead",
  }, "America/Chicago");
  const jordan = await mkUser("jordan@demo.conversionlab.io", "Jordan Lee", "LEARNER", 0, {
    headline: "New to sales, all in",
    location: "Denver, CO",
  }, "America/Denver");
  const alex = await mkUser("alex@demo.conversionlab.io", "Alex Carter", "LEARNER", 2, {
    headline: "SDR leveling up to closer",
    bio: "Two years setting appointments for a SaaS startup. Here to master discovery and closing so I can move into an AE seat.",
    location: "Austin, TX",
    skills: ["Cold calling", "Discovery", "CRM hygiene", "Follow-up systems"],
    salesExperience: "2 years as an SDR at a Series B SaaS company. Consistently 110%+ of meeting quota.",
    resumeUrl: "https://example.com/resumes/alex-carter.pdf",
    linkedinUrl: "https://linkedin.com/in/alexcarter-demo",
    availability: "Evenings & weekends while employed",
  }, "America/Chicago");
  const taylor = await mkUser("taylor@demo.conversionlab.io", "Taylor Brooks", "LEARNER", 5, {
    headline: "High-ticket closer · $2.1M closed in 2025",
    bio: "Closed for three coaching offers. Looking for my next high-ticket opportunity with a serious team.",
    location: "Miami, FL",
    skills: ["High-ticket closing", "Objection handling", "Roleplay coaching", "Pipeline management"],
    salesExperience: "4 years closing high-ticket coaching and agency offers. Average close rate 31%.",
    resumeUrl: "https://example.com/resumes/taylor-brooks.pdf",
    linkedinUrl: "https://linkedin.com/in/taylorbrooks-demo",
    availability: "Available immediately",
  });

  console.log("Creating training program…");
  const course = await db.course.create({
    data: {
      title: "Sales Mastery Program",
      description:
        "The complete path from first cold call to confident close. Work through each module in order, pass the assessments, and earn Stars that unlock advanced training, private channels, and real sales opportunities.",
      status: "PUBLISHED",
      minStars: 0,
      sortOrder: 0,
    },
  });

  type LessonSeed = { title: string; description: string; minutes: number };
  async function createModule(opts: {
    title: string;
    description: string;
    sortOrder: number;
    minStars: number;
    starReward: number;
    prerequisiteId?: string;
    lessons: LessonSeed[];
    quiz?: {
      title: string;
      description: string;
      questions: {
        type?: "MULTIPLE_CHOICE" | "MULTIPLE_SELECT" | "TRUE_FALSE";
        prompt: string;
        explanation?: string;
        answers: [string, boolean][];
      }[];
    };
  }) {
    const mod = await db.module.create({
      data: {
        courseId: course.id,
        title: opts.title,
        description: opts.description,
        sortOrder: opts.sortOrder,
        minStars: opts.minStars,
        starReward: opts.starReward,
        prerequisiteId: opts.prerequisiteId,
        status: "PUBLISHED",
      },
    });
    for (let i = 0; i < opts.lessons.length; i++) {
      const l = opts.lessons[i];
      const asset = await db.videoAsset.create({
        data: {
          title: l.title,
          provider: "url",
          reference: nextVideo(),
          durationSec: l.minutes * 60,
        },
      });
      await db.lesson.create({
        data: {
          moduleId: mod.id,
          title: l.title,
          description: l.description,
          type: "VIDEO",
          videoAssetId: asset.id,
          durationMin: l.minutes,
          sortOrder: i,
          status: "PUBLISHED",
        },
      });
    }
    if (opts.quiz) {
      await db.quiz.create({
        data: {
          moduleId: mod.id,
          title: opts.quiz.title,
          description: opts.quiz.description,
          passingScore: 80,
          allowRetry: true,
          status: "PUBLISHED",
          questions: {
            create: opts.quiz.questions.map((q, qi) => ({
              type: q.type ?? "MULTIPLE_CHOICE",
              prompt: q.prompt,
              explanation: q.explanation,
              sortOrder: qi,
              answers: {
                create: q.answers.map(([text, isCorrect], ai) => ({
                  text,
                  isCorrect,
                  sortOrder: ai,
                })),
              },
            })),
          },
        },
      });
    }
    return mod;
  }

  const foundations = await createModule({
    title: "Sales Foundations",
    description: "The mindset and mechanics that separate professionals from order-takers.",
    sortOrder: 0,
    minStars: 0,
    starReward: 1,
    lessons: [
      { title: "Welcome to the Program", description: "How the program works, how Stars are earned, and the standard we hold each other to. Watch this first.", minutes: 6 },
      { title: "The Professional Sales Mindset", description: "Selling is a transfer of certainty. Build the identity of a professional: preparation, ownership, and detachment from any single outcome.", minutes: 14 },
      { title: "What Makes a Great Salesperson", description: "The four competencies every top producer shares — and the practice system you'll use to build each one.", minutes: 12 },
      { title: "Understanding the Prospect", description: "People buy for their reasons, not yours. Learn to map pain, priority, and urgency before you ever pitch.", minutes: 15 },
    ],
    quiz: {
      title: "Foundations Assessment",
      description: "Prove you've internalized the fundamentals. 80% required to pass and earn your first Star.",
      questions: [
        {
          prompt: "A prospect says they're 'just looking around.' What's the professional response?",
          explanation: "Curiosity beats pressure. Understanding what prompted them to look opens the real conversation.",
          answers: [
            ["Ask what prompted them to start looking now", true],
            ["Immediately present your best discount", false],
            ["Give them your card and wait for them to call", false],
            ["Pitch every feature so they remember you", false],
          ],
        },
        {
          prompt: "What is the primary job of a salesperson in the first conversation?",
          explanation: "Diagnose before you prescribe — discovery precedes pitching, always.",
          answers: [
            ["Understand the prospect's situation and pain", true],
            ["Deliver the full product presentation", false],
            ["Negotiate the price early", false],
            ["Qualify their budget only", false],
          ],
        },
        {
          type: "MULTIPLE_SELECT",
          prompt: "Which behaviors build trust early in a sales conversation? (Select all that apply)",
          explanation: "Trust comes from genuine curiosity and honesty — including saying when you're NOT a fit.",
          answers: [
            ["Asking questions about their world before talking about yours", true],
            ["Being willing to say when your product isn't a fit", true],
            ["Talking fast so you sound confident", false],
            ["Agreeing with everything they say", false],
          ],
        },
        {
          type: "TRUE_FALSE",
          prompt: "Top producers rely on natural talent more than on repeatable process.",
          explanation: "The opposite: elite salespeople run tighter, more repeatable processes than average ones.",
          answers: [
            ["True", false],
            ["False", true],
          ],
        },
        {
          prompt: "Certainty transfers from salesperson to prospect primarily through:",
          answers: [
            ["Conviction, preparation, and calm under pressure", true],
            ["A longer feature list", false],
            ["Discounts and urgency tactics", false],
            ["Talking more than the prospect", false],
          ],
        },
      ],
    },
  });

  const discovery = await createModule({
    title: "Discovery",
    description: "Run discovery calls that surface real pain and set up an inevitable close.",
    sortOrder: 1,
    minStars: 0,
    starReward: 1,
    prerequisiteId: foundations.id,
    lessons: [
      { title: "The Discovery Framework", description: "The 5-stage discovery structure: frame, current state, desired state, gap, and consequence. Use it on every call.", minutes: 18 },
      { title: "Questions That Open People Up", description: "Move beyond surface answers with layered questions: situation → impact → emotion. Includes 20 field-tested prompts.", minutes: 16 },
      { title: "Listening for Buying Signals", description: "What prospects say when they're leaning in — and the mistakes that shut them back down.", minutes: 11 },
      { title: "Qualifying Without Interrogating", description: "Budget, authority, need, and timeline woven naturally into conversation instead of a checklist.", minutes: 13 },
    ],
    quiz: {
      title: "Discovery Mastery Assessment",
      description: "10-minute check on your discovery process. Pass to earn your second Star.",
      questions: [
        {
          prompt: "What should you establish FIRST on a discovery call?",
          explanation: "A clear frame — purpose, agenda, and permission — sets up everything that follows.",
          answers: [
            ["The frame: purpose, agenda, and permission to ask questions", true],
            ["The price range", false],
            ["Your company's credentials", false],
            ["The contract terms", false],
          ],
        },
        {
          prompt: "A prospect describes a problem flatly, with no emotion. What's your best move?",
          explanation: "Impact questions convert stated problems into felt problems — which is what drives action.",
          answers: [
            ["Ask what the problem is costing them — in money, time, or stress", true],
            ["Move straight to the demo", false],
            ["Assume it's not a real problem and disqualify", false],
            ["Present the solution immediately", false],
          ],
        },
        {
          type: "MULTIPLE_SELECT",
          prompt: "Which are components of the gap you're trying to surface in discovery? (Select all that apply)",
          answers: [
            ["Where the prospect is today (current state)", true],
            ["Where they want to be (desired state)", true],
            ["The cost of staying where they are", true],
            ["Your product's feature roadmap", false],
          ],
        },
        {
          type: "TRUE_FALSE",
          prompt: "If a prospect has budget and authority, discovery can be skipped.",
          explanation: "Qualification isn't discovery. Without pain and priority, budget never gets spent.",
          answers: [
            ["True", false],
            ["False", true],
          ],
        },
        {
          prompt: "The best time to talk about your solution on a discovery call is:",
          answers: [
            ["After the prospect has articulated the cost of their problem", true],
            ["In the first five minutes", false],
            ["Whenever there's a silence to fill", false],
            ["Never — solutions are for the second call only, no exceptions", false],
          ],
        },
      ],
    },
  });

  const objections = await createModule({
    title: "Objection Handling",
    description: "Turn resistance into progress. The exact frameworks for price, partner, and 'think about it'.",
    sortOrder: 2,
    minStars: 0,
    starReward: 1,
    prerequisiteId: discovery.id,
    lessons: [
      { title: "Why Objections Are Buying Signals", description: "Indifferent prospects don't object — they disappear. Reframe objections as requests for more certainty.", minutes: 10 },
      { title: "The A.R.C. Framework", description: "Acknowledge, Reframe, Confirm: the three-step structure that works on any objection without arguing.", minutes: 17 },
      { title: "Handling 'It's Too Expensive'", description: "Price objections are value gaps. Diagnose which of the four price objections you're really hearing.", minutes: 15 },
      { title: "'I Need to Talk to My Partner'", description: "Prevent it early, and handle it cleanly when it appears — without disrespecting the relationship.", minutes: 12 },
      { title: "'Let Me Think About It'", description: "The politest way prospects say no. Isolate the real concern while keeping the relationship intact.", minutes: 14 },
      { title: "Objection Roleplay Compilation", description: "Watch live-fire roleplays: real objections, handled in real time, with breakdowns of every move.", minutes: 22 },
      { title: "Stacking Certainty Before the Close", description: "The pre-close checklist that prevents most objections from ever appearing.", minutes: 9 },
      { title: "Field Drills: Your Objection Playbook", description: "Build your personal playbook for the five objections you hear most, then drill it.", minutes: 11 },
    ],
    quiz: {
      title: "Objection Handling Assessment",
      description: "Pass to complete the module and earn your third Star.",
      questions: [
        {
          prompt: "In the A.R.C. framework, what does the 'A' stand for?",
          explanation: "Acknowledging first lowers defenses — you can't reframe someone who feels unheard.",
          answers: [
            ["Acknowledge", true],
            ["Argue", false],
            ["Ask", false],
            ["Advance", false],
          ],
        },
        {
          prompt: "'It's too expensive' most often actually means:",
          explanation: "Price objections are usually value gaps — the cost feels bigger than the outcome.",
          answers: [
            ["The value isn't clear enough yet", true],
            ["They literally have no money", false],
            ["They want you to talk faster", false],
            ["The conversation is over", false],
          ],
        },
        {
          type: "TRUE_FALSE",
          prompt: "The best response to an objection is a fast, airtight rebuttal.",
          explanation: "Rebuttals create arguments. Acknowledgment plus a question creates progress.",
          answers: [
            ["True", false],
            ["False", true],
          ],
        },
        {
          prompt: "A prospect says 'let me think about it.' Your first move is to:",
          answers: [
            ["Warmly isolate: 'Totally fair — usually that means something isn't sitting right. Is it the price, the timing, or something else?'", true],
            ["Offer a discount before they hang up", false],
            ["Schedule a follow-up for next quarter", false],
            ["Repeat the entire pitch again", false],
          ],
        },
      ],
    },
  });

  const closing = await createModule({
    title: "Closing",
    description: "Ask with confidence. Closing structures that feel natural because the work was done earlier.",
    sortOrder: 3,
    minStars: 2,
    starReward: 1,
    prerequisiteId: objections.id,
    lessons: [
      { title: "Closing Is a Process, Not a Moment", description: "Every earlier step either sets up or sabotages the close. See the whole arc.", minutes: 12 },
      { title: "The Assumptive Close Done Right", description: "Confidence without pressure — when assumption is earned and when it backfires.", minutes: 14 },
      { title: "The Summary Close", description: "Stack the prospect's own words into an undeniable case, then ask.", minutes: 10 },
      { title: "Negotiating Without Discounting", description: "Trade, don't cave: protect value while giving the prospect a win.", minutes: 16 },
      { title: "Following Up Without Being Ignored", description: "The follow-up cadence that revives stalled deals — with message templates.", minutes: 13 },
    ],
    quiz: {
      title: "Closing Assessment",
      description: "Demonstrate your closing process to earn your fourth Star.",
      questions: [
        {
          prompt: "The summary close works because it:",
          answers: [
            ["Uses the prospect's own words to make the case", true],
            ["Creates artificial urgency", false],
            ["Hides the price until the end", false],
            ["Wears the prospect down", false],
          ],
        },
        {
          prompt: "A prospect asks for 20% off. The strongest first response is to:",
          explanation: "Never concede instantly. Understand what's behind the ask, then trade value for value.",
          answers: [
            ["Ask what's driving the request before responding", true],
            ["Agree immediately to save the deal", false],
            ["End the call", false],
            ["Offer 30% to overdeliver", false],
          ],
        },
        {
          type: "TRUE_FALSE",
          prompt: "If discovery and objection handling were done well, the close should feel like a natural next step.",
          answers: [
            ["True", true],
            ["False", false],
          ],
        },
        {
          type: "MULTIPLE_SELECT",
          prompt: "Which are healthy closing behaviors? (Select all that apply)",
          answers: [
            ["Asking clearly and directly for the business", true],
            ["Being silent after you ask", true],
            ["Apologizing for the price", false],
            ["Pressuring with fake deadlines", false],
          ],
        },
      ],
    },
  });

  await createModule({
    title: "Advanced Sales",
    description: "Multi-stakeholder deals, enterprise motions, and building your personal sales system.",
    sortOrder: 4,
    minStars: 3,
    starReward: 1,
    prerequisiteId: closing.id,
    lessons: [
      { title: "Selling to Multiple Stakeholders", description: "Map the buying committee: champion, economic buyer, blocker — and the plays for each.", minutes: 19 },
      { title: "The Champion Playbook", description: "Turn one believer into an internal sales force that closes when you're not in the room.", minutes: 15 },
      { title: "Building Your Personal Sales System", description: "Pipeline math, daily non-negotiables, and the review loop that compounds skill.", minutes: 17 },
    ],
  });

  console.log("Enrolling learners + seeding progress…");
  for (const u of [jordan, alex, taylor]) {
    await db.enrollment.create({ data: { userId: u.id, courseId: course.id } });
  }

  // Helper: complete all lessons + pass quiz for a module, then log the star in the ledger
  async function completeModuleFor(
    userId: string,
    moduleId: string,
    moduleTitle: string,
    when: Date,
    balanceBefore: number
  ) {
    const lessons = await db.lesson.findMany({ where: { moduleId } });
    for (const l of lessons) {
      await db.lessonProgress.create({
        data: { userId, lessonId: l.id, startedAt: when, completedAt: when },
      });
    }
    const quiz = await db.quiz.findFirst({ where: { moduleId }, include: { questions: { include: { answers: true } } } });
    if (quiz) {
      const responses: Record<string, string[]> = {};
      for (const q of quiz.questions) {
        responses[q.id] = q.answers.filter((a) => a.isCorrect).map((a) => a.id);
      }
      await db.quizAttempt.create({
        data: { quizId: quiz.id, userId, score: 100, passed: true, responses, startedAt: when, completedAt: when },
      });
    }
    await db.starTransaction.create({
      data: {
        userId,
        amount: 1,
        type: "AUTOMATIC_REWARD",
        sourceType: "module",
        sourceId: moduleId,
        reason: `${moduleTitle} completed`,
        previousBalance: balanceBefore,
        newBalance: balanceBefore + 1,
        createdAt: when,
      },
    });
    return balanceBefore + 1;
  }

  // Alex: Foundations + Discovery complete (2 stars), partway through Objection Handling
  let alexBalance = 0;
  alexBalance = await completeModuleFor(alex.id, foundations.id, "Sales Foundations", daysAgo(21), alexBalance);
  await completeModuleFor(alex.id, discovery.id, "Discovery", daysAgo(12), alexBalance);
  const ohLessons = await db.lesson.findMany({ where: { moduleId: objections.id }, orderBy: { sortOrder: "asc" } });
  for (let i = 0; i < 5; i++) {
    await db.lessonProgress.create({
      data: {
        userId: alex.id,
        lessonId: ohLessons[i].id,
        startedAt: daysAgo(6 - i),
        completedAt: i < 5 ? daysAgo(5 - i) : null,
      },
    });
  }
  await db.unlockEvent.createMany({
    data: [
      { userId: alex.id, entityType: "recording", entityId: null, title: "Cold Calling Roleplay — Full Session", atStars: 1, createdAt: daysAgo(21) },
      { userId: alex.id, entityType: "module", entityId: closing.id, title: "Closing", atStars: 2, createdAt: daysAgo(12) },
    ],
  });

  // Taylor: everything complete + manual awards → 5 stars
  let taylorBalance = 0;
  taylorBalance = await completeModuleFor(taylor.id, foundations.id, "Sales Foundations", daysAgo(60), taylorBalance);
  taylorBalance = await completeModuleFor(taylor.id, discovery.id, "Discovery", daysAgo(52), taylorBalance);
  taylorBalance = await completeModuleFor(taylor.id, objections.id, "Objection Handling", daysAgo(45), taylorBalance);
  taylorBalance = await completeModuleFor(taylor.id, closing.id, "Closing", daysAgo(38), taylorBalance);
  await db.starTransaction.create({
    data: {
      userId: taylor.id,
      amount: 1,
      type: "MANUAL_AWARD",
      reason: "Live roleplay certification — passed with distinction",
      previousBalance: taylorBalance,
      newBalance: taylorBalance + 1,
      createdById: admin.id,
      createdAt: daysAgo(30),
    },
  });
  taylorBalance += 1;

  console.log("Creating community…");
  const channelSeeds = [
    { slug: "general", name: "general", description: "Introductions, announcements, and everything in between", section: "COMMUNITY", minStars: 0, sortOrder: 0 },
    { slug: "wins", name: "wins", description: "Closed a deal? Booked a meeting? Post it here.", section: "COMMUNITY", minStars: 0, sortOrder: 1 },
    { slug: "questions", name: "questions", description: "No dumb questions. Ask anything about the training or live deals.", section: "COMMUNITY", minStars: 0, sortOrder: 2 },
    { slug: "roleplay", name: "roleplay", description: "Find roleplay partners and post practice recordings", section: "COMMUNITY", minStars: 0, sortOrder: 3 },
    { slug: "cold-calling", name: "cold-calling", description: "Openers, dial sessions, and call reviews", section: "COMMUNITY", minStars: 0, sortOrder: 4 },
    { slug: "closing", name: "closing", description: "Deal strategy and closing tactics", section: "COMMUNITY", minStars: 0, sortOrder: 5 },
    { slug: "advanced-sales", name: "advanced-sales", description: "For members at 3+ Stars: enterprise motions and advanced plays", section: "ADVANCED", minStars: 3, sortOrder: 0 },
    { slug: "job-prep", name: "job-prep", description: "Interview prep and career support for advanced members", section: "ADVANCED", minStars: 3, sortOrder: 1 },
    { slug: "moderators", name: "moderators", description: "Staff coordination", section: "STAFF", minStars: 0, minRole: "MODERATOR", sortOrder: 0 },
    { slug: "announcements", name: "announcements", description: "Official academy announcements", section: "COMMUNITY", minStars: 0, readOnly: true, sortOrder: 6 },
  ] as const;
  const channels: Record<string, string> = {};
  for (const c of channelSeeds) {
    const ch = await db.channel.create({
      data: {
        slug: c.slug,
        name: c.name,
        description: c.description,
        section: c.section,
        minStars: c.minStars,
        minRole: "minRole" in c ? c.minRole : null,
        readOnly: "readOnly" in c ? c.readOnly : false,
        sortOrder: c.sortOrder,
      },
    });
    channels[c.slug] = ch.id;
  }

  const msg = (channel: string, userId: string, content: string, when: Date, pinned = false) =>
    db.message.create({
      data: { channelId: channels[channel], userId, content, createdAt: when, pinned },
    });

  const m1 = await msg("announcements", admin.id, "Welcome to Conversion Lab. 📈 Start with Sales Foundations, introduce yourself in #general, and bring one real call to Thursday's live roleplay. The standard here is simple: do the reps.", daysAgo(14), true);
  await msg("general", moderator.id, "New members: drop an intro — where you're from, what you sell, and what you want out of the next 90 days.", daysAgo(10));
  await msg("general", alex.id, "Alex from Austin 👋 SDR at a SaaS company, 2 years in. Goal: move into an AE seat by Q1. Just finished the Discovery module — the layered questions framework is already changing my calls.", daysAgo(9));
  await msg("general", taylor.id, "Welcome Alex! The jump from SDR to closer is exactly what this place is for. DM me if you want a roleplay partner.", daysAgo(9));
  const winMsg = await msg("wins", taylor.id, "Closed a $14k coaching package this morning. 🎯 Used the summary close straight from Module 4 — stacked her own words from discovery and just asked. She said 'well, when you put it that way…' and signed.", daysAgo(2));
  await msg("wins", alex.id, "Booked 7 meetings this week — personal best. The permission bridge from the cold call script is stupidly effective.", daysAgo(1));
  await msg("questions", jordan.id, "Just starting Module 1 — how many lessons should I aim for per day? Don't want to binge it and retain nothing.", daysAgo(1));
  await msg("questions", moderator.id, "Great question. One or two lessons a day, and drill each one on a real or roleplay call before moving on. Speed is the enemy of retention.", daysAgo(0, 9));
  await msg("roleplay", alex.id, "Looking for an objection-handling roleplay partner, evenings CT. I'll play prospect first. Who's in?", daysAgo(0, 8));
  await msg("cold-calling", moderator.id, "Dial session tomorrow 9am ET — post your numbers after. Volume + review = progress.", daysAgo(3));
  await msg("closing", taylor.id, "Reminder from today's deal: silence after the ask is a skill. Count to ten in your head if you must. The first one to speak…", daysAgo(2, 15));
  await msg("advanced-sales", taylor.id, "Multi-stakeholder tip from this week: your champion needs a one-pager they can defend without you in the room. Build it for them.", daysAgo(4));

  await db.messageReaction.createMany({
    data: [
      { messageId: winMsg.id, userId: alex.id, emoji: "🔥" },
      { messageId: winMsg.id, userId: moderator.id, emoji: "🔥" },
      { messageId: winMsg.id, userId: jordan.id, emoji: "👏" },
      { messageId: m1.id, userId: alex.id, emoji: "👍" },
      { messageId: m1.id, userId: taylor.id, emoji: "👍" },
    ],
  });

  // Memberships (read tracking)
  for (const [slug, channelId] of Object.entries(channels)) {
    const members =
      slug === "moderators"
        ? [owner.id, admin.id, moderator.id]
        : slug === "advanced-sales" || slug === "job-prep"
          ? [taylor.id, moderator.id, admin.id]
          : [alex.id, taylor.id, jordan.id, moderator.id, admin.id];
    for (const userId of members) {
      await db.channelMembership.create({
        data: { channelId, userId, lastReadAt: daysAgo(1) },
      });
    }
  }

  console.log("Creating DMs…");
  const dm = await db.dmConversation.create({
    data: {
      participants: { create: [{ userId: alex.id }, { userId: taylor.id }] },
    },
  });
  const dmMsgs = [
    [taylor.id, "Hey Alex — saw your intro. Seriously, if you want reps on objection handling I'm around most evenings.", daysAgo(8, 18)],
    [alex.id, "That would be huge. I keep getting wrecked by 'send me the info and I'll look it over' 😅", daysAgo(8, 19)],
    [taylor.id, "Classic stall. It's almost never about the info. Tomorrow 7pm CT? I'll play the prospect first and throw that exact one at you.", daysAgo(8, 19)],
    [alex.id, "Deal. I'll bring my playbook doc from Module 3.", daysAgo(7, 9)],
    [taylor.id, "That session was solid. Your acknowledge step is way smoother already. Same time next week — we'll do price objections.", daysAgo(0, 8)],
  ] as const;
  for (const [senderId, content, when] of dmMsgs) {
    await db.dmMessage.create({
      data: { conversationId: dm.id, senderId, content, createdAt: when },
    });
  }
  // Leave the last message unread for Alex
  await db.dmParticipant.updateMany({
    where: { conversationId: dm.id, userId: alex.id },
    data: { lastReadAt: daysAgo(1) },
  });

  console.log("Creating live calls…");
  const upcoming = await db.liveCall.create({
    data: {
      title: "Live Objection Handling Roleplay",
      description:
        "Hot-seat roleplays on the objections you're hearing this week. Bring one real objection from a live deal — we'll run it, break it down, and run it again. Cameras on, reps first.",
      hostId: admin.id,
      scheduledAt: daysFromNow(2, 19),
      durationMin: 60,
      minStars: 0,
      recordingEnabled: true,
      status: "SCHEDULED",
    },
  });
  for (const u of [alex.id, taylor.id, jordan.id, moderator.id]) {
    await db.callAttendee.create({ data: { callId: upcoming.id, userId: u } });
  }
  await db.liveCall.create({
    data: {
      title: "Advanced Deal Strategy Session",
      description: "For 3+ Star members: live pipeline reviews on multi-stakeholder deals.",
      hostId: moderator.id,
      scheduledAt: daysFromNow(6, 18),
      durationMin: 45,
      minStars: 3,
      recordingEnabled: true,
      status: "SCHEDULED",
      attendees: { create: [{ userId: taylor.id }] },
    },
  });
  // A repeating call: every Monday at 6 PM Eastern for eight weeks, starting next Monday.
  const todayNy = localDateParts("America/New_York", new Date());
  const todayYmd = `${todayNy.year}-${String(todayNy.month).padStart(2, "0")}-${String(todayNy.day).padStart(2, "0")}`;
  const nextMonday = addDaysYmd(todayYmd, ((1 - todayNy.weekday + 7) % 7) || 7);
  const standupRule: SeriesRule = {
    timezone: "America/New_York",
    daysOfWeek: [1],
    intervalWeeks: 1,
    startMinute: 18 * 60,
    startsOn: nextMonday,
    endsOn: addDaysYmd(nextMonday, 7 * 8 - 1),
  };
  const standup = await db.callSeries.create({
    data: {
      title: "Monday Momentum — Weekly Pipeline Review",
      description: "Start the week with live pipeline reviews: bring one stalled deal and leave with a next step.",
      hostId: moderator.id,
      ...standupRule,
      durationMin: 45,
      minStars: 0,
      recordingEnabled: true,
      calls: {
        create: seriesOccurrences(standupRule).map((at) => ({
          title: "Monday Momentum — Weekly Pipeline Review",
          description: "Start the week with live pipeline reviews: bring one stalled deal and leave with a next step.",
          hostId: moderator.id,
          scheduledAt: at,
          seriesSlot: at,
          durationMin: 45,
          minStars: 0,
          recordingEnabled: true,
        })),
      },
    },
    include: { calls: { orderBy: { scheduledAt: "asc" }, take: 1 } },
  });
  if (standup.calls[0]) {
    await db.callAttendee.createMany({ data: [alex.id, taylor.id].map((userId) => ({ callId: standup.calls[0].id, userId })) });
  }
  const pastCall = await db.liveCall.create({
    data: {
      title: "Cold Calling Roleplay",
      description: "Openers, tonality, and the permission bridge — with live dials.",
      hostId: admin.id,
      scheduledAt: daysAgo(1, 19),
      durationMin: 60,
      minStars: 0,
      recordingEnabled: true,
      status: "ENDED",
      attendees: {
        create: [
          { userId: alex.id, joinedAt: daysAgo(1, 19) },
          { userId: taylor.id, joinedAt: daysAgo(1, 19) },
          { userId: jordan.id, joinedAt: daysAgo(1, 19) },
        ],
      },
    },
  });
  await db.callRecording.create({
    data: {
      callId: pastCall.id,
      title: "Cold Calling Roleplay — Full Session",
      url: nextVideo(),
      minStars: 1,
      status: "PUBLISHED",
      recordedAt: daysAgo(1, 20),
    },
  });

  console.log("Creating 1-on-1 availability + bookings…");
  const adminAvailability = await db.hostAvailability.create({
    data: {
      hostId: admin.id,
      timezone: "America/New_York",
      slotMinutes: 30,
      minNoticeMinutes: 120,
      acceptingBookings: true,
      windows: {
        create: [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
          { dayOfWeek, startMinute: 10 * 60, endMinute: 12 * 60 },
          { dayOfWeek, startMinute: 14 * 60, endMinute: 16 * 60 },
        ]),
      },
    },
  });
  await db.hostAvailability.create({
    data: {
      hostId: moderator.id,
      timezone: "America/Chicago",
      slotMinutes: 45,
      minNoticeMinutes: 60,
      acceptingBookings: true,
      windows: { create: [2, 4].map((dayOfWeek) => ({ dayOfWeek, startMinute: 17 * 60, endMinute: 20 * 60 })) },
    },
  });
  // Alex has a confirmed session with John on the next weekday at least two days out, 10:00 ET.
  let sessionStart: Date | null = null;
  for (let n = 2; n <= 8 && !sessionStart; n++) {
    const p = localDateParts("America/New_York", daysFromNow(n));
    if (p.weekday >= 1 && p.weekday <= 5) sessionStart = zonedTimeToUtc("America/New_York", p.year, p.month, p.day, 10, 0);
  }
  const alexBooking = await db.booking.create({
    data: {
      hostId: admin.id,
      learnerId: alex.id,
      startsAt: sessionStart!,
      endsAt: new Date(sessionStart!.getTime() + 30 * 60 * 1000),
      durationMin: adminAvailability.slotMinutes,
      learnerTz: "America/Los_Angeles",
      note: "Want to run my price objection responses past you before Thursday's roleplay.",
      slotKey: slotKeyFor(admin.id, sessionStart!),
      createdAt: daysAgo(1),
    },
  });
  await db.booking.create({
    data: {
      hostId: moderator.id,
      learnerId: taylor.id,
      startsAt: daysAgo(9, 17),
      endsAt: daysAgo(9, 17.75),
      durationMin: 45,
      learnerTz: "America/Chicago",
      status: "CANCELLED",
      cancelledAt: daysAgo(10),
      cancelledById: taylor.id,
      cancelReason: "Client call ran over — will rebook.",
      createdAt: daysAgo(14),
    },
  });

  console.log("Creating notifications…");
  await db.notification.createMany({
    data: [
      { userId: alex.id, type: "CALL_UPCOMING", title: "New live call: Live Objection Handling Roleplay", body: "Thursday 7:00 PM — hosted by John Bennett", linkUrl: `/calls/${upcoming.id}`, createdAt: daysAgo(2) },
      { userId: alex.id, type: "NEW_DM", title: "New message from Taylor Brooks", body: "That session was solid. Your acknowledge step is way smoother already…", linkUrl: `/messages/${dm.id}`, createdAt: daysAgo(0, 8) },
      { userId: alex.id, type: "STAR_EARNED", title: "Star earned — you now have 2 Stars", body: "Discovery completed", linkUrl: "/dashboard", readAt: daysAgo(11), createdAt: daysAgo(12) },
      { userId: alex.id, type: "CONTENT_UNLOCKED", title: "New content unlocked (2)", body: "Closing, Closing Framework", linkUrl: "/dashboard", readAt: daysAgo(11), createdAt: daysAgo(12) },
      { userId: alex.id, type: "BOOKING_CONFIRMED", title: "1-on-1 booked with John Bennett", body: "Your join link is on the 1-on-1s page.", linkUrl: "/one-on-ones", createdAt: daysAgo(1) },
      { userId: admin.id, type: "BOOKING_CONFIRMED", title: "Alex Carter booked a 1-on-1 with you", body: "Note: Want to run my price objection responses past you before Thursday's roleplay.", linkUrl: "/one-on-ones", createdAt: daysAgo(1) },
      { userId: jordan.id, type: "SYSTEM", title: "Welcome to Conversion Lab", body: "Start with Sales Foundations — your first Star is waiting.", linkUrl: "/training", createdAt: daysAgo(1) },
    ],
  });

  console.log("Creating audit trail…");
  await db.auditLog.createMany({
    data: [
      { actorId: admin.id, action: "course.publish", entityType: "course", entityId: course.id, details: { title: "Sales Mastery Program" }, createdAt: daysAgo(30) },
      { actorId: admin.id, action: "star.award", entityType: "user", entityId: taylor.id, details: { amount: 1, reason: "Live roleplay certification — passed with distinction" }, createdAt: daysAgo(30) },
      { actorId: admin.id, action: "availability.update", entityType: "host_availability", entityId: adminAvailability.id, details: { timezone: "America/New_York", slotMinutes: 30, acceptingBookings: true, windows: 10 }, createdAt: daysAgo(6) },
      { actorId: alex.id, action: "booking.create", entityType: "booking", entityId: alexBooking.id, details: { hostId: admin.id, startsAt: alexBooking.startsAt.toISOString() }, createdAt: daysAgo(1) },
      { actorId: owner.id, action: "user.role_changed", entityType: "user", entityId: moderator.id, details: { from: "LEARNER", to: "MODERATOR", name: "Morgan Hayes" }, createdAt: daysAgo(40) },
    ],
  });

  console.log("\nSeed complete ✅");
  console.log("Demo accounts (password: academy123):");
  console.log("  owner@demo.conversionlab.io   Super Admin");
  console.log("  admin@demo.conversionlab.io   Admin");
  console.log("  morgan@demo.conversionlab.io  Moderator");
  console.log("  jordan@demo.conversionlab.io  Learner · 0 Stars");
  console.log("  alex@demo.conversionlab.io    Learner · 2 Stars");
  console.log("  taylor@demo.conversionlab.io  Learner · 5 Stars");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
