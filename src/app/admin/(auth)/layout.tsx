"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Ticket,
  Settings,
  User,
  LogOut,
  Menu,
  X,
} from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/admin/login");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">{t.common.loading}</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const navItems = [
    { href: "/admin", icon: LayoutDashboard, label: t.nav.dashboard },
    { href: "/admin/tickets", icon: Ticket, label: t.nav.tickets },
    { href: "/admin/management", icon: Settings, label: t.nav.admin },
    { href: "/admin/account", icon: User, label: t.nav.account },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b">
        <h1 className="font-semibold">{t.topbar.title}</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out
            lg:relative lg:translate-x-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
        >
          <div className="flex flex-col h-full">
            <div className="p-4 border-b hidden lg:block">
              <h1 className="font-semibold text-lg">{t.topbar.title}</h1>
            </div>

            <nav className="flex-1 p-4 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors"
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            <div className="p-4 border-t">
              <div className="text-sm text-muted-foreground mb-2">
                {session.user.email}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => signOut()}
              >
                <LogOut className="h-4 w-4 mr-2" />
                {t.common.logout}
              </Button>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
