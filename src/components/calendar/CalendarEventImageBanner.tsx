"use client";

import Image from "next/image";
import { getPublicAssetUrl } from "@/lib/storage/getPublicAssetUrl";

export function CalendarEventImageBanner({
  imagePath,
  altText,
}: {
  imagePath: string | null;
  altText: string;
}) {
  const src = getPublicAssetUrl(imagePath);
  if (!src) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Image
        src={src}
        alt={altText}
        width={800}
        height={300}
        unoptimized
        className="max-h-48 w-full object-cover"
      />
    </div>
  );
}
