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
    <div className={`mx-auto w-full ${maxWidth}`}>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
        {title && (
          <div className="border-b border-neutral-100 px-6 py-4">
            <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
          </div>
        )}
        <div className="p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
