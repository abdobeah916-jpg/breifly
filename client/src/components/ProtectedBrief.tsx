import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

/**
 * Protects generated brief content until the server-backed payment state is paid.
 * `hasPaid` must come from the authenticated server response, never local state.
 */
export default function ProtectedBrief({ hasPaid, children }: { hasPaid: boolean; children: ReactNode }) {
  const preventCopy = (event: React.SyntheticEvent) => {
    if (!hasPaid) event.preventDefault();
  };

  if (hasPaid) {
    return <div className="select-text">{children}</div>;
  }

  return (
    <div
      className="relative select-none"
      onContextMenu={preventCopy}
      onCopy={preventCopy}
      onCut={preventCopy}
      onDragStart={preventCopy}
      onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && ["c", "x", "p", "s"].includes(event.key.toLowerCase())) event.preventDefault();
      }}
      aria-label="الـ brief مقفول حتى تأكيد الدفع"
    >
      <div className="pointer-events-none blur-sm" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[#191816]/45 p-4 text-center text-white backdrop-blur-md">
        <div className="max-w-[220px]">
          <LockKeyhole className="mx-auto h-5 w-5 text-[#f7c947]" />
          <p className="mt-2 text-sm font-extrabold">الـ brief جاهز، لكنه مقفول</p>
          <p className="mt-1 text-[11px] leading-5 text-white/70">تظهر النتيجة بعد الموافقة على الشروط وتأكيد الدفع عبر Stripe.</p>
        </div>
      </div>
    </div>
  );
}
