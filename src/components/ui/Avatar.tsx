import { initials } from "@/lib/format";

const PALETTE = [
  "bg-amber-500/20 text-amber-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-sky-500/20 text-sky-300",
  "bg-violet-500/20 text-violet-300",
  "bg-rose-500/20 text-rose-300",
  "bg-teal-500/20 text-teal-300",
];

export function Avatar({
  name,
  src,
  size = "md",
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-lg",
    xl: "h-24 w-24 text-3xl",
  };
  if (src) {
    // Plain <img>: avatar sources are small user/company-provided URLs where
    // next/image's remote-domain allowlist would break arbitrary hosts.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${sizes[size]} rounded-full object-cover border border-edge ${className}`}
      />
    );
  }
  const hue = PALETTE[Math.abs(hashCode(name)) % PALETTE.length];
  return (
    <div
      className={`${sizes[size]} ${hue} rounded-full flex items-center justify-center font-bold border border-white/10 shrink-0 ${className}`}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
