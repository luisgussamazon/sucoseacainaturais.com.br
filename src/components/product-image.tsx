"use client";
import { useState } from "react";
export function ProductImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={failed ? "/product-placeholder.svg" : src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
