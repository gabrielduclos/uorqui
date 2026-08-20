import { useEffect, useMemo, useState } from "react";
import { mediaBlobUrl } from "../lib/api";

function initials(name: string) {
  return (name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

export function Avatar({ name, mediaId, size = 44, className = "" }: { name?: string; mediaId?: string; size?: number; className?: string }) {
  const [url, setUrl] = useState("");
  const letters = useMemo(() => initials(name || ""), [name]);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!mediaId) {
      setUrl("");
      return;
    }
    mediaBlobUrl(mediaId)
      .then((next) => {
        objectUrl = next;
        if (active) setUrl(next);
      })
      .catch(() => active && setUrl(""));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
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
