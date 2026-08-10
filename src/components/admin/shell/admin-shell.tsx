"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { AdminSidebar } from "@/components/admin/shell/admin-sidebar";
import { AdminHeader } from "@/components/admin/shell/admin-header";

const COLLAPSE_KEY = "onfire-sidebar-collapsed";

// Restore the persisted sidebar state before the first client paint.
const useBeforePaint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useBeforePaint(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSE_KEY, prev ? "0" : "1");
      return !prev;
    });
  };

  return (
    <div className="admin-shell flex min-h-screen bg-background">
      <AdminSidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader onMobileMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
