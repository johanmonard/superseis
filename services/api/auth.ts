import { ApiError, requestJson } from "./client";

export const AUTH_SESSION_QUERY_KEY = ["auth", "session"] as const;

export interface AuthSession {
  user_id: number;
  email: string;
  company_id: number;
  company_name: string;
  role: string;
  auth_type: string;
  is_admin: boolean;
}

export interface LoginPayload {
  username: string;
  password: string;
}

interface LogoutResponse {
  ok: boolean;
}

function isAuthFailure(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export async function fetchAuthSession(): Promise<AuthSession | null> {
  try {
    return await requestJson<AuthSession>("/auth/session");
  } catch (error) {
    if (isAuthFailure(error)) {
      return null;
    }

    throw error;
  }
}

export function loginWithPassword(payload: LoginPayload) {
  return requestJson<AuthSession>("/auth/login", {
    method: "POST",
    body: payload,
  });
}

export async function logoutSession() {
  try {
    return await requestJson<LogoutResponse>("/auth/logout", {
      method: "POST",
    });
  } catch (error) {
    if (isAuthFailure(error)) {
      return { ok: true };
    }

    throw error;
  }
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (
      error.details &&
      typeof error.details === "object" &&
      "detail" in error.details &&
      typeof error.details.detail === "string"
    ) {
      return error.details.detail;
    }

    if (typeof error.details === "string" && error.details.length > 0) {
      return error.details;
    }

    return error.message || fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
