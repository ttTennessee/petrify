import type { NodeStatus } from "@petrify/shared";
import "./style.css";

const INK = "#241c14";
const INK_SOFT = "#5a4a36";
const BODY_DARK = "#3f5765";
const BRASS = "#c89968";
const BRASS_DARK = "#8a6a40";
const GREEN = "#5fae6a";
const AMBER = "#e0a040";

interface MachineBackProps {
  status: NodeStatus;
  iconUrl?: string;
  label?: string;
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

export function MachineBack({ status, iconUrl, label }: MachineBackProps) {
  const powerLed = status === "running" || status === "completed" ? GREEN : status === "failed" ? "#c25450" : "#3a2820";
  const labelText = label ? label.toUpperCase().slice(0, 12) : "";
  return (
    <svg className="office-machine" viewBox="0 0 120 120" width="120" height="120">
      <ellipse cx="60" cy="112" rx="34" ry="3.5" fill={INK} opacity="0.18" />
      {/* wheels */}
      {(["50", "70"] as const).map((cx) => {
        const wheel = (
          <>
            <circle cx={cx} cy="108" r="5.5" fill="#2a2620" stroke={INK} strokeWidth="1.2" />
            <circle cx={cx} cy="108" r="1.8" fill={BRASS} stroke={INK} strokeWidth="0.6" />
            <line x1={cx} y1="103" x2={cx} y2="113" stroke={INK_SOFT} strokeWidth="0.5" opacity="0.6" />
            <line x1={String(Number(cx) - 5)} y1="108" x2={String(Number(cx) + 5)} y2="108" stroke={INK_SOFT} strokeWidth="0.5" opacity="0.6" />
          </>
        );
        return status === "running" ? (
          <g key={cx} className="m-wheel-spin">{wheel}</g>
        ) : (
          <g key={cx}>{wheel}</g>
        );
      })}
      {/* body (back is darker) */}
      <rect x="22" y="32" width="76" height="74" rx="4" fill={BODY_DARK} stroke={INK} strokeWidth="1.5" />
      <circle cx="28" cy="38" r="1.4" fill={INK} />
      <circle cx="92" cy="38" r="1.4" fill={INK} />
      <circle cx="28" cy="100" r="1.4" fill={INK} />
      <circle cx="92" cy="100" r="1.4" fill={INK} />
      {/* arms (back: knuckles, no highlight) */}
      <rect x="18" y="80" width="6" height="5" rx="2.5" fill="#2a3a45" stroke={INK} strokeWidth="1" />
      <circle cx="14" cy="82.5" r="5" fill={BRASS_DARK} stroke={INK} strokeWidth="1.1" />
      <line x1="11" y1="80.5" x2="11.5" y2="84.5" stroke={INK} strokeWidth="0.5" opacity="0.5" />
      <line x1="14" y1="80" x2="14" y2="85" stroke={INK} strokeWidth="0.5" opacity="0.5" />
      <line x1="17" y1="80.5" x2="16.5" y2="84.5" stroke={INK} strokeWidth="0.5" opacity="0.5" />
      <rect x="96" y="80" width="6" height="5" rx="2.5" fill="#2a3a45" stroke={INK} strokeWidth="1" />
      <circle cx="106" cy="82.5" r="5" fill={BRASS_DARK} stroke={INK} strokeWidth="1.1" />
      <line x1="103" y1="80.5" x2="103.5" y2="84.5" stroke={INK} strokeWidth="0.5" opacity="0.5" />
      <line x1="106" y1="80" x2="106" y2="85" stroke={INK} strokeWidth="0.5" opacity="0.5" />
      <line x1="109" y1="80.5" x2="108.5" y2="84.5" stroke={INK} strokeWidth="0.5" opacity="0.5" />
      {/* top vent (back, darker) */}
      <rect x="32" y="24" width="56" height="10" rx="2" fill="#1a1410" stroke={INK} strokeWidth="1.2" />
      <line x1="38" y1="27" x2="82" y2="27" stroke={BODY_DARK} strokeWidth="0.9" opacity="0.7" />
      <line x1="38" y1="30" x2="82" y2="30" stroke={BODY_DARK} strokeWidth="0.9" opacity="0.7" />
      {/* nameplate */}
      <rect x="34" y="42" width="52" height="34" rx="3" fill="#fbf5e4" stroke={INK} strokeWidth="1.2" />
      <rect x="34" y="42" width="52" height="4" rx="3" fill={BRASS} opacity="0.85" />
      {iconUrl && (
        <image href={iconUrl} x="44" y="49" width="32" height="22" preserveAspectRatio="xMidYMid meet" />
      )}
      {labelText && (
        <text x="60" y="73" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="4.5" fill={INK} letterSpacing="0.15em">
          {labelText}
        </text>
      )}
      {/* heat fins */}
      <line x1="34" y1="84" x2="86" y2="84" stroke={INK} strokeWidth="0.6" opacity="0.5" />
      <line x1="34" y1="88" x2="86" y2="88" stroke={INK} strokeWidth="0.6" opacity="0.5" />
      <line x1="34" y1="92" x2="86" y2="92" stroke={INK} strokeWidth="0.6" opacity="0.5" />
      {/* data port */}
      <rect x="74" y="96" width="10" height="6" rx="1" fill="#1a1410" stroke={INK} strokeWidth="0.9" />
      <rect x="76" y="98" width="6" height="2" fill={BRASS} />
      {/* power button */}
      <circle cx="42" cy="99" r="2.5" fill="#1a1410" stroke={INK} strokeWidth="0.9" />
      <circle cx="42" cy="99" r="1" fill={powerLed} />
      <Antenna status={status} />
    </svg>
  );
}
