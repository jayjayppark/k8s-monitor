import { useEffect, useState } from "react";

import { ApiClientError } from "./api.ts";

interface ApiResourceState<TData> {
  data: TData | null;
  error: string | null;
  loading: boolean;
}

export function useApiResource<TData>(
  load: (signal: AbortSignal) => Promise<TData>,
): ApiResourceState<TData> {
  const [state, setState] = useState<ApiResourceState<TData>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    const controller = new AbortController();

    setState((current) => ({
      ...current,
      error: null,
      loading: true,
    }));

    load(controller.signal)
      .then((data) => {
        setState({
          data,
          error: null,
          loading: false,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const message =
          error instanceof ApiClientError
            ? `${error.code}: ${error.message}`
            : "Unable to load data";

        setState({
          data: null,
          error: message,
          loading: false,
        });
      });

    return () => {
      controller.abort();
    };
  }, [load]);

  return state;
}
