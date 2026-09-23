import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "briefly-test-user",
      email: "test@example.com",
      name: "Test Client",
      loginMethod: "test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("brief submission guardrails", () => {
  it("rejects a brief when explicit terms consent is missing", async () => {
    const caller = appRouter.createCaller(createContext());

    await expect(caller.briefs.create({
      idea: "فكرة حملة تجريبية طويلة بما يكفي لاختبار حماية الشروط قبل الحفظ.",
      termsAccepted: false,
    })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("advertises the development payment mock without exposing it as production payment", async () => {
    const result = await appRouter.createCaller(createContext()).payments.status();
    expect(result.mockAvailable).toBe(true);
    expect(result.configured).toBe(false);
    expect(result.provider).toBe("stripe");
  });
});
