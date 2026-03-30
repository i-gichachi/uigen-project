import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

// --- mocks ---

// vi.hoisted ensures these are available when vi.mock factories run (which are hoisted)
const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

const mockSignInAction = vi.mocked(signInAction);
const mockSignUpAction = vi.mocked(signUpAction);
const mockGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockClearAnonWork = vi.mocked(clearAnonWork);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateProject = vi.mocked(createProject);

// --- helpers ---

beforeEach(() => {
  vi.clearAllMocks();
});

function setupDefaults() {
  mockGetAnonWorkData.mockReturnValue(null);
  mockGetProjects.mockResolvedValue([]);
  mockCreateProject.mockResolvedValue({ id: "new-project-id" } as any);
}

// --- tests ---

describe("useAuth — initial state", () => {
  it("exposes signIn, signUp, and isLoading=false", () => {
    setupDefaults();
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
    expect(result.current.isLoading).toBe(false);
  });
});

describe("useAuth — signIn", () => {
  it("calls signInAction with the provided credentials", async () => {
    setupDefaults();
    mockSignInAction.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuth());
    await act(() => result.current.signIn("user@example.com", "password123"));

    expect(mockSignInAction).toHaveBeenCalledWith("user@example.com", "password123");
  });

  it("sets isLoading to true while in flight, then resets to false", async () => {
    setupDefaults();
    let resolveSignIn!: (v: any) => void;
    mockSignInAction.mockReturnValue(
      new Promise((r) => {
        resolveSignIn = r;
      })
    );

    const { result } = renderHook(() => useAuth());

    // kick off without awaiting so we can inspect intermediate state
    let signInPromise: Promise<any>;
    act(() => {
      signInPromise = result.current.signIn("a@b.com", "pass");
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      resolveSignIn({ success: false, error: "bad creds" });
      await signInPromise!;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("returns the action result on failure without redirecting", async () => {
    setupDefaults();
    mockSignInAction.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.signIn("bad@example.com", "wrongpass");
    });

    expect(returnValue).toEqual({ success: false, error: "Invalid credentials" });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("resets isLoading to false even when signInAction throws", async () => {
    setupDefaults();
    mockSignInAction.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useAuth());
    await expect(
      act(() => result.current.signIn("a@b.com", "pass"))
    ).rejects.toThrow("network error");

    expect(result.current.isLoading).toBe(false);
  });
});

describe("useAuth — signUp", () => {
  it("calls signUpAction with the provided credentials", async () => {
    setupDefaults();
    mockSignUpAction.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuth());
    await act(() => result.current.signUp("new@example.com", "securepass"));

    expect(mockSignUpAction).toHaveBeenCalledWith("new@example.com", "securepass");
  });

  it("returns the action result on failure without redirecting", async () => {
    setupDefaults();
    mockSignUpAction.mockResolvedValue({ success: false, error: "Email already registered" });

    const { result } = renderHook(() => useAuth());
    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.signUp("taken@example.com", "pass12345");
    });

    expect(returnValue).toEqual({ success: false, error: "Email already registered" });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("resets isLoading to false even when signUpAction throws", async () => {
    setupDefaults();
    mockSignUpAction.mockRejectedValue(new Error("server error"));

    const { result } = renderHook(() => useAuth());
    await expect(
      act(() => result.current.signUp("a@b.com", "pass"))
    ).rejects.toThrow("server error");

    expect(result.current.isLoading).toBe(false);
  });
});

describe("useAuth — post sign-in navigation", () => {
  it("migrates anon work and redirects to the new project when anon messages exist", async () => {
    mockGetAnonWorkData.mockReturnValue({
      messages: [{ role: "user", content: "hello" }],
      fileSystemData: { "/": { type: "directory" } },
    });
    mockCreateProject.mockResolvedValue({ id: "migrated-project" } as any);
    mockSignInAction.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuth());
    await act(() => result.current.signIn("u@example.com", "pass"));

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "hello" }],
        data: { "/": { type: "directory" } },
      })
    );
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockGetProjects).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/migrated-project");
  });

  it("skips anon work migration when anon data has no messages", async () => {
    mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
    mockGetProjects.mockResolvedValue([{ id: "existing-project" }] as any);
    mockSignInAction.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuth());
    await act(() => result.current.signIn("u@example.com", "pass"));

    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockClearAnonWork).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/existing-project");
  });

  it("redirects to the most recent project when no anon work exists", async () => {
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([
      { id: "recent-project" },
      { id: "older-project" },
    ] as any);
    mockSignInAction.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuth());
    await act(() => result.current.signIn("u@example.com", "pass"));

    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/recent-project");
  });

  it("creates a new project and redirects when no anon work and no existing projects", async () => {
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "brand-new" } as any);
    mockSignInAction.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuth());
    await act(() => result.current.signIn("u@example.com", "pass"));

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/brand-new");
  });

  it("applies the same post sign-in logic after a successful signUp", async () => {
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([{ id: "proj-after-signup" }] as any);
    mockSignUpAction.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useAuth());
    await act(() => result.current.signUp("new@example.com", "pass12345"));

    expect(mockPush).toHaveBeenCalledWith("/proj-after-signup");
  });
});
