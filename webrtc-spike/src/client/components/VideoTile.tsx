import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
}

export function VideoTile({ stream, label, muted = false }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <figure className="tile">
      <video ref={ref} autoPlay playsInline muted={muted} aria-label={label} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}
