import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

// Mocks
const mockPush = vi.fn();
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

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Initial state ────────────────────────────────────────────────────────

  test("initial isLoading is false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  test("exposes signIn, signUp, and isLoading", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
    expect(typeof result.current.isLoading).toBe("boolean");
  });

  // ─── signIn — loading state ───────────────────────────────────────────────

  test("sets isLoading to true during signIn and false after", async () => {
    let resolveSignIn!: (v: unknown) => void;
    (signInAction as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((r) => { resolveSignIn = r; })
    );

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.signIn("a@b.com", "password");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignIn({ success: false, error: "bad credentials" });
    });

    expect(result.current.isLoading).toBe(false);
  });

  // ─── signIn — failure path ────────────────────────────────────────────────

  test("returns the failure result and does not navigate when signIn fails", async () => {
    const failResult = { success: false, error: "Invalid credentials" };
    (signInAction as ReturnType<typeof vi.fn>).mockResolvedValue(failResult);

    const { result } = renderHook(() => useAuth());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.signIn("a@b.com", "wrong");
    });

    expect(returned).toEqual(failResult);
    expect(mockPush).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  // ─── signIn + handlePostSignIn — anon work present ────────────────────────

  test("creates project from anon work, clears it, and navigates when signIn succeeds", async () => {
    (signInAction as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    (getAnonWorkData as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: [{ role: "user", content: "hello" }],
      fileSystemData: { "/index.tsx": { type: "file", content: "..." } },
    });
    (createProject as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "proj-anon-42" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("a@b.com", "password");
    });

    expect(createProject).toHaveBeenCalledWith({
      name: expect.stringMatching(/^Design from /),
      messages: [{ role: "user", content: "hello" }],
      data: { "/index.tsx": { type: "file", content: "..." } },
    });
    expect(clearAnonWork).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith("/proj-anon-42");
    expect(getProjects).not.toHaveBeenCalled();
  });

  test("does not create project from anon work when messages array is empty", async () => {
    (signInAction as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    (getAnonWorkData as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: [],
      fileSystemData: {},
    });
    (getProjects as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "existing-1" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("a@b.com", "password");
    });

    expect(clearAnonWork).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/existing-1");
  });

  test("handles null anon work data and falls back to existing projects", async () => {
    (signInAction as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    (getAnonWorkData as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (getProjects as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "proj-99" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("a@b.com", "password");
    });

    expect(mockPush).toHaveBeenCalledWith("/proj-99");
  });

  // ─── signIn + handlePostSignIn — existing projects ────────────────────────

  test("navigates to most recent project when no anon work exists", async () => {
    (signInAction as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    (getAnonWorkData as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (getProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "recent-proj" },
      { id: "older-proj" },
    ]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("a@b.com", "password");
    });

    expect(mockPush).toHaveBeenCalledWith("/recent-proj");
  });

  // ─── signIn + handlePostSignIn — no projects ─────────────────────────────

  test("creates a new project and navigates when no anon work and no existing projects", async () => {
    (signInAction as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    (getAnonWorkData as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (getProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (createProject as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "brand-new" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("a@b.com", "password");
    });

    expect(createProject).toHaveBeenCalledWith({
      name: expect.stringMatching(/^New Design #\d+$/),
      messages: [],
      data: {},
    });
    expect(mockPush).toHaveBeenCalledWith("/brand-new");
  });

  // ─── signIn — thrown errors ───────────────────────────────────────────────

  test("resets isLoading if signInAction throws", async () => {
    (signInAction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useAuth());
    await expect(
      act(async () => {
        await result.current.signIn("a@b.com", "password");
      })
    ).rejects.toThrow("network error");

    expect(result.current.isLoading).toBe(false);
  });

  // ─── signUp — loading state ───────────────────────────────────────────────

  test("sets isLoading to true during signUp and false after", async () => {
    let resolveSignUp!: (v: unknown) => void;
    (signUpAction as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((r) => { resolveSignUp = r; })
    );

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.signUp("new@user.com", "securePass");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignUp({ success: false, error: "Email already registered" });
    });

    expect(result.current.isLoading).toBe(false);
  });

  // ─── signUp — failure path ────────────────────────────────────────────────

  test("returns the failure result and does not navigate when signUp fails", async () => {
    const failResult = { success: false, error: "Email already registered" };
    (signUpAction as ReturnType<typeof vi.fn>).mockResolvedValue(failResult);

    const { result } = renderHook(() => useAuth());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.signUp("existing@user.com", "password123");
    });

    expect(returned).toEqual(failResult);
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ─── signUp + handlePostSignIn — anon work present ────────────────────────

  test("creates project from anon work after successful signUp", async () => {
    (signUpAction as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    (getAnonWorkData as ReturnType<typeof vi.fn>).mockReturnValue({
      messages: [{ role: "user", content: "build me a button" }],
      fileSystemData: { "/Button.tsx": { type: "file", content: "..." } },
    });
    (createProject as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "new-user-proj" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@user.com", "password123");
    });

    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "build me a button" }],
        data: { "/Button.tsx": { type: "file", content: "..." } },
      })
    );
    expect(clearAnonWork).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith("/new-user-proj");
  });

  // ─── signUp — no projects (new user) ─────────────────────────────────────

  test("creates new project for brand-new user with no anon work", async () => {
    (signUpAction as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    (getAnonWorkData as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (getProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (createProject as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "first-proj" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("brand@new.com", "password123");
    });

    expect(createProject).toHaveBeenCalledWith({
      name: expect.stringMatching(/^New Design #\d+$/),
      messages: [],
      data: {},
    });
    expect(mockPush).toHaveBeenCalledWith("/first-proj");
  });

  // ─── signUp — thrown errors ───────────────────────────────────────────────

  test("resets isLoading if signUpAction throws", async () => {
    (signUpAction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("DB error"));

    const { result } = renderHook(() => useAuth());
    await expect(
      act(async () => {
        await result.current.signUp("a@b.com", "password123");
      })
    ).rejects.toThrow("DB error");

    expect(result.current.isLoading).toBe(false);
  });

  // ─── signIn returns result regardless of success ──────────────────────────

  test("returns the success result object from signIn", async () => {
    const successResult = { success: true };
    (signInAction as ReturnType<typeof vi.fn>).mockResolvedValue(successResult);
    (getAnonWorkData as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (getProjects as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "p1" }]);

    const { result } = renderHook(() => useAuth());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.signIn("a@b.com", "pass");
    });

    expect(returned).toEqual(successResult);
  });

  test("returns the success result object from signUp", async () => {
    const successResult = { success: true };
    (signUpAction as ReturnType<typeof vi.fn>).mockResolvedValue(successResult);
    (getAnonWorkData as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (getProjects as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "p1" }]);

    const { result } = renderHook(() => useAuth());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.signUp("a@b.com", "pass");
    });

    expect(returned).toEqual(successResult);
  });
});
