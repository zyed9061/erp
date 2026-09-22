import { AppNav } from "@/components/AppNav";
import { MotionProvider } from "@/components/ui/MotionProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionProvider>
      <div className="flex min-h-screen flex-col bg-neutral-50">
        <AppNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </div>
    </MotionProvider>
  );
}
