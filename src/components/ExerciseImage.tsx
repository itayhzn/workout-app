import { Activity, Dumbbell, PersonStanding, Shapes, Waves } from "lucide-react";
import { useState } from "react";
import type { ExerciseType } from "../domain/types";

/** Resolves repository-relative paths ("/images/x.webp") against the deployed base URL. */
export function resolveImagePath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "").replace(/^public\//, "")}`;
}

const TYPE_ICON = { strength: Dumbbell, cardio: Activity, swimming: Waves, mobility: PersonStanding, other: Shapes } as const;

interface Props {
  path?: string;
  type?: ExerciseType;
  alt: string;
  className?: string;
  iconSize?: number;
  muted?: boolean;
}

/** Exercise image with a neutral placeholder for missing or broken images. */
export function ExerciseImage({ path, type = "other", alt, className = "", iconSize = 28, muted }: Props) {
  const src = resolveImagePath(path);
  const [failed, setFailed] = useState<string>();
  const Icon = TYPE_ICON[type] ?? Shapes;
  const showImage = src && failed !== src;
  return (
    <div
      className={`relative overflow-hidden rounded bg-elevated border border-line flex items-center justify-center shrink-0 ${
        muted ? "opacity-40" : ""
      } ${className}`}
    >
      {showImage ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(src)} />
      ) : (
        <Icon size={iconSize} strokeWidth={1.5} className="text-ink-3" aria-label={alt} />
      )}
    </div>
  );
}
