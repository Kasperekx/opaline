import { useId } from "react";
import { HeroMotion } from "./hero-motion";
import styles from "./hero-aperture.module.css";

/** A machined optical rim, leaving the center clear for the product story. */
export function HeroAperture() {
  const id = useId();

  return (
    <HeroMotion>
      <svg
        className={styles.installation}
        viewBox="0 0 1600 860"
        fill="none"
        focusable="false"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <clipPath id={`${id}-rim-clip`}>
            <path
              clipRule="evenodd"
              d="M96 440a704 374 0 1 0 1408 0a704 374 0 1 0-1408 0M165 440a635 335 0 1 0 1270 0a635 335 0 1 0-1270 0"
            />
          </clipPath>
          <linearGradient id={`${id}-sheen`}>
            <stop stopColor="#dfbb79" stopOpacity="0" />
            <stop offset="0.42" stopColor="#dfbb79" stopOpacity="0.06" />
            <stop offset="0.52" stopColor="#fff0c8" stopOpacity="0.5" />
            <stop offset="0.62" stopColor="#dfbb79" stopOpacity="0.13" />
            <stop offset="1" stopColor="#dfbb79" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`${id}-metal`}>
            <stop offset="0.79" stopColor="#08090b" />
            <stop offset="0.816" stopColor="#141414" />
            <stop offset="0.834" stopColor="#25231e" />
            <stop offset="0.844" stopColor="#66543a" />
            <stop offset="0.852" stopColor="#b69660" />
            <stop offset="0.858" stopColor="#e5c68e" />
            <stop offset="0.864" stopColor="#7f6c4c" />
            <stop offset="0.88" stopColor="#28251f" />
            <stop offset="0.922" stopColor="#111213" />
            <stop offset="0.96" stopColor="#1e1e1b" />
            <stop offset="0.985" stopColor="#4d4434" />
            <stop offset="1" stopColor="#121313" />
          </radialGradient>
          <linearGradient
            id={`${id}-edge`}
            x1="300"
            y1="120"
            x2="1100"
            y2="810"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#dfbb79" stopOpacity="0.06" />
            <stop offset="0.24" stopColor="#fff1cc" stopOpacity="0.8" />
            <stop offset="0.44" stopColor="#dfbb79" stopOpacity="0.36" />
            <stop offset="0.7" stopColor="#dfbb79" stopOpacity="0.04" />
            <stop offset="1" stopColor="#dfbb79" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id={`${id}-beam`}
            x1="186"
            y1="220"
            x2="1390"
            y2="340"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#dfbb79" stopOpacity="0" />
            <stop offset="0.22" stopColor="#dfbb79" stopOpacity="0.36" />
            <stop offset="0.53" stopColor="#fff1cc" />
            <stop offset="0.76" stopColor="#dfbb79" stopOpacity="0.7" />
            <stop offset="1" stopColor="#dfbb79" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id={`${id}-shade`}
            x1="800"
            y1="20"
            x2="800"
            y2="860"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#08090b" stopOpacity="0" />
            <stop offset="0.2" stopColor="#08090b" stopOpacity="0.06" />
            <stop offset="0.56" stopColor="#08090b" stopOpacity="0.5" />
            <stop offset="0.88" stopColor="#08090b" stopOpacity="0.97" />
            <stop offset="1" stopColor="#08090b" />
          </linearGradient>
        </defs>

        <g transform="rotate(-14 800 440)">
          <g className={styles.rim}>
            <ellipse
              cx="800"
              cy="440"
              rx="779"
              ry="416"
              stroke="#dfbb79"
              strokeOpacity="0.035"
              strokeWidth="24"
            />
            <ellipse
              cx="800"
              cy="440"
              rx="770"
              ry="409"
              stroke="#dfbb79"
              strokeOpacity="0.07"
            />
            <ellipse
              cx="800"
              cy="440"
              rx="760"
              ry="404"
              fill={`url(#${id}-metal)`}
            />
            <ellipse
              cx="800"
              cy="440"
              rx="759"
              ry="403"
              stroke={`url(#${id}-edge)`}
            />
            <ellipse
              cx="800"
              cy="440"
              rx="744"
              ry="395"
              stroke="#dfbb79"
              strokeOpacity="0.08"
            />
            <ellipse
              cx="800"
              cy="440"
              rx="730"
              ry="388"
              stroke="#08090b"
              strokeWidth="2"
            />
            <ellipse
              cx="800"
              cy="440"
              rx="715"
              ry="380"
              stroke="#dfbb79"
              strokeOpacity="0.055"
            />
            <ellipse
              cx="800"
              cy="440"
              rx="701"
              ry="373"
              stroke="#dfbb79"
              strokeOpacity="0.07"
            />
            <ellipse
              cx="800"
              cy="440"
              rx="675"
              ry="359"
              stroke="#08090b"
              strokeWidth="3"
            />
            <ellipse
              cx="800"
              cy="440"
              rx="650"
              ry="346"
              stroke={`url(#${id}-edge)`}
              strokeWidth="1.5"
            />
            <ellipse cx="800" cy="440" rx="630" ry="334" fill="#08090b" />
          </g>

          <g clipPath={`url(#${id}-rim-clip)`}>
            <rect
              className={styles.sheen}
              x="-450"
              y="-150"
              width="900"
              height="1200"
              fill={`url(#${id}-sheen)`}
            />
          </g>
          <g className={styles.light}>
            <path
              d="M 150 440 A 650 346 0 0 1 1450 440"
              stroke={`url(#${id}-beam)`}
              strokeWidth="1.4"
            />
            <path
              d="M 134 440 A 666 354 0 0 1 1466 440"
              stroke={`url(#${id}-beam)`}
              strokeOpacity="0.2"
              strokeWidth="6"
            />
            <path
              d="M 155 440 A 645 343 0 0 1 1445 440"
              stroke={`url(#${id}-beam)`}
              strokeOpacity="0.24"
            />
          </g>

          <g className={styles.engraving} stroke="#e4c48c" strokeOpacity="0.35">
            <path d="M 789 39 V 49 M 800 36 V 53 M 811 39 V 49" />
            <path d="M 50 430 H 65 M 48 440 H 69 M 50 450 H 65" />
            <path d="M 1535 430 H 1550 M 1531 440 H 1552 M 1535 450 H 1550" />
          </g>
        </g>

        <rect width="1600" height="860" fill={`url(#${id}-shade)`} />
      </svg>
    </HeroMotion>
  );
}
