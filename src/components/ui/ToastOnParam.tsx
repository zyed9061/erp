"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "./Toast";

export function ToastOnParam({ paramKey = "toast" }: { paramKey?: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { showSuccess } = useToast();
  const message = searchParams.get(paramKey);
  const shownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!message || shownRef.current === message) return;
    shownRef.current = message;
    showSuccess(message);
    const params = new URLSearchParams(searchParams.toString());
    params.delete(paramKey);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // Only re-run when the param itself changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  return null;
}
