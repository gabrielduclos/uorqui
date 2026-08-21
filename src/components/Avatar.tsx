import { useEffect, useMemo, useState } from "react";
import { cachedMediaBlobUrl, mediaBlobUrl } from "../lib/api";

function initials(name: string) {
  return (name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

export function Avatar({ name, mediaId, size = 44, className = "" }: { name?: string; mediaId?: string; size?: number; className?: string }) {
  const [url, setUrl] = useState(() => mediaId ? cachedMediaBlobUrl(mediaId) : "");
  const letters = useMemo(() => initials(name || ""), [name]);

  useEffect(() => {
    let active = true;
    if (!mediaId) {
      setUrl("");
      return;
    }

    const cached = cachedMediaBlobUrl(mediaId);
    if (cached) {
      setUrl(cached);
      return;
    }

    setUrl("");
    mediaBlobUrl(mediaId)
      .then((next) => {
        if (active) setUrl(next);
      })
      .catch(() => active && setUrl(""));
    return () => {
      active = false;
    };
  }, [mediaId]);

  return (
    <div
      className={`avatar ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: url ? `url("${url}")` : undefined,
      }}
      aria-label={name || "Usuário"}
    >
      {!url && letters}
    </div>
  );
}
