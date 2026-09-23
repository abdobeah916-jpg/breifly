import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createBrief, getBriefForOwner, listBriefsForOwner, updateBrief } from "./db";

const TERMS_VERSION = "2026-09-08";
const emptyJson = JSON.stringify([]);

const briefSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    oneLiner: { type: "string" },
    context: { type: "string" },
    objective: { type: "string" },
    audience: { type: "string" },
    proposition: { type: "string" },
    tone: { type: "string" },
    deliverables: { type: "array", items: { type: "string" } },
    channels: { type: "array", items: { type: "string" } },
    successMetrics: { type: "array", items: { type: "string" } },
    constraints: { type: "array", items: { type: "string" } },
    openQuestions: { type: "array", items: { type: "string" } },
  },
  required: [
    "title",
    "oneLiner",
    "context",
    "objective",
    "audience",
    "proposition",
    "tone",
    "deliverables",
    "channels",
    "successMetrics",
    "constraints",
    "openQuestions",
  ],
  additionalProperties: false,
} as const;

const answerSchema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    confidence: { type: "string", enum: ["known", "suggested", "unknown"] },
    followUpQuestion: { type: "string" },
    needsHumanConfirmation: { type: "boolean" },
  },
  required: ["answer", "confidence", "followUpQuestion", "needsHumanConfirmation"],
  additionalProperties: false,
} as const;

function messageText(content: unknown) {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function parseJson<T>(content: unknown): T {
  try {
    return JSON.parse(messageText(content)) as T;
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر قراءة نتيجة الذكاء الاصطناعي." });
  }
}

function publicBrief(brief: any) {
  const paid = brief.paymentStatus === "paid";
  return {
    briefId: brief.briefId,
    status: brief.status,
    paymentStatus: brief.paymentStatus,
    termsAccepted: Boolean(brief.termsVersion && brief.acceptedAt),
    locked: !paid,
    idea: brief.idea,
    projectType: brief.projectType,
    audience: brief.audience,
    structuredBrief: paid ? parseStored(brief.structuredBrief) : null,
    openQuestions: paid ? parseStored(brief.openQuestions) : [],
    createdAt: brief.createdAt,
    updatedAt: brief.updatedAt,
  };
}

function parseStored(value: string) {
  try { return JSON.parse(value); } catch { return value; }
}

const briefInput = z.object({
  idea: z.string().trim().min(30, "اكتب فكرة أوضح قليلًا (30 حرفًا على الأقل)."),
  projectType: z.string().trim().max(120).optional(),
  audience: z.string().trim().max(800).optional(),
  scope: z.string().trim().max(800).optional(),
  budget: z.string().trim().max(120).optional(),
  targetDate: z.string().trim().max(120).optional(),
  structuredBrief: z.string().trim().max(20000).optional(),
  termsAccepted: z.boolean(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  assistant: router({
    ask: publicProcedure
      .input(z.object({ question: z.string().trim().min(2).max(800), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1200) })).max(8).default([]) }))
      .mutation(async ({ input }) => {
        const history = input.history.map(item => ({ role: item.role as "user" | "assistant", content: item.content }));
        try {
          const response = await invokeLLM({
            model: "gpt-5-mini",
            messages: [
              {
                role: "system",
                content: "أنت Briefly Assistant. أجب بالعربية الواضحة وباختصار عن تجربة Briefly وتحويل الأفكار إلى creative briefs. ميّز بين معلومة مؤكدة واقتراح ومعلومة غير معروفة. لا تخترع أسعارًا أو مواعيد أو سياسات أو وعودًا، ولا تطلب كلمات مرور أو بيانات بطاقة. القرار النهائي في النطاق والسعر والموعد للفريق البشري. أخرج JSON فقط.",
              },
              ...history,
              { role: "user", content: input.question },
            ],
            response_format: { type: "json_schema", json_schema: { name: "briefly_assistant", strict: true, schema: answerSchema } },
          });
          return parseJson<{ answer: string; confidence: "known" | "suggested" | "unknown"; followUpQuestion: string; needsHumanConfirmation: boolean }>(response.choices[0]?.message?.content);
        } catch {
          try {
            const fallback = await invokeLLM({
              model: "gpt-5-mini",
              messages: [
                { role: "system", content: "أنت Briefly Assistant. أجب بالعربية الواضحة عن Briefly فقط. لا تخترع سعرًا أو موعدًا أو سياسة. إذا لم تعرف، قل إن الإجابة تحتاج تأكيد الفريق." },
                ...history,
                { role: "user", content: input.question },
              ],
            });
            const answer = messageText(fallback.choices[0]?.message?.content).trim();
            if (answer) return { answer, confidence: "suggested" as const, followUpQuestion: "", needsHumanConfirmation: false };
          } catch {
            // Return an honest, visible state instead of leaving the widget without a response.
          }
          return { answer: "المساعد غير متاح مؤقتًا. يمكنك متابعة النموذج الآن، أو إعادة المحاولة بعد قليل، أو إرسال السؤال للفريق.", confidence: "unknown" as const, followUpQuestion: "", needsHumanConfirmation: true };
        }
      }),
  }),
  briefs: router({
    create: protectedProcedure.input(briefInput).mutation(async ({ ctx, input }) => {
      if (!input.termsAccepted) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "لا يمكن إرسال brief قبل الموافقة الصريحة على الشروط." });
      }
      const briefId = `BR-${nanoid(8).toUpperCase()}`;
      const now = new Date();
      const created = await createBrief({
        briefId,
        ownerId: ctx.user.id,
        status: "submitted",
        idea: input.idea,
        projectType: input.projectType || null,
        audience: input.audience || null,
        scope: input.scope || null,
        budget: input.budget || null,
        targetDate: input.targetDate || null,
        structuredBrief: input.structuredBrief || JSON.stringify({}),
        aiNotes: emptyJson,
        openQuestions: emptyJson,
        termsVersion: TERMS_VERSION,
        acceptedAt: now,
        acceptedBy: ctx.user.id,
        consentScope: JSON.stringify(["brief_submission", "team_review", "site_production"]),
        paymentStatus: "unpaid",
        paymentCurrency: "usd",
      });
      return publicBrief(created);
    }),
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await listBriefsForOwner(ctx.user.id);
      return rows.map(publicBrief);
    }),
    get: protectedProcedure.input(z.object({ briefId: z.string().min(4) })).query(async ({ ctx, input }) => {
      const brief = await getBriefForOwner(input.briefId, ctx.user.id);
      if (!brief) throw new TRPCError({ code: "NOT_FOUND", message: "الـ brief غير موجود." });
      return publicBrief(brief);
    }),
    generate: protectedProcedure.input(z.object({ briefId: z.string().min(4) })).mutation(async ({ ctx, input }) => {
      const brief = await getBriefForOwner(input.briefId, ctx.user.id);
      if (!brief) throw new TRPCError({ code: "NOT_FOUND", message: "الـ brief غير موجود." });
      if (!brief.termsVersion || !brief.acceptedAt) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "الموافقة على الشروط مطلوبة أولًا." });
      }
      if (brief.paymentStatus !== "paid") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "أكمل الدفع لفتح توليد الـ brief." });
      }
      try {
        const response = await invokeLLM({
          model: "gpt-5-mini",
          messages: [
            {
              role: "system",
              content: "أنت استراتيجي إبداعي محترف. حوّل مدخلات العميل إلى creative brief عملي ومنظم بالعربية. لا تضف معلومات غير موجودة كحقائق؛ سمّ الافتراضات اقتراحات وضع الأسئلة الناقصة في openQuestions. أخرج JSON فقط.",
            },
            {
              role: "user",
              content: JSON.stringify({ idea: brief.idea, projectType: brief.projectType, audience: brief.audience, scope: brief.scope, budget: brief.budget, targetDate: brief.targetDate }),
            },
          ],
          response_format: { type: "json_schema", json_schema: { name: "creative_brief", strict: true, schema: briefSchema } },
        });
        const structured = parseJson<Record<string, unknown>>(response.choices[0]?.message?.content);
        const updated = await updateBrief(input.briefId, ctx.user.id, {
          structuredBrief: JSON.stringify(structured),
          openQuestions: JSON.stringify(structured.openQuestions ?? []),
          aiNotes: JSON.stringify([{ text: "تم تنظيم المدخلات عبر LLM مع فصل الأسئلة المفتوحة.", confidence: "suggested", source: "ai" }]),
        });
        return updated ? publicBrief(updated) : publicBrief({ ...brief, structuredBrief: JSON.stringify(structured), paymentStatus: "paid" });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "تعذر توليد الـ brief مؤقتًا. جرّب مرة أخرى." });
      }
    }),
  }),
  payments: router({
    status: protectedProcedure.query(async () => ({
      configured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.VITE_STRIPE_PUBLISHABLE_KEY),
      mockAvailable: !ENV.isProduction,
      provider: "stripe",
      mode: "test",
      priceLabel: "Pay-per-Brief",
      currency: "usd",
      canGenerate: false,
      message: "الدفع الآمن يحتاج مفاتيح Stripe من إعدادات المشروع.",
    })),
    createCheckout: protectedProcedure.input(z.object({ briefId: z.string().min(4) })).mutation(async () => {
      if (!process.env.STRIPE_SECRET_KEY || !process.env.VITE_STRIPE_PUBLISHABLE_KEY) {
        return {
          configured: false,
          checkoutUrl: null,
          message: "Stripe غير مهيأ بعد. أضف مفاتيح الاختبار من إعدادات الدفع أولًا.",
        } as const;
      }
      throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "بوابة Stripe تحتاج إكمال إعداد مفاتيح المشروع والـ webhook." });
    }),
    mockPayment: protectedProcedure.input(z.object({ briefId: z.string().min(4) })).mutation(async ({ ctx, input }) => {
      if (ENV.isProduction) {
        throw new TRPCError({ code: "FORBIDDEN", message: "الدفع التجريبي متاح في development فقط." });
      }
      const brief = await getBriefForOwner(input.briefId, ctx.user.id);
      if (!brief) throw new TRPCError({ code: "NOT_FOUND", message: "الـ brief غير موجود." });
      if (!brief.termsVersion || !brief.acceptedAt) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "الموافقة على الشروط مطلوبة قبل الدفع التجريبي." });
      }
      const updated = await updateBrief(input.briefId, ctx.user.id, {
        paymentStatus: "paid",
        paymentIntentId: `mock_${nanoid(10)}`,
        paymentAmount: 0,
        paymentCurrency: "usd",
      });
      if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر تحديث حالة الدفع التجريبي." });
      return publicBrief(updated);
    }),
  }),
});

export type AppRouter = typeof appRouter;
