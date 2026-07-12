import { ServiceWorkerRegister } from "@/components/sw-register";

export default function TocLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {children}
      <ServiceWorkerRegister />
    </div>
  );
}
