// Декоративная графика НИЗАМ: лёгкий пейзаж с архитектурным силуэтом и геометрический орнамент.
// Цвета берутся из CSS-переменных --art-*, поэтому графика автоматически адаптируется к теме.
import { useId } from 'react';

/** Восьмиконечная звезда (хатам) — повторяющийся орнамент. */
export function StarPattern({ className = '', opacity = 0.12, color = 'currentColor', size = 44 }: { className?: string; opacity?: number; color?: string; size?: number }) {
  const id = useId().replace(/:/g, '');
  const h = size / 2, q = size * 0.3;
  return (
    <svg className={className} aria-hidden width="100%" height="100%">
      <defs>
        <pattern id={`p${id}`} width={size} height={size} patternUnits="userSpaceOnUse">
          <g fill="none" stroke={color} strokeWidth="1" opacity={opacity}>
            <rect x={h - q} y={h - q} width={q * 2} height={q * 2} />
            <rect x={h - q} y={h - q} width={q * 2} height={q * 2} transform={`rotate(45 ${h} ${h})`} />
            <circle cx={h} cy={h} r={q * 0.45} />
            <path d={`M0 0 L${size * 0.12} 0 M0 0 L0 ${size * 0.12} M${size} ${size} L${size * 0.88} ${size} M${size} ${size} L${size} ${size * 0.88}`} />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#p${id})`} />
    </svg>
  );
}

function Minaret({ x }: { x: number }) {
  return (
    <g>
      <rect x={x - 4.5} y={86} width={9} height={124} />
      <rect x={x - 8} y={118} width={16} height={4} rx={1} />
      <rect x={x - 6.5} y={84} width={13} height={4} rx={1} />
      <path d={`M${x - 5} 84 Q${x} 62 ${x} 58 Q${x} 62 ${x + 5} 84 Z`} />
      <rect x={x - 0.6} y={50} width={1.2} height={9} />
    </g>
  );
}

/** Пейзаж для приветственного блока. Слева прозрачная зона под текст. */
export function HeroArt({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 800 220" preserveAspectRatio="xMaxYMax slice" aria-hidden>
      <defs>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--art-sky1)" />
          <stop offset="1" stopColor="var(--art-sky2)" />
        </linearGradient>
        <radialGradient id={`sun${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--art-sun)" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="var(--art-sun)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--art-sun)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`fade${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.38" stopColor="#000" />
          <stop offset="0.62" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <mask id={`m${id}`}><rect width="800" height="220" fill={`url(#fade${id})`} /></mask>
      </defs>
      <rect width="800" height="220" fill={`url(#sky${id})`} />
      <g mask={`url(#m${id})`}>
        <circle cx="650" cy="132" r="92" fill={`url(#sun${id})`} />
        <circle cx="650" cy="132" r="26" fill="var(--art-sun)" opacity="0.9" />
        {/* дальние горы */}
        <path d="M250 175 L330 128 L372 150 L440 104 L515 150 L560 124 L640 168 L700 132 L800 160 L800 220 L250 220 Z" fill="var(--art-far)" />
        {/* холмы */}
        <path d="M200 196 C300 168 380 178 470 170 C560 162 640 182 800 166 L800 220 L200 220 Z" fill="var(--art-hill)" />
        {/* силуэт */}
        <g fill="var(--art-sil)">
          <Minaret x={548} />
          <Minaret x={732} />
          <rect x={562} y={160} width={156} height={60} />
          <path d="M572 162 C572 147 582 139 591 136 C600 139 610 147 610 162 Z" />
          <path d="M670 162 C670 147 680 139 689 136 C698 139 708 147 708 162 Z" />
          <rect x={603} y={146} width={74} height={16} />
          <path d="M606 148 C606 116 622 99 640 92 C658 99 674 116 674 148 Z" />
          <rect x={639.3} y={74} width={1.4} height={20} />
          <circle cx={640} cy={73} r={2.4} />
        </g>
        <g fill="var(--art-sky2)" opacity="0.35">
          {[578, 600, 622, 644, 666, 688].map((x) => <path key={x} d={`M${x} 200 L${x} 186 Q${x + 6} 176 ${x + 12} 186 L${x + 12} 200 Z`} />)}
        </g>
        {/* кипарисы */}
        <g fill="var(--art-near)">
          <ellipse cx="770" cy="186" rx="7" ry="30" />
          <ellipse cx="784" cy="192" rx="5" ry="22" />
          <ellipse cx="500" cy="192" rx="5" ry="22" />
          <ellipse cx="512" cy="196" rx="4" ry="16" />
        </g>
        <path d="M300 214 C420 198 560 206 800 196 L800 220 L300 220 Z" fill="var(--art-near)" />
      </g>
    </svg>
  );
}

/** Знак НИЗАМ: восьмиконечная звезда с точкой порядка в центре. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0" aria-hidden>
      <rect width="40" height="40" rx="11" fill="var(--logo-bg)" />
      <g fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinejoin="round">
        <rect x="12" y="12" width="16" height="16" />
        <rect x="12" y="12" width="16" height="16" transform="rotate(45 20 20)" />
      </g>
      <circle cx="20" cy="20" r="3" fill="var(--gold)" />
    </svg>
  );
}
