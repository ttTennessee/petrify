import type { NodeStatus } from "@petrify/shared";
import "./style.css";

const INK = "#241c14";
const INK_SOFT = "#5a4a36";
const BODY = "#5b7a8d";
const BODY_DARK = "#3f5765";
const BODY_LIGHT = "#7a99ad";
const BRASS = "#c89968";
const GREEN = "#5fae6a";
const AMBER = "#e0a040";

interface MachineSideProps {
  status: NodeStatus;
  facing?: "left" | "right";
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

export function MachineSide({ status, facing = "right" }: MachineSideProps) {
  const flip = facing === "left" ? "scale(-1, 1) translate(-120, 0)" : undefined;
  return (
    <svg className="factory-machine" viewBox="0 0 120 120" width="120" height="120">
      <g transform={flip}>
        <ellipse cx="60" cy="112" rx="20" ry="3" fill={INK} opacity="0.18" />
        {/* single centered wheel (far wheel hidden behind body) */}
        {status === "running" ? (
          <g className="m-wheel-spin">
            <circle cx="60" cy="108" r="5.5" fill="#2a2620" stroke={INK} strokeWidth="1.2" />
            <circle cx="60" cy="108" r="1.8" fill={BRASS} stroke={INK} strokeWidth="0.6" />
            <line x1="60" y1="103" x2="60" y2="113" stroke={INK_SOFT} strokeWidth="0.5" opacity="0.6" />
            <line x1="55" y1="108" x2="65" y2="108" stroke={INK_SOFT} strokeWidth="0.5" opacity="0.6" />
          </g>
        ) : (
          <>
            <circle cx="60" cy="108" r="5.5" fill="#2a2620" stroke={INK} strokeWidth="1.2" />
            <circle cx="60" cy="108" r="1.8" fill={BRASS} stroke={INK} strokeWidth="0.6" />
            <line x1="60" y1="103" x2="60" y2="113" stroke={INK_SOFT} strokeWidth="0.5" opacity="0.6" />
            <line x1="55" y1="108" x2="65" y2="108" stroke={INK_SOFT} strokeWidth="0.5" opacity="0.6" />
          </>
        )}
        {/* body */}
        <rect x="32" y="32" width="56" height="74" rx="4" fill={BODY} stroke={INK} strokeWidth="1.5" />
        <rect x="82" y="32" width="6" height="74" fill={BODY_DARK} opacity="0.4" />
        <rect x="32" y="32" width="5" height="74" fill={BODY_LIGHT} opacity="0.45" />
        {/* top vent */}
        <rect x="36" y="24" width="48" height="10" rx="2" fill={BODY_DARK} stroke={INK} strokeWidth="1.2" />
        <line x1="42" y1="27" x2="78" y2="27" stroke={INK} strokeWidth="0.9" opacity="0.6" />
        <line x1="42" y1="30" x2="78" y2="30" stroke={INK} strokeWidth="0.9" opacity="0.6" />
        {/* round gauge */}
        <circle cx="60" cy="52" r="11" fill="#1a1410" stroke={INK} strokeWidth="1.2" />
        <circle cx="60" cy="52" r="8.5" fill="#0d0a07" />
        <line x1="60" y1="52" x2="65" y2="47" stroke={GREEN} strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="60" cy="52" r="1.2" fill={BRASS} />
        <circle cx="60" cy="44" r="0.6" fill={BRASS} opacity="0.7" />
        <circle cx="68" cy="52" r="0.6" fill={BRASS} opacity="0.7" />
        <circle cx="60" cy="60" r="0.6" fill={BRASS} opacity="0.7" />
        <circle cx="52" cy="52" r="0.6" fill={BRASS} opacity="0.7" />
        {/* side vent slats */}
        <line x1="42" y1="70" x2="78" y2="70" stroke={INK} strokeWidth="0.8" opacity="0.6" />
        <line x1="42" y1="74" x2="78" y2="74" stroke={INK} strokeWidth="0.8" opacity="0.6" />
        <line x1="42" y1="78" x2="78" y2="78" stroke={INK} strokeWidth="0.8" opacity="0.6" />
        {/* side rivets */}
        <circle cx="40" cy="38" r="1.3" fill={INK} />
        <circle cx="80" cy="38" r="1.3" fill={INK} />
        <circle cx="40" cy="100" r="1.3" fill={INK} />
        <circle cx="80" cy="100" r="1.3" fill={INK} />
        {/* near hand hanging in front of body */}
        <rect x="56" y="74" width="5" height="14" rx="2.5" fill={BODY_DARK} stroke={INK} strokeWidth="1" />
        <circle cx="58.5" cy="88" r="5" fill={BRASS} stroke={INK} strokeWidth="1.1" />
        <circle cx="57.5" cy="87" r="1.2" fill="#fff" opacity="0.4" />
        {/* back exhaust pipe */}
        <rect x="26" y="40" width="6" height="14" rx="1.5" fill={BODY_DARK} stroke={INK} strokeWidth="0.9" />
        <circle cx="29" cy="40" r="3" fill="#1a1410" stroke={INK} strokeWidth="0.9" />
        {/* output port */}
        <rect x="68" y="96" width="16" height="4" rx="1" fill={BODY_DARK} stroke={INK} strokeWidth="0.9" />
        <Antenna status={status} />
      </g>
    </svg>
  );
}
