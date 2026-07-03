"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminSidebar } from "@/components/admin/shell/admin-sidebar";
import { AdminHeader } from "@/components/admin/shell/admin-header";

const COLLAPSE_KEY = "onfire-sidebar-collapsed";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/admin/login");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-60 shrink-0 border-r border-border/60 bg-card p-4 lg:block">
          <Skeleton className="h-7 w-28" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1">
          <div className="flex h-14 items-center border-b border-border/60 px-4">
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="p-6">
            <Skeleton className="h-8 w-48" />
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          </div>
        </div>
        <span className="sr-only">Checking authentication...</span>
      </div>
    );
  }

  if (!session) return null;

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSE_KEY, prev ? "0" : "1");
      return !prev;
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader onMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
