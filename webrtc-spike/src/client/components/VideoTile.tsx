import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  /** Flip left-right like a mirror. Only for your own preview (as in Zoom/Teams); the other person sees you unflipped. */
  mirrored?: boolean;
}

export function VideoTile({ stream, label, muted = false, mirrored = false }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <figure className={mirrored ? "tile mirrored" : "tile"}>
      <video ref={ref} autoPlay playsInline muted={muted} aria-label={label} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}
