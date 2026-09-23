"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { ChatWidget } from "@/components/chat/ChatWidget";

const STORAGE_KEY = "erp:sidebar-collapsed";

export function AppShell({
  userName,
  userEmail,
  onSignOut,
  children,
}: {
  userName: string;
  userEmail: string;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
    <div className="min-h-screen bg-white">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div
        className="flex min-h-screen flex-col transition-[margin-left] duration-200 md:ml-[var(--sbw)]"
        style={{ "--sbw": collapsed ? "68px" : "256px" } as CSSProperties}
      >
        <TopHeader
          userName={userName}
          userEmail={userEmail}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onSignOut={onSignOut}
        />
        <main className="flex-1 px-4 py-4 sm:px-6">{children}</main>
      </div>
      <ChatWidget />
    </div>
  );
}
