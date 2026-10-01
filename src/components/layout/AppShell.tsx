"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { AppFooter } from "@/components/layout/AppFooter";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { AssistantLauncher } from "@/components/assistant/AssistantLauncher";

const STORAGE_KEY = "erp:sidebar-collapsed";

export function AppShell({
  userName,
  userEmail,
  onSignOut,
  assistantEnabled,
  children,
}: {
  userName: string;
  userEmail: string;
  onSignOut: () => void;
  assistantEnabled: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const assistantLauncherRef = useRef<HTMLButtonElement>(null);
  const assistantPanelId = useId();
  const pathname = usePathname();

  const toggleAssistant = useCallback(() => setAssistantOpen((open) => !open), []);

  const closeAssistant = useCallback(() => {
    setAssistantOpen(false);
    assistantLauncherRef.current?.focus();
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // One-time hydration from localStorage on mount; no external store to subscribe to.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "1") setCollapsed(true);
    } catch {
      // localStorage unavailable, ignore.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // localStorage unavailable, ignore.
    }
  }, [collapsed]);

  return (
    <div className="relative min-h-screen bg-background">
      {/* Subtle brand wash at the top of every page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-80 bg-[radial-gradient(60rem_20rem_at_70%_-6rem,rgb(99_102_241/0.10),transparent),radial-gradient(40rem_16rem_at_10%_-4rem,rgb(139_92_246/0.08),transparent)]"
      />
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div
        className="relative flex min-h-screen min-w-0 flex-col transition-[margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:ms-[var(--sbw)]"
        style={{ "--sbw": collapsed ? "72px" : "256px" } as CSSProperties}
      >
        <TopHeader
          userName={userName}
          userEmail={userEmail}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onSignOut={onSignOut}
        />
        <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>
        <AppFooter />
      </div>
      {assistantEnabled && (
        <>
          <AssistantLauncher
            ref={assistantLauncherRef}
            panelId={assistantPanelId} expanded={assistantOpen} onToggle={toggleAssistant} />
          <AssistantPanel id={assistantPanelId} open={assistantOpen} onClose={closeAssistant} />
        </>
      )}
    </div>
  );
}
