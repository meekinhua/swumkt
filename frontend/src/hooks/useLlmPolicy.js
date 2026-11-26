/**
 * Whether the platform's own LLM may be used, per AI feature.
 *
 *   const { loading, systemAllowed, hint, refetch } = useLlmPolicy();
 *   if (systemAllowed('conjoint.interpretation')) { ...show system button... }
 *
 * Source: GET /api/platform/llm-policy (any logged-in user)
 *   { system_llm_enabled, features: {<key>: bool (effective for this user)},
 *     external_hint, registry }
 *
 * Safe default: not logged in, still loading, or request failed => the system
 * LLM is treated as NOT allowed, so the UI shows the external ("use my own
 * AI") path. The server still enforces the real rule (409 llm_external_only).
 *
 * `systemAllowed(key)` looks at features[key]; unknown keys fall back to
 * `system_llm_enabled`.
 */
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';

export const llmPolicyQueryKey = ['platform', 'llm-policy'];

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const useLlmPolicy = () => {
  const { token, user } = useAuth();
  const enabled = !!token && !!user;
  const query = useQuery({
    queryKey: [...llmPolicyQueryKey, user?.id || user?.email || 'anon'],
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const r = await axios.get(`${API}/platform/llm-policy`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.data;
    },
  });
  const policy = enabled && !query.isError ? query.data || null : null;

  const systemAllowed = useCallback((featureKey) => {
    if (!policy) return false;
    const f = policy.features || {};
    if (featureKey && Object.prototype.hasOwnProperty.call(f, featureKey)) return f[featureKey] === true;
    return policy.system_llm_enabled === true;
  }, [policy]);

  return {
    loading: enabled && query.isLoading,
    policy,
    systemAllowed,
    hint: (policy && policy.external_hint) || '',
    refetch: query.refetch,
  };
};

export default useLlmPolicy;
