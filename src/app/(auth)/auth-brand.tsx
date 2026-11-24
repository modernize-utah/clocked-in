import { ClockIcon } from "lucide-react";
import Link from "next/link";
import { brandAssetSrc, wordmarkSrc } from "@/lib/brand";
import { portalName } from "@/lib/portal";

export function AuthBrand({
  tenant,
  surface,
}: {
  tenant: {
    name: string;
    markUrl: string | null;
    wordmarkUrl: string | null;
    wordmarkOnLightUrl: string | null;
  } | null;
  surface: "dark" | "light";
}) {
  const mark = brandAssetSrc("mark", tenant?.markUrl ?? null);
  const wordmark = wordmarkSrc(tenant, surface);
  const name = tenant?.name || portalName();
  const branded = Boolean(mark || wordmark);

  return (
    <Link href="/" className="relative flex items-center gap-2.5 font-semibold text-inherit no-underline hover:text-inherit">
      {mark ? (
        <img src={mark} alt="" width={36} height={36} className="size-9 rounded-lg object-contain" />
      ) : (
        <span
          className={
            surface === "dark"
              ? "flex size-9 items-center justify-center rounded-lg bg-[#D4AC59] text-[#001836]"
              : "flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          }
        >
          <ClockIcon className={surface === "dark" ? "size-5" : "size-4"} />
        </span>
      )}
      {wordmark ? (
        <img src={wordmark} alt={name} className="h-7 max-w-40 object-contain object-left" />
      ) : (
        <span>{branded ? name : portalName()}</span>
      )}
    </Link>
  );
}
