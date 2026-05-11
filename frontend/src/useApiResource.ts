import { useEffect, useState } from "react";

import { ApiClientError } from "./api.ts";

interface ApiResourceState<TData> {
  data: TData | null;
  error: string | null;
  loading: boolean;
}

export function useApiResource<TData>(
  load: (signal: AbortSignal) => Promise<TData>,
  options: { refreshIntervalMs?: number } = {},
): ApiResourceState<TData> {
  const [state, setState] = useState<ApiResourceState<TData>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimer: number | undefined;
    let disposed = false;

    const refresh = (showLoading: boolean) => {
      if (showLoading) {
        setState((current) => ({
          ...current,
          error: null,
          loading: true,
        }));
      }

      load(controller.signal)
        .then((data) => {
          if (disposed) {
            return;
          }

          setState({
            data,
            error: null,
            loading: false,
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || disposed) {
            return;
          }

          const message =
            error instanceof ApiClientError
              ? `${error.code}: ${error.message}`
              : "Unable to load data";

          setState((current) => ({
            data: current.data,
            error: message,
            loading: false,
          }));
        });
    };

    refresh(true);

    if (options.refreshIntervalMs) {
      refreshTimer = window.setInterval(() => {
        refresh(false);
      }, options.refreshIntervalMs);
    }

    return () => {
      disposed = true;
      if (refreshTimer) {
        window.clearInterval(refreshTimer);
      }
      controller.abort();
    };
  }, [load, options.refreshIntervalMs]);

  return state;
}
