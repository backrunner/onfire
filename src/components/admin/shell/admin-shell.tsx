"use client";

import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { AdminSidebar } from "@/components/admin/shell/admin-sidebar";
import { AdminHeader } from "@/components/admin/shell/admin-header";
import { usePreviewIdentity } from "@/lib/hooks/use-preview-identity";

const COLLAPSE_KEY = "onfire-sidebar-collapsed";

// Restore the persisted sidebar state before the first client paint.
const useBeforePaint =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { preview } = usePreviewIdentity();

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
      {/* Pages size themselves against the top chrome (header + preview
          banner) through this variable instead of hardcoding 3.5rem. */}
      <div
        className="flex min-w-0 flex-1 flex-col"
        style={{ "--admin-chrome-h": preview ? "5.5rem" : "3.5rem" } as CSSProperties}
      >
        <AdminHeader onMobileMenu={() => setMobileOpen(true)} />
        <main className="w-full flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
