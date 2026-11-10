import { useId } from "react";
import { cn } from "@/lib/utils";
import { useMotionPreference } from "@/lib/motion";
import {
  AGENT_IDENTITY_META,
  type AgentIdentityRole,
  type AvatarState,
} from "./deriveAgentState";

export type AvatarSize = 96 | 48 | 32 | 24 | 16;

const STATE_BADGE_TONE: Record<
  AvatarState,
  { ring: string; bg: string; fg: string; label: string }
> = {
  idle: {
    ring: "stroke-slate-700/70",
    bg: "fill-slate-800",
    fg: "stroke-slate-400",
    label: "Idle",
  },
  queued: {
    ring: "stroke-slate-600",
    bg: "fill-slate-800",
    fg: "stroke-slate-300",
    label: "Queued",
  },
  working: {
    ring: "stroke-cyan-400",
    bg: "fill-cyan-950",
    fg: "stroke-cyan-300",
    label: "Working",
  },
  waiting_for_tool: {
    ring: "stroke-cyan-400",
    bg: "fill-cyan-950",
    fg: "stroke-cyan-200",
    label: "Running tool",
  },
  verifying: {
    ring: "stroke-sky-400",
    bg: "fill-sky-950",
    fg: "stroke-sky-200",
    label: "Verifying",
  },
  completed: {
    ring: "stroke-emerald-500/80",
    bg: "fill-emerald-950",
    fg: "stroke-emerald-300",
    label: "Completed",
  },
  warning: {
    ring: "stroke-amber-400",
    bg: "fill-amber-950",
    fg: "stroke-amber-300",
    label: "Warning",
  },
  blocked: {
    ring: "stroke-red-400",
    bg: "fill-red-950",
    fg: "stroke-red-300",
    label: "Blocked by policy",
  },
  failed: {
    ring: "stroke-red-500",
    bg: "fill-red-950",
    fg: "stroke-red-300",
    label: "Failed",
  },
  offline: {
    ring: "stroke-slate-600",
    bg: "fill-slate-900",
    fg: "stroke-slate-500",
    label: "Offline",
  },
};

function StateBadge96({ state }: { state: AvatarState }) {
  const tone = STATE_BADGE_TONE[state];
  return (
    <g data-layer="state-badge" transform="translate(80, 16)">
      <circle r="10" className={cn(tone.bg, tone.ring)} strokeWidth="1.5" />
      {state === "completed" && (
        <path
          d="M-4 0.5 L-1.2 3.3 L4.2 -2.5"
          fill="none"
          className={tone.fg}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {(state === "warning" || state === "blocked") && (
        <path
          d="M0 -4.5 L4.5 3.5 L-4.5 3.5 Z"
          fill="none"
          className={tone.fg}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      )}
      {state === "failed" && (
        <path
          d="M-3.2 -3.2 L3.2 3.2 M3.2 -3.2 L-3.2 3.2"
          fill="none"
          className={tone.fg}
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      )}
      {state === "waiting_for_tool" && (
        <rect
          x="-4"
          y="-3"
          width="8"
          height="6"
          rx="1"
          fill="none"
          className={tone.fg}
          strokeWidth="1.5"
        />
      )}
      {(state === "working" || state === "verifying") && (
        <circle r="3.2" className="fill-cyan-300" />
      )}
      {state === "queued" && (
        <g className="fill-slate-300">
          <circle cx="-3.5" cy="0" r="1.1" />
          <circle cx="0" cy="0" r="1.1" />
          <circle cx="3.5" cy="0" r="1.1" />
        </g>
      )}
      {state === "offline" && (
        <path
          d="M-3.5 -3.5 L3.5 3.5"
          fill="none"
          className={tone.fg}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
      {state === "idle" && <circle r="2" className="fill-slate-400" />}
    </g>
  );
}

function GlyphSvg({
  role,
  size,
  state,
  ariaLabel,
  decorative,
  className,
}: {
  role: AgentIdentityRole;
  size: 24 | 16;
  state: AvatarState;
  ariaLabel: string;
  decorative?: boolean;
  className?: string;
}) {
  const tone = STATE_BADGE_TONE[state];
  const isActive =
    state === "working" ||
    state === "waiting_for_tool" ||
    state === "verifying" ||
    state === "blocked";

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : ariaLabel}
      aria-hidden={decorative ? true : undefined}
      data-agent={role}
      data-state={state}
      data-size={size}
      className={cn("shrink-0 select-none", className)}
    >
      {size === 24 && (
        role === "tanya" ? (
          <circle
            cx="12"
            cy="12"
            r="10.5"
            fill="#16263A"
            className={cn("stroke-1", tone.ring)}
          />
        ) : (
          <rect
            x="1.5"
            y="1.5"
            width="21"
            height="21"
            rx="5"
            fill="#16263A"
            className={cn("stroke-1", tone.ring)}
          />
        )
      )}

      {role === "triage" && (
        <g
          fill="none"
          stroke={size === 16 ? "currentColor" : "#22d3ee"}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={isActive || size === 16 ? 1 : 0.75}
        >
          <path d="M12 3.5 L18.5 6 V11 C18.5 15.2 15.6 18.4 12 20 C8.4 18.4 5.5 15.2 5.5 11 V6 Z" />
          <path d="M9 12 A3 3 0 0 1 15 12" />
          <path d="M12 12 L14.5 9.5" />
        </g>
      )}

      {role === "investigator" && (
        <g
          fill="none"
          stroke={size === 16 ? "currentColor" : "#22d3ee"}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={isActive || size === 16 ? 1 : 0.75}
        >
          <path d="M6.5 18.5 V12 L12 6.5" />
          <path d="M6.5 12 H12.5" />
          <circle cx="6.5" cy="18.5" r="1.5" fill="#16263A" />
          <circle cx="12" cy="6.5" r="1.5" fill="#16263A" />
          {size === 24 && (
            <>
              <circle cx="16.2" cy="16.2" r="3" fill="#16263A" />
              <path d="M18.4 18.4 L20.5 20.5" />
            </>
          )}
        </g>
      )}

      {role === "verifier" && (
        <g
          fill="none"
          stroke={
            size === 16
              ? "currentColor"
              : state === "completed"
                ? "#10b981"
                : "#94a3b8"
          }
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="7" />
          <path d="M9 12.2 L11.1 14.3 L15.2 9.8" />
        </g>
      )}

      {role === "reporter" && (
        <g
          fill="none"
          stroke={size === 16 ? "currentColor" : "#7eadeb"}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="6" y="4.5" width="12" height="15" rx="1.5" />
          <path d="M9 9 H15 M9 12.5 H15 M9 16 H13" />
        </g>
      )}

      {role === "tanya" && (
        <g
          fill="none"
          stroke={size === 16 ? "currentColor" : "#cbd5e1"}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8.5 6 H5.5 V18 H8.5" />
          <path d="M15.5 6 H18.5 V18 H15.5" />
          <circle cx="18.5" cy="5.5" r="1.6" fill="#22d3ee" stroke="none" />
        </g>
      )}

      {size === 24 && (
        <circle
          cx="19.5"
          cy="4.5"
          r="3"
          className={cn(tone.bg, tone.ring)}
          strokeWidth="1.2"
        />
      )}
    </svg>
  );
}

/**
 * SAKSI editorial bust illustration & glyph component ("bust grid v1").
 * Supports 5 roles (triage, investigator, verifier, reporter, tanya),
 * 5 sizes (96, 48, 32, 24, 16), and 10 data-derived operational states.
 */
export function AgentAvatar({
  role,
  size = 48,
  state = "idle",
  stateLabel,
  quarantineActive = false,
  sealed = false,
  verifiedPositive = false,
  decorative = false,
  className,
}: {
  role: AgentIdentityRole;
  size?: AvatarSize;
  state?: AvatarState;
  stateLabel?: string;
  quarantineActive?: boolean;
  sealed?: boolean;
  verifiedPositive?: boolean;
  decorative?: boolean;
  className?: string;
}) {
  const uid = useId();
  const { reducedMotion } = useMotionPreference();
  const meta = AGENT_IDENTITY_META[role];
  const tone = STATE_BADGE_TONE[state];
  const labelText = `${meta.canonicalName}, ${stateLabel ?? tone.label}`;

  if (size === 24 || size === 16) {
    return (
      <GlyphSvg
        role={role}
        size={size}
        state={state}
        ariaLabel={labelText}
        decorative={decorative}
        className={className}
      />
    );
  }

  const isActive =
    state === "working" ||
    state === "waiting_for_tool" ||
    state === "verifying" ||
    state === "blocked";
  const accentOpacity = isActive ? 1 : state === "completed" ? 0.8 : 0.48;
  const strokeUnit = size === 96 ? 1.5 : 2;
  const showDetail = size >= 48;
  const showHatch = size === 96;
  const clipId = `plate-clip-${uid}`;
  const hatchId = `hatch-${uid}`;

  const accentColor =
    role === "reporter"
      ? "#7EADEB"
      : role === "verifier"
        ? state === "completed" && verifiedPositive
          ? "#10B981"
          : "#94A3B8"
        : "#22D3EE";

  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : labelText}
      aria-hidden={decorative ? true : undefined}
      data-agent={role}
      data-state={state}
      data-size={size}
      data-motion-effect={!reducedMotion && isActive ? "active" : "static"}
      className={cn("shrink-0 select-none", className)}
    >
      <defs>
        <clipPath id={clipId}>
          {role === "tanya" ? (
            <circle cx="48" cy="48" r="46" />
          ) : (
            <rect x="2" y="2" width="92" height="92" rx="20" />
          )}
        </clipPath>
        {showHatch && (
          <pattern
            id={hatchId}
            width="4"
            height="4"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="4"
              stroke="#94A3B8"
              strokeOpacity="0.1"
              strokeWidth="1"
            />
          </pattern>
        )}
      </defs>

      {/* Plate */}
      <g data-layer="plate">
        {role === "tanya" ? (
          <>
            <circle cx="48" cy="48" r="46" fill="#16263A" />
            <circle
              cx="48"
              cy="48"
              r="42"
              fill="none"
              stroke="#2C4159"
              strokeWidth="1"
            />
          </>
        ) : (
          <rect x="2" y="2" width="92" height="92" rx="20" fill="#16263A" />
        )}
      </g>

      {/* Clipped portrait contents */}
      <g clipPath={`url(#${clipId})`}>
        {/* Role Motif (48 & 96 only) */}
        {showDetail && (
          <g data-layer="motif">
            {role === "triage" && (
              <>
                <circle
                  cx="50"
                  cy="38"
                  r="30"
                  fill="none"
                  stroke={accentColor}
                  strokeOpacity="0.28"
                  strokeWidth="1.25"
                />
                {size === 96 && (
                  <path
                    d="M50 8 V11 M80 38 H77 M50 68 V65 M20 38 H23"
                    stroke={accentColor}
                    strokeOpacity="0.35"
                    strokeWidth="1.25"
                  />
                )}
                <path
                  d="M50 38 L50 8 A30 30 0 0 1 71.2 16.8 Z"
                  fill={accentColor}
                  fillOpacity={isActive ? "0.2" : "0.1"}
                />
              </>
            )}

            {role === "investigator" && (
              <g stroke={accentColor} strokeWidth="1.5" fill="none">
                <path
                  d="M10 42 L10 26 L20 16"
                  strokeOpacity={accentOpacity}
                />
                {size === 96 && (
                  <path
                    d="M10 26 H22"
                    stroke="#7589A2"
                    strokeDasharray="2 2"
                    strokeOpacity="0.6"
                  />
                )}
                <circle cx="10" cy="42" r="2.2" fill="#16263A" />
                <circle cx="10" cy="26" r="2.2" fill="#16263A" />
                <circle cx="20" cy="16" r="2.2" fill="#16263A" />
              </g>
            )}

            {role === "verifier" && (
              <g stroke="#7589A2" strokeOpacity="0.35" strokeWidth="1.2" fill="none">
                <rect x="18" y="8" width="60" height="66" rx="3" />
                {size === 96 && (
                  <>
                    <path d="M64 18 H74 M64 24 H74 M64 30 H74" />
                    <rect x="22" y="12" width="3" height="3" fill="#7589A2" />
                    <rect x="27" y="12" width="3" height="3" fill="#7589A2" />
                    <rect x="32" y="12" width="3" height="3" fill="#7589A2" />
                  </>
                )}
              </g>
            )}

            {role === "reporter" && (
              <g stroke="#7589A2" strokeOpacity="0.4" strokeWidth="1.2" fill="#16263A">
                <path d="M10 14 H86" />
                {size === 96 && (
                  <>
                    <circle cx="22" cy="14" r="2" />
                    <circle cx="38" cy="14" r="2" />
                    <circle cx="54" cy="14" r="2" />
                    <circle cx="70" cy="14" r="2" />
                  </>
                )}
              </g>
            )}
          </g>
        )}

        {/* Bust Back (Hair / Bun) */}
        <g data-layer="bust-back" fill="#22344A">
          {role === "verifier" && <circle cx="34" cy="28" r="6" />}
          {role === "tanya" && (
            <path d="M33 40 C31 22 40 16 48 16 C56 16 65 22 63 40 L63 54 C60 56 57 55 56 52 L58 34 C54 28 42 28 38 34 L40 52 C39 55 36 56 33 54 Z" />
          )}
        </g>

        {/* Bust (Torso, Neck, Head) */}
        <g data-layer="bust">
          {/* Torso */}
          <path
            d={
              role === "reporter"
                ? "M12 96 C14 82 24 72 38 67 L58 66 C70 69 80 77 84 96 Z"
                : "M10 96 C12 80 24 70 40 66 L58 66 C72 70 84 80 86 96 Z"
            }
            fill="#2C4159"
            stroke="#7589A2"
            strokeWidth={strokeUnit}
          />
          {/* Torso shadow */}
          <path
            d="M58 66 C72 70 84 80 86 96 L58 96 Z"
            fill="#1D2E42"
          />
          {showHatch && (
            <path
              d="M58 66 C72 70 84 80 86 96 L58 96 Z"
              fill={`url(#${hatchId})`}
            />
          )}

          {/* Neck */}
          <path
            d="M44 52 L44 65 C46 67 52 67 55 65 L55 52 Z"
            fill="#2C4159"
          />

          {/* Ear */}
          {role !== "tanya" && (
            <ellipse cx="36.5" cy="40" rx="2.4" ry="3.8" fill="#2C4159" />
          )}

          {/* Head */}
          <g
            transform={
              role === "investigator"
                ? "rotate(4 50 38)"
                : role === "verifier"
                  ? "rotate(-2 50 38)"
                  : undefined
            }
          >
            <ellipse
              cx={role === "tanya" ? 48 : 50}
              cy="38"
              rx="14"
              ry="17"
              fill="#39516E"
              stroke="#7589A2"
              strokeWidth={strokeUnit}
            />
            {/* Head right shadow plane */}
            <path
              d="M55 22 C63 27 65 45 56 53 C61 50 64 44 64 38 C64 30 60 24 55 22 Z"
              fill="#22344A"
            />
            {/* Hair Cap */}
            {role === "triage" && (
              <path
                d="M36 31 C36 21 43 18 51 18 C59 18 64 22 64 29 L64 31 C58 27 44 27 36 31 Z"
                fill="#1D2E42"
              />
            )}
            {role === "investigator" && (
              <path
                d="M35 33 C34 22 42 17 51 17 C60 17 66 23 65 31 C61 26 55 25 50 27 C46 29 40 29 35 33 Z"
                fill="#1D2E42"
              />
            )}
            {role === "verifier" && (
              <path
                d="M36 34 C35 22 43 18 51 18 C59 18 64 23 64 30 C58 25 46 24 40 28 Z"
                fill="#1D2E42"
              />
            )}
            {role === "reporter" && (
              <path
                d="M35 35 C34 22 42 17 51 17 C60 17 65 22 65 29 C60 24 52 22 45 23 C40 25 37 29 35 35 Z"
                fill="#1D2E42"
              />
            )}

            {/* Facial feature strokes (48 & 96 only) */}
            {showDetail && (
              <g
                data-layer="bust-detail"
                fill="none"
                stroke="#94A3B8"
                strokeWidth="1.3"
                strokeLinecap="round"
              >
                {role === "tanya" ? (
                  <>
                    <path d="M42 37 H45.5" />
                    <path d="M50.5 37 H54" />
                    <path d="M48 38 V44" />
                  </>
                ) : (
                  <>
                    <path d="M52.5 36 L59.5 35.4" />
                    <path d="M61 36.8 L63 44 L60.5 45" />
                  </>
                )}
                {role === "verifier" && (
                  <rect
                    x="51"
                    y="33"
                    width="9.5"
                    height="5.2"
                    rx="1.2"
                    stroke="#CBD5E1"
                    strokeWidth="1.2"
                  />
                )}
              </g>
            )}
          </g>

          {/* Collar / Lapel Details */}
          {showDetail && (
            <g fill="#39516E" stroke="#7589A2" strokeWidth="1">
              {role === "triage" && (
                <>
                  <path d="M38 62 L44 58 L45 67 L38 69 Z" />
                  <path d="M62 62 L56 58 L55 67 L62 69 Z" />
                  <rect x="18" y="72" width="12" height="3" rx="1" />
                  <rect x="68" y="72" width="12" height="3" rx="1" />
                </>
              )}
              {role === "investigator" && (
                <>
                  <path d="M40 66 L49 84 L44 66 Z" />
                  <path d="M58 66 L50 84 L55 66 Z" />
                </>
              )}
              {role === "reporter" && (
                <>
                  <path d="M40 67 L46 80 L50 90 L48 67 Z" />
                  <path d="M58 66 L54 80 L52 90 L55 66 Z" />
                </>
              )}
            </g>
          )}
        </g>

        {/* Role Prop + Accent Layer */}
        <g data-layer="prop">
          {role === "triage" && (
            <g>
              <path
                d="M22 76 L29 73 L36 76 L36 83 C36 87.5 33 90.5 29 92 C25 90.5 22 87.5 22 83 Z"
                fill="#16263A"
                stroke={accentColor}
                strokeOpacity={accentOpacity}
                strokeWidth="1.6"
              />
              {quarantineActive && (
                <path
                  d="M25 82.5 H33"
                  stroke="#F59E0B"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}
            </g>
          )}

          {role === "investigator" && (
            <g>
              <circle
                cx="72"
                cy="79"
                r="7.5"
                fill="#16263A"
                stroke={accentColor}
                strokeOpacity={accentOpacity}
                strokeWidth="1.8"
              />
              <path
                d="M77.5 84.5 L85 92"
                stroke="#94A3B8"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M68.5 81 L71.5 77 L75.5 79"
                fill="none"
                stroke={accentColor}
                strokeWidth="1.3"
              />
            </g>
          )}

          {role === "verifier" && (
            <g>
              <circle
                cx="73"
                cy="79"
                r="8.5"
                fill="#16263A"
                stroke="#94A3B8"
                strokeWidth="1.5"
              />
              <circle
                cx="73"
                cy="79"
                r="5.5"
                fill="none"
                stroke={accentColor}
                strokeWidth="1.2"
              />
              <path
                d="M70 79 L72.3 81.3 L76.5 76.8"
                fill="none"
                stroke={accentColor}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )}

          {role === "reporter" && (
            <g>
              <path
                d="M60 72 L84 68 L87 92 L62 95 Z"
                fill="#16263A"
                stroke={accentColor}
                strokeOpacity={accentOpacity}
                strokeWidth="1.5"
              />
              <path
                d="M65 78 L80 75.8 M65.5 82.5 L81 80.2 M66 87 L76 85.5"
                stroke="#94A3B8"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              {sealed && (
                <circle
                  cx="81"
                  cy="87"
                  r="3"
                  fill="#10B981"
                />
              )}
            </g>
          )}

          {role === "tanya" && (
            <g>
              <path
                d="M66 74 H63 V89 H66 M79 74 H82 V89 H79"
                fill="none"
                stroke="#94A3B8"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="82" cy="72" r="2.5" fill="#22D3EE" />
            </g>
          )}
        </g>
      </g>

      {/* Outer Plate Ring & State Badge (unclipped) */}
      <g data-layer="state">
        {role === "tanya" ? (
          <circle
            cx="48"
            cy="48"
            r="46"
            fill="none"
            className={tone.ring}
            strokeWidth={isActive ? "2" : "1.25"}
          />
        ) : (
          <rect
            x="2"
            y="2"
            width="92"
            height="92"
            rx="20"
            fill="none"
            className={tone.ring}
            strokeWidth={isActive ? "2" : "1.25"}
          />
        )}
        {size === 32 ? (
          <circle
            cx="84"
            cy="12"
            r="6"
            className={cn(tone.bg, tone.ring)}
            strokeWidth="1.5"
          />
        ) : (
          <StateBadge96 state={state} />
        )}
      </g>
    </svg>
  );
}

