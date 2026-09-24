import { FadeIn } from "@/components/motion/Motion";

export function FormSection({
  children,
  title,
  maxWidth = "max-w-full",
}: {
  children: React.ReactNode;
  title?: string;
  maxWidth?: string;
}) {
  return (
    <FadeIn className={`mx-auto w-full ${maxWidth}`}>
      <div className="card overflow-hidden">
        {title && (
          <div className="relative border-b border-slate-100 bg-linear-to-r from-brand-50/70 via-white to-white px-5 py-5 sm:px-8">
            <span className="bg-brand-gradient absolute inset-y-0 start-0 w-1" aria-hidden="true" />
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
          </div>
        )}
        <div className="p-5 sm:p-8">{children}</div>
      </div>
    </FadeIn>
  );
}
