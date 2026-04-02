"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  AUTH_SESSION_QUERY_KEY,
  fetchAuthSession,
  loginWithPassword,
  logoutSession,
  type AuthSession,
  type LoginPayload,
} from "@/services/api/auth";

export function useAuthSession() {
  return useQuery({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: fetchAuthSession,
    retry: false,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: LoginPayload) => loginWithPassword(payload),
    onSuccess: (session) => {
      queryClient.setQueryData<AuthSession | null>(AUTH_SESSION_QUERY_KEY, session);
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logoutSession,
    onSuccess: () => {
      queryClient.setQueryData<AuthSession | null>(AUTH_SESSION_QUERY_KEY, null);
    },
  });
}
