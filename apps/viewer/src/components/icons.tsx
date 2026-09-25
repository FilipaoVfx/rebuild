import type { SVGProps } from 'react';

/** Iconos de trazo fino, dibujados aquí: sin paquete de iconos ni CDN. */
type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Search: (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Svg>,
  Pin: (p: P) => <Svg {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></Svg>,
  Info: (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></Svg>,
  Close: (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>,
  Arrow: (p: P) => <Svg {...p}><path d="M4 12h15M13 6l6 6-6 6" /></Svg>,
  Back: (p: P) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>,
  Next: (p: P) => <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>,
  Chevron: (p: P) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>,
  External: (p: P) => <Svg {...p}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Svg>,
  Map: (p: P) => <Svg {...p}><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" /><path d="M9 4v13.5M15 6.5V20" /></Svg>,
  Alert: (p: P) => <Svg {...p}><path d="M12 3.5 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2h.01" /></Svg>,
  People: (p: P) => <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19.5c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16 14.6c2.3 0 4 1.5 4.5 4.4" /></Svg>,
  Tree: (p: P) => <Svg {...p}><path d="M12 21v-6" /><path d="M12 15c-3.9 0-6-2.4-6-5.3 0-2.4 1.5-3.8 3-4.2C9.6 3.9 10.7 3 12 3s2.4.9 3 2.5c1.5.4 3 1.8 3 4.2C18 12.6 15.9 15 12 15z" /></Svg>,
  Building: (p: P) => <Svg {...p}><path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21" /><path d="M3 21h18M9 7h1.5M13.5 7H15M9 11h1.5M13.5 11H15M9 15h1.5M13.5 15H15M10.5 21v-3h3v3" /></Svg>,
  Doc: (p: P) => <Svg {...p}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 15.5h6M9 9h2" /></Svg>,
  Layers: (p: P) => <Svg {...p}><path d="m12 3.5 9 4.8-9 4.8-9-4.8z" /><path d="m3 12.2 9 4.8 9-4.8M3 16.2 12 21l9-4.8" /></Svg>,
  Plus: (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  Minus: (p: P) => <Svg {...p}><path d="M5 12h14" /></Svg>,
  Target: (p: P) => <Svg {...p}><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="1.8" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" /></Svg>,
  Check: (p: P) => <Svg {...p}><path d="m5 12.5 4.2 4.2L19 7" /></Svg>,
  Clipboard: (p: P) => <Svg {...p}><path d="M9 4h6v3H9z" /><path d="M9 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15" /><path d="M8.5 11.5h7M8.5 15h7M8.5 18h4" /></Svg>,
  Bookmark: (p: P) => <Svg {...p}><path d="M6.5 3.5h11V21L12 16.8 6.5 21z" /></Svg>,
  Print: (p: P) => <Svg {...p}><path d="M7 8V3.5h10V8M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 5 8h14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 19 17h-2" /><path d="M7 13.5h10V21H7z" /></Svg>,
  Walk: (p: P) => <Svg {...p}><circle cx="13" cy="4.5" r="1.8" /><path d="m9 21 2.5-6.5 2.5 2.5V21M8.5 11l2.5-3.5 3.5 1 2 3M11 7.5 10 13" /></Svg>,
  Talk: (p: P) => <Svg {...p}><path d="M4 12a8 7 0 1 1 3.2 5.6L4 19l1-3.2A6.6 6.6 0 0 1 4 12z" /></Svg>,
  Ruler: (p: P) => <Svg {...p}><path d="m3.5 16.5 13-13 4 4-13 13z" /><path d="m7 13 2 2M10 10l1.5 1.5M13 7l2 2" /></Svg>,
  Quake: (p: P) => <Svg {...p}><path d="M2.5 12h4l2-5 3 10 3-8 2 3h5" /></Svg>,
  Bulb: (p: P) => <Svg {...p}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" /></Svg>,
  Image: (p: P) => <Svg {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><circle cx="9" cy="9.5" r="1.6" /><path d="m4 18 5.5-5.5 4 4 2.5-2.5L20 18" /></Svg>,
  Compass: (p: P) => <Svg {...p}><path d="M12 3 8 13h8z" fill="currentColor" stroke="none" /><path d="M12 21 8 13h8z" /></Svg>,
  Sliders: (p: P) => <Svg {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Svg>,
  Sun: (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></Svg>,
  Moon: (p: P) => <Svg {...p}><path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z" /></Svg>,
  Monitor: (p: P) => <Svg {...p}><rect x="3" y="4.5" width="18" height="12" rx="1.5" /><path d="M8.5 20h7M12 16.5V20" /></Svg>,
  Question: (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7M12 16.8h.01" /></Svg>,
  Scale: (p: P) => <Svg {...p}><path d="M12 4v16M5 20h14M5 7h14" /><path d="m5 7-2.5 6h5zM19 7l-2.5 6h5z" /></Svg>,
};
