import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loginMutateAsync: vi.fn(),
  logoutMutate: vi.fn(),
  createProjectMutate: vi.fn(),
  setActiveProject: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: ({
    priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={props.alt ?? ""} {...props} />;
  },
}));

vi.mock("@/lib/use-active-project", () => ({
  useActiveProject: () => ({
    activeProject: null,
    setActiveProject: mocks.setActiveProject,
  }),
}));

vi.mock("@/lib/use-auth-session", () => ({
  useAuthSession: () => ({
    data: null,
    isLoading: false,
  }),
  useLoginMutation: () => ({
    isPending: false,
    mutateAsync: mocks.loginMutateAsync,
  }),
  useLogoutMutation: () => ({
    isPending: false,
    error: null,
    mutate: mocks.logoutMutate,
  }),
}));

vi.mock("@/services/query/project", () => ({
  useProjectList: () => ({
    data: [],
    isLoading: false,
  }),
  useCreateProject: () => ({
    mutate: mocks.createProjectMutate,
  }),
}));

import { HomeOverview } from "@/components/features/home/home-overview";

describe("HomeOverview landing sign-in", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.loginMutateAsync.mockReset();
    mocks.logoutMutate.mockReset();
    mocks.createProjectMutate.mockReset();
    mocks.setActiveProject.mockReset();

    vi.stubGlobal("Audio", function Audio() {
      return {
        loop: false,
        volume: 0,
        preload: "auto",
        paused: true,
        currentTime: 0,
        duration: 60,
        addEventListener: vi.fn(),
        pause: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
      };
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("enables sign-in from autofilled credentials without typing", async () => {
    render(<HomeOverview />);

    const loginCard = screen.getByRole("button", { name: "Login" });
    fireEvent.mouseEnter(loginCard.parentElement as HTMLElement);

    const usernameInput = screen.getByPlaceholderText("email") as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText("password") as HTMLInputElement;
    const signInButton = screen.getByRole("button", { name: "Sign in" });

    usernameInput.value = "demo@example.com";
    passwordInput.value = "supersecret";

    fireEvent.focus(usernameInput);

    await act(async () => {
      await Promise.resolve();
    });

    expect(signInButton).toBeEnabled();

    fireEvent.click(signInButton);

    expect(mocks.loginMutateAsync).toHaveBeenCalledWith({
      username: "demo@example.com",
      password: "supersecret",
    });
  });

  it("enables sign-in after delayed browser restore without focusing the username", async () => {
    render(<HomeOverview />);

    const loginCard = screen.getByRole("button", { name: "Login" });
    fireEvent.mouseEnter(loginCard.parentElement as HTMLElement);

    const usernameInput = screen.getByPlaceholderText("email") as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText("password") as HTMLInputElement;
    const signInButton = screen.getByRole("button", { name: "Sign in" });

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    usernameInput.value = "test1@gmail.com";
    passwordInput.value = "password";

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(signInButton).toBeEnabled();

    fireEvent.click(signInButton);

    expect(mocks.loginMutateAsync).toHaveBeenCalledWith({
      username: "test1@gmail.com",
      password: "password",
    });
  });

  it("submits restored credentials on the first sign-in click even before React state catches up", () => {
    render(<HomeOverview />);

    const loginCard = screen.getByRole("button", { name: "Login" });
    fireEvent.mouseEnter(loginCard.parentElement as HTMLElement);

    const usernameInput = screen.getByPlaceholderText("email") as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText("password") as HTMLInputElement;
    const signInButton = screen.getByRole("button", { name: "Sign in" });

    usernameInput.value = "test1@gmail.com";
    passwordInput.value = "password";

    fireEvent.click(signInButton);

    expect(mocks.loginMutateAsync).toHaveBeenCalledWith({
      username: "test1@gmail.com",
      password: "password",
    });
  });
});
