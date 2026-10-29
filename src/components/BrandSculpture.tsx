/** Original vector artwork: a continuous ribbon connecting an idea with its source. */
export function BrandSculpture() {
  const ribbon =
    'M 265 230 C 265 119 418 82 502 172 L 650 320 C 734 404 888 356 888 244 C 888 131 738 86 652 176 L 504 321 C 416 405 265 344 265 230';
  return (
    <div className="brand-sculpture">
      <svg viewBox="0 0 1160 470" role="img" aria-label="连接想法与源码的流动环形雕塑">
        <defs>
          <linearGradient
            id="ribbon-edge"
            x1="250"
            y1="100"
            x2="880"
            y2="390"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#3a919b" />
            <stop offset=".4" stopColor="#5b73c7" />
            <stop offset=".7" stopColor="#6e69a0" />
            <stop offset="1" stopColor="#6d9c95" />
          </linearGradient>
          <linearGradient
            id="ribbon-face"
            x1="290"
            y1="125"
            x2="860"
            y2="355"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#b9eeea" />
            <stop offset=".22" stopColor="#d5f0f1" />
            <stop offset=".46" stopColor="#a5bef4" />
            <stop offset=".67" stopColor="#d6cef4" />
            <stop offset=".85" stopColor="#c8e8df" />
            <stop offset="1" stopColor="#8fc5c9" />
          </linearGradient>
          <linearGradient
            id="ribbon-light"
            x1="300"
            y1="110"
            x2="800"
            y2="390"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="white" stopOpacity=".94" />
            <stop offset=".45" stopColor="white" stopOpacity=".05" />
            <stop offset=".75" stopColor="white" stopOpacity=".7" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="ribbon-shadow">
            <stop stopColor="#7c86a8" stopOpacity=".24" />
            <stop offset="1" stopColor="#7c86a8" stopOpacity="0" />
          </radialGradient>
          <filter id="ribbon-soft-shadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow
              dx="0"
              dy="24"
              stdDeviation="18"
              floodColor="#667c99"
              floodOpacity=".16"
            />
          </filter>
        </defs>
        <ellipse cx="578" cy="418" rx="370" ry="33" fill="url(#ribbon-shadow)" />
        <g filter="url(#ribbon-soft-shadow)">
          <path
            d={ribbon}
            transform="translate(0 13)"
            fill="none"
            stroke="url(#ribbon-edge)"
            strokeWidth="88"
          />
          <path d={ribbon} fill="none" stroke="url(#ribbon-face)" strokeWidth="88" />
          <path
            d={ribbon}
            transform="translate(-3 -8)"
            fill="none"
            stroke="url(#ribbon-light)"
            strokeWidth="62"
            opacity=".72"
          />
          <path
            d="M 283 210 C 299 132 419 113 480 178"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            opacity=".75"
          />
          <path
            d="M 678 185 C 744 119 851 149 867 213"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            opacity=".7"
          />
        </g>
      </svg>
      <div className="sculpture-label label-idea">
        <span /> 一个想法
      </div>
      <div className="sculpture-label label-source">
        <span /> 无限可能
      </div>
      <span className="sculpture-caption">IMAGINATION, IN MOTION.</span>
    </div>
  );
}
