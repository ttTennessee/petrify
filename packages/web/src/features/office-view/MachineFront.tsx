import type { NodeStatus } from "@petrify/shared";
import "./style.css";

const INK = "#241c14";
const INK_SOFT = "#5a4a36";
const BODY = "#5b7a8d";
const BODY_DARK = "#3f5765";
const BODY_LIGHT = "#7a99ad";
const BRASS = "#c89968";
const GREEN = "#5fae6a";
const RED = "#c25450";
const AMBER = "#e0a040";

interface MachineFrontProps {
  status: NodeStatus;
  label?: string;
}

function Face({ status }: { status: NodeStatus }) {
  switch (status) {
    case "running":
      return (
        <>
          <defs>
            <clipPath id="m-screen-clip-run">
              <rect x="33" y="43" width="54" height="30" rx="1" />
            </clipPath>
          </defs>
          <g clipPath="url(#m-screen-clip-run)">
            <g className="m-scan-bars">
              <rect x="36" y="46" width="32" height="2" fill={GREEN} opacity="0.85" />
              <rect x="36" y="50" width="46" height="2" fill={GREEN} opacity="0.65" />
              <rect x="36" y="54" width="22" height="2" fill={GREEN} opacity="0.85" />
              <rect x="36" y="58" width="40" height="2" fill={GREEN} opacity="0.7" />
              <rect x="36" y="62" width="28" height="2" fill={GREEN} opacity="0.85" />
              <rect x="36" y="66" width="44" height="2" fill={GREEN} opacity="0.6" />
              <rect x="36" y="70" width="18" height="2" fill={GREEN} opacity="0.85" />
              <rect x="36" y="74" width="36" height="2" fill={GREEN} opacity="0.7" />
            </g>
          </g>
        </>
      );
    case "completed":
      return (
        <>
          <path d="M 44 56 Q 48 51 52 56" stroke={GREEN} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 68 56 Q 72 51 76 56" stroke={GREEN} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 50 63 Q 60 71 70 63" stroke={GREEN} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <circle cx="83" cy="46" r="3.2" fill={GREEN} stroke={INK} strokeWidth="0.8" />
          <path d="M 81.4 46 L 82.6 47.2 L 84.6 44.8" stroke="#fff" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case "failed":
      return (
        <>
          <line x1="44" y1="52" x2="52" y2="60" stroke={RED} strokeWidth="2" strokeLinecap="round" />
          <line x1="52" y1="52" x2="44" y2="60" stroke={RED} strokeWidth="2" strokeLinecap="round" />
          <line x1="68" y1="52" x2="76" y2="60" stroke={RED} strokeWidth="2" strokeLinecap="round" />
          <line x1="76" y1="52" x2="68" y2="60" stroke={RED} strokeWidth="2" strokeLinecap="round" />
          <path d="M 52 70 Q 60 64 68 70" stroke={RED} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <rect x="58" y="68" width="3" height="3" fill={RED} opacity="0.7" />
        </>
      );
    case "blocked":
      return (
        <>
          <line x1="44" y1="56" x2="52" y2="56" stroke={AMBER} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="68" y1="56" x2="76" y2="56" stroke={AMBER} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M 52 66 Q 60 64 68 66" stroke={AMBER} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <ellipse cx="78" cy="50" rx="1.4" ry="2.4" fill="#7fc3df" opacity="0.85" />
        </>
      );
    case "idle":
    case "pending":
    default:
      return (
        <>
          <path d="M 46 56 Q 49 58 52 56" stroke="#7a8a6a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M 68 56 Q 71 58 74 56" stroke="#7a8a6a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <line x1="56" y1="66" x2="64" y2="66" stroke="#7a8a6a" strokeWidth="1.4" strokeLinecap="round" />
          <text x="82" y="48" fontFamily="ui-monospace, monospace" fontSize="7" fontWeight="700" fill="#7a8a6a" opacity="0.7">z</text>
          <text x="86" y="44" fontFamily="ui-monospace, monospace" fontSize="5" fontWeight="700" fill="#7a8a6a" opacity="0.5">z</text>
        </>
      );
  }
}

function Antenna({ status }: { status: NodeStatus }) {
  let circleProps: React.SVGProps<SVGCircleElement> = { fill: "#3a2820" };
  if (status === "running") circleProps = { className: "m-led-running" };
  else if (status === "completed") circleProps = { fill: GREEN };
  else if (status === "failed") circleProps = { className: "m-led-failed" };
  else if (status === "blocked") circleProps = { fill: AMBER, opacity: 0.55 };
  return (
    <>
      <line x1="60" y1="14" x2="60" y2="24" stroke={INK} strokeWidth="1.4" />
      <circle cx="60" cy="13" r="2.2" stroke={INK} strokeWidth="0.9" {...circleProps} />
    </>
  );
}

function Chassis({ status, label }: { status: NodeStatus; label?: string }) {
  const screenFill = status === "running" ? "#0a1a0d" : status === "failed" ? "#1f0a08" : status === "completed" ? "#0a1a0d" : "#1a1410";
  const led1Fill = status === "running" ? GREEN : status === "completed" ? GREEN : status === "blocked" ? AMBER : "#3a2820";
  const led2Fill = status === "completed" ? GREEN : "#3a2820";

  return (
    <g>
      {/* shadow */}
      <ellipse cx="60" cy="112" rx="34" ry="3.5" fill={INK} opacity="0.18" />
      {/* wheels (centered) */}
      {(["50", "70"] as const).map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="108" r="5.5" fill="#2a2620" stroke={INK} strokeWidth="1.2" />
          <circle cx={cx} cy="108" r="1.8" fill={BRASS} stroke={INK} strokeWidth="0.6" />
          <line x1={cx} y1="103" x2={cx} y2="113" stroke={INK_SOFT} strokeWidth="0.5" opacity="0.6" />
          <line x1={String(Number(cx) - 5)} y1="108" x2={String(Number(cx) + 5)} y2="108" stroke={INK_SOFT} strokeWidth="0.5" opacity="0.6" />
        </g>
      ))}
      {/* body */}
      <rect x="22" y="32" width="76" height="74" rx="4" fill={BODY} stroke={INK} strokeWidth="1.5" />
      <rect x="22" y="32" width="6" height="74" fill={BODY_LIGHT} opacity="0.5" />
      <circle cx="28" cy="38" r="1.4" fill={INK} />
      <circle cx="92" cy="38" r="1.4" fill={INK} />
      <circle cx="28" cy="100" r="1.4" fill={INK} />
      <circle cx="92" cy="100" r="1.4" fill={INK} />
      {/* arms */}
      <rect x="18" y="80" width="6" height="5" rx="2.5" fill={BODY_DARK} stroke={INK} strokeWidth="1" />
      <circle cx="14" cy="82.5" r="5" fill={BRASS} stroke={INK} strokeWidth="1.1" />
      <circle cx="13" cy="81.5" r="1.2" fill="#fff" opacity="0.4" />
      <rect x="96" y="80" width="6" height="5" rx="2.5" fill={BODY_DARK} stroke={INK} strokeWidth="1" />
      <circle cx="106" cy="82.5" r="5" fill={BRASS} stroke={INK} strokeWidth="1.1" />
      <circle cx="105" cy="81.5" r="1.2" fill="#fff" opacity="0.4" />
      {/* top vent */}
      <rect x="32" y="24" width="56" height="10" rx="2" fill={BODY_DARK} stroke={INK} strokeWidth="1.2" />
      <line x1="38" y1="27" x2="82" y2="27" stroke={INK} strokeWidth="0.9" opacity="0.6" />
      <line x1="38" y1="30" x2="82" y2="30" stroke={INK} strokeWidth="0.9" opacity="0.6" />
      {/* screen + face */}
      <rect x="32" y="42" width="56" height="32" rx="2" fill={screenFill} stroke={INK} strokeWidth="1.2" />
      <Face status={status} />
      {/* indicator lights */}
      <circle cx="38" cy="86" r="3" fill={led1Fill} stroke={INK} strokeWidth="0.9" />
      <circle cx="50" cy="86" r="3" fill={led2Fill} stroke={INK} strokeWidth="0.9" />
      {/* dial */}
      <circle cx="80" cy="88" r="7" fill={BRASS} stroke={INK} strokeWidth="1.1" />
      {status === "running" ? (
        <g className="m-dial-running">
          <line x1="80" y1="88" x2="80" y2="83" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
        </g>
      ) : (
        <line x1="80" y1="88" x2="80" y2="83" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
      )}
      {/* output tray */}
      <rect x="40" y="96" width="42" height="5" rx="1" fill={BODY_DARK} stroke={INK} strokeWidth="0.9" />
      {status === "completed" && (
        <>
          <rect x="56" y="89" width="10" height="8" fill={BRASS} stroke={INK} strokeWidth="1" />
          <line x1="56" y1="92" x2="66" y2="92" stroke={INK} strokeWidth="0.7" opacity="0.5" />
        </>
      )}
      {/* name plate */}
      {label && (
        <g transform="translate(60, -2)">
          <rect x="-28" y="-9" width="56" height="13" rx="2" fill="#fbf5e4" stroke={INK} strokeWidth="1" opacity="0.96" />
          <text x="0" y="0" textAnchor="middle" fontSize="8" fontFamily="ui-monospace, monospace" fill={INK}>
            {label.length > 9 ? label.slice(0, 8) + "…" : label}
          </text>
        </g>
      )}
    </g>
  );
}

export function MachineFront({ status, label }: MachineFrontProps) {
  return (
    <svg className="office-machine" viewBox="0 0 120 120" width="120" height="120">
      {/* running steam */}
      {status === "running" && (
        <>
          <g className="m-steam-puff d1"><circle cx="50" cy="22" r="4" fill="#fff" opacity="0.7" /></g>
          <g className="m-steam-puff d2"><circle cx="62" cy="22" r="5" fill="#fff" opacity="0.7" /></g>
          <g className="m-steam-puff d3"><circle cx="72" cy="22" r="3.5" fill="#fff" opacity="0.7" /></g>
        </>
      )}
      {/* failed sparks */}
      {status === "failed" && (
        <>
          <g className="m-spark s1"><circle cx="50" cy="22" r="1.4" fill={AMBER} /></g>
          <g className="m-spark s2"><circle cx="60" cy="22" r="1.2" fill={RED} /></g>
          <g className="m-spark s3"><circle cx="68" cy="22" r="1.4" fill={AMBER} /></g>
        </>
      )}
      {status === "failed" ? (
        <g className="m-failed-body">
          <Chassis status={status} label={label} />
          <path d="M 60 74 L 64 84 L 58 92 L 64 100" stroke={INK} strokeWidth="0.9" fill="none" opacity="0.55" />
        </g>
      ) : status === "blocked" ? (
        <>
          <g className="m-blocked-dim">
            <Chassis status={status} label={label} />
          </g>
          <g className="m-blocked-overlay">
            <line x1="14" y1="56" x2="106" y2="84" stroke={INK} strokeWidth="3.5" strokeLinecap="round" opacity="0.85" />
            <line x1="14" y1="56" x2="106" y2="84" stroke={BRASS} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 3" />
            <g transform="translate(60, 70)">
              <path d="M -5 -2 Q -5 -8 0 -8 Q 5 -8 5 -2" stroke={INK} strokeWidth="1.8" fill="none" />
              <rect x="-8" y="-2" width="16" height="12" rx="2" fill={BRASS} stroke={INK} strokeWidth="1.4" />
              <circle cx="0" cy="4" r="1.4" fill={INK} />
            </g>
          </g>
        </>
      ) : (
        <Chassis status={status} label={label} />
      )}
      {/* spinning wheels overlay when running */}
      {status === "running" && (
        <>
          {(["50", "70"] as const).map((cx) => (
            <g key={`spin-${cx}`} className="m-wheel-spin">
              <circle cx={cx} cy="108" r="5.5" fill="#2a2620" stroke={INK} strokeWidth="1.2" />
              <circle cx={cx} cy="108" r="1.8" fill={BRASS} stroke={INK} strokeWidth="0.6" />
              <line x1={cx} y1="103" x2={cx} y2="113" stroke={INK_SOFT} strokeWidth="0.5" opacity="0.6" />
              <line x1={String(Number(cx) - 5)} y1="108" x2={String(Number(cx) + 5)} y2="108" stroke={INK_SOFT} strokeWidth="0.5" opacity="0.6" />
            </g>
          ))}
        </>
      )}
      <Antenna status={status} />
    </svg>
  );
}
