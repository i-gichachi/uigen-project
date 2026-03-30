// @vitest-environment node
import { test, expect, vi, beforeEach } from "vitest";
import { jwtVerify } from "jose";

vi.mock("server-only", () => ({}));

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ set: mockCookieSet })),
}));

// Import after mocks are in place
const { createSession } = await import("@/lib/auth");

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

beforeEach(() => {
  mockCookieSet.mockClear();
});

test("createSession sets an auth-token cookie", async () => {
  await createSession("user-1", "test@example.com");

  expect(mockCookieSet).toHaveBeenCalledOnce();
  const [cookieName] = mockCookieSet.mock.calls[0];
  expect(cookieName).toBe("auth-token");
});

test("createSession sets a valid signed JWT as the cookie value", async () => {
  await createSession("user-1", "test@example.com");

  const [, token] = mockCookieSet.mock.calls[0];
  const { payload } = await jwtVerify(token, JWT_SECRET);

  expect(payload.userId).toBe("user-1");
  expect(payload.email).toBe("test@example.com");
});

test("createSession sets cookie with httpOnly and correct path", async () => {
  await createSession("user-1", "test@example.com");

  const [, , options] = mockCookieSet.mock.calls[0];
  expect(options.httpOnly).toBe(true);
  expect(options.path).toBe("/");
  expect(options.sameSite).toBe("lax");
});

test("createSession sets secure: false outside production", async () => {
  await createSession("user-1", "test@example.com");

  const [, , options] = mockCookieSet.mock.calls[0];
  expect(options.secure).toBe(false);
});

test("createSession sets secure: true in production", async () => {
  const original = process.env.NODE_ENV;
  vi.stubEnv("NODE_ENV", "production");

  await createSession("user-1", "test@example.com");

  const [, , options] = mockCookieSet.mock.calls[0];
  expect(options.secure).toBe(true);

  vi.stubEnv("NODE_ENV", original);
});

test("createSession cookie expires in ~7 days", async () => {
  const before = Date.now();
  await createSession("user-1", "test@example.com");
  const after = Date.now();

  const [, , options] = mockCookieSet.mock.calls[0];
  const expires: Date = options.expires;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  expect(expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
  expect(expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
});

test("createSession JWT contains an expiration claim", async () => {
  await createSession("user-1", "test@example.com");

  const [, token] = mockCookieSet.mock.calls[0];
  const { payload } = await jwtVerify(token, JWT_SECRET);

  expect(payload.exp).toBeDefined();
});
