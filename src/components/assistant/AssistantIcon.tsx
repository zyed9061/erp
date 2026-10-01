import { useId } from "react";

/**
 * Document assistant mark: a friendly robot head with a glowing visor, orbit ring and
 * blue halo on a night-blue disc. Original artwork, drawn to stay legible from 24 to 64 px.
 */
export function AssistantIcon({ className = "h-14 w-14" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const bg = `${id}-bg`;
  const head = `${id}-head`;
  const visor = `${id}-visor`;
  const glow = `${id}-glow`;

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={bg} cx="50%" cy="35%" r="75%">
          <stop offset="0" stopColor="#1d4ed8" />
          <stop offset="0.55" stopColor="#0f1f4d" />
          <stop offset="1" stopColor="#070f2b" />
        </radialGradient>
        <radialGradient id={head} cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#e2e8f0" />
          <stop offset="1" stopColor="#94a3b8" />
        </radialGradient>
        <linearGradient id={visor} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e293b" />
          <stop offset="1" stopColor="#0b1224" />
        </linearGradient>
        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#38bdf8" stopOpacity="0.9" />
          <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="32" cy="32" r="32" fill={`url(#${bg})`} />
      {/* Halo under the head */}
      <ellipse cx="32" cy="50" rx="18" ry="5" fill={`url(#${glow})`} />
      {/* Orbit ring, back half */}
      <path d="M9 36a23 8 0 0 1 46 0" fill="none" stroke="#7dd3fc" strokeOpacity="0.45" strokeWidth="1.2" />
      {/* Antenna */}
      <line x1="32" y1="14" x2="32" y2="9.5" stroke="#cbd5e1" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="32" cy="8.5" r="2.4" fill="#e0f2fe" />
      <circle cx="32" cy="8.5" r="1.1" fill="#38bdf8" />
      {/* Head */}
      <circle cx="32" cy="31" r="17" fill={`url(#${head})`} />
      {/* Visor with eyes */}
      <rect x="18.5" y="25" width="27" height="11" rx="5.5" fill={`url(#${visor})`} />
      <circle cx="26" cy="30.5" r="2.6" fill="#38bdf8" />
      <circle cx="38" cy="30.5" r="2.6" fill="#38bdf8" />
      <circle cx="26" cy="30.5" r="5" fill={`url(#${glow})`} opacity="0.7" />
      <circle cx="38" cy="30.5" r="5" fill={`url(#${glow})`} opacity="0.7" />
      {/* Ear */}
      <circle cx="49" cy="31" r="3" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.8" />
      {/* Orbit ring, front half with nodes */}
      <path d="M55 36a23 8 0 0 1-46 0" fill="none" stroke="#7dd3fc" strokeWidth="1.4" />
      <circle cx="12.5" cy="40" r="1.6" fill="#bae6fd" />
      <circle cx="51" cy="40.5" r="1.6" fill="#bae6fd" />
      <circle cx="32" cy="44" r="1.4" fill="#e0f2fe" />
    </svg>
  );
}
