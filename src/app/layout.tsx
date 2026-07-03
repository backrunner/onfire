import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "OnFire - Modern Ticket System",
  description: "A minimalist modern ticket system for support teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <I18nProvider>{children}</I18nProvider>
          </TooltipProvider>
          <Toaster richColors position="top-center" />
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
