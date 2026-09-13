import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRight, ArrowDown, ChevronUp, Info, X } from 'lucide-react';
import { useVideoScrub } from '@/useVideoScrub';

const VIDEO_URL =
  'https://res.cloudinary.com/j2rwj2ob/video/upload/v1789308721/refaca_com_o_efeito_de_drone_p.mp4';

const DARK = '#1D3045';

const NAV_LINKS = [
  { name: 'VECTRUS ENERGY', active: true },
  { name: 'VECTRUS UPSTREAM', active: false },
  { name: 'VECTRUS MARKETS', active: false },
  { name: 'VECTRUS SYSTEMS', active: false },
  { name: 'VECTRUS+', active: false },
];

interface StaggerProps {
  delay?: number;
  visible?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
}

function Stagger({ delay = 0, visible = false, children, className = '', style = {}, id }: StaggerProps) {
  return (
    <div
      id={id}
      className={className}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0px)' : 'translateY(24px)',
        transition: `opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export default function App() {
  const { videoRef, canvasRef, containerRef, scrollProgress, canvasLive } = useVideoScrub(VIDEO_URL);

  const [activeLink, setActiveLink] = useState('VECTRUS ENERGY');
  const [menuOpen, setMenuOpen] = useState(false);
  const [navEntered, setNavEntered] = useState(false);

  // Nav entrance after 200ms
  useEffect(() => {
    const timer = setTimeout(() => setNavEntered(true), 200);
    return () => clearTimeout(timer);
  }, []);

  // Body overflow hidden when mobile menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  // Color flips at p > 0.55: DARK -> white (duration-500)
  const isLightNav = scrollProgress <= 0.55;
  const navColor = isLightNav ? DARK : '#FFFFFF';
  const navInvertedColor = isLightNav ? '#FFFFFF' : DARK;

  // Sequential text sections opacity calculations
  // s1Opacity: p < 0.20 -> 1, else -> max(0, 1 - (p - 0.20) / 0.08)
  const s1Opacity =
    scrollProgress < 0.2
      ? 1
      : Math.max(0, 1 - (scrollProgress - 0.2) / 0.08);

  // s2Opacity: p < 0.32 -> 0, p < 0.40 -> (p - 0.32) / 0.08, p < 0.55 -> 1, else -> max(0, 1 - (p - 0.55) / 0.08)
  let s2Opacity = 0;
  if (scrollProgress < 0.32) {
    s2Opacity = 0;
  } else if (scrollProgress < 0.4) {
    s2Opacity = (scrollProgress - 0.32) / 0.08;
  } else if (scrollProgress < 0.55) {
    s2Opacity = 1;
  } else {
    s2Opacity = Math.max(0, 1 - (scrollProgress - 0.55) / 0.08);
  }

  // s3Opacity: p < 0.67 -> 0, p < 0.75 -> (p - 0.67) / 0.08, else -> 1
  let s3Opacity = 0;
  if (scrollProgress < 0.67) {
    s3Opacity = 0;
  } else if (scrollProgress < 0.75) {
    s3Opacity = (scrollProgress - 0.67) / 0.08;
  } else {
    s3Opacity = 1;
  }

  // Children use Stagger: visible when section opacity > 0.3
  const s1Visible = s1Opacity > 0.3;
  const s2Visible = s2Opacity > 0.3;
  const s3Visible = s3Opacity > 0.3;

  // Helper to scroll to target progress smoothly
  const scrollToProgress = useCallback((targetP: number) => {
    const container = containerRef.current;
    if (!container) return;
    const maxScroll = container.offsetHeight - window.innerHeight;
    window.scrollTo({
      top: targetP * maxScroll,
      behavior: 'smooth',
    });
  }, [containerRef]);

  return (
    <div
      ref={containerRef}
      id="scroll-container"
      className="relative h-[500vh] w-full bg-[#1D3045]"
    >
      {/* Sticky top-0 viewport scene */}
      <div className="sticky top-0 w-full h-screen overflow-hidden">
        {/* 1) <video> full cover fallback */}
        <video
          ref={videoRef}
          src={VIDEO_URL}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          muted
          playsInline
          preload="auto"
          crossOrigin="anonymous"
        />

        {/* 2) <canvas width=1920 height=1080> absolute inset-0 object-cover, opacity 1 when frame-bank is live else 0 */}
        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300 ${
            canvasLive ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* 3) Overlay absolute inset-0 pointer-events-none containing Navbar + 3 sequential sections */}
        <div className="absolute inset-0 pointer-events-none">
          {/* NAVBAR */}
          <nav
            id="navbar"
            className="absolute top-0 left-0 right-0 z-50 pointer-events-auto px-6 sm:px-8 md:px-12 pt-8 sm:pt-12 pb-6 flex items-center justify-between"
          >
            {/* Desktop lg+: Left cluster of 5 links */}
            <div className="hidden lg:flex items-center gap-8 xl:gap-10">
              {NAV_LINKS.map((link, i) => {
                const isActive = activeLink === link.name;
                return (
                  <div
                    key={link.name}
                    style={{
                      opacity: navEntered ? 1 : 0,
                      transform: navEntered ? 'translateY(0)' : 'translateY(-12px)',
                      transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${
                        i * 80 + 100
                      }ms, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * 80 + 100}ms`,
                    }}
                  >
                    <button
                      id={`nav-link-${i}`}
                      onClick={() => setActiveLink(link.name)}
                      className="relative text-xs tracking-[0.15em] uppercase font-medium hover:opacity-70 transition-colors duration-500 cursor-pointer block"
                      style={{ color: navColor }}
                    >
                      {link.name}
                      {isActive && (
                        <span
                          className="absolute -bottom-3 left-0 w-full h-[2px] transition-colors duration-500"
                          style={{ backgroundColor: navColor }}
                        />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Mobile <lg: Hamburger left, 3 bars: 24x2, 24x2, 16x2, gap 5px, color follows isLight */}
            <button
              id="mobile-hamburger-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="Open mobile menu"
              className="lg:hidden flex flex-col gap-[5px] cursor-pointer p-1"
              style={{
                opacity: navEntered ? 1 : 0,
                transform: navEntered ? 'translateY(0)' : 'translateY(-12px)',
                transition:
                  'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) 100ms, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 100ms',
              }}
            >
              <div
                className="w-6 h-[2px] transition-colors duration-500"
                style={{ backgroundColor: navColor }}
              />
              <div
                className="w-6 h-[2px] transition-colors duration-500"
                style={{ backgroundColor: navColor }}
              />
              <div
                className="w-4 h-[2px] transition-colors duration-500"
                style={{ backgroundColor: navColor }}
              />
            </button>

            {/* Right cluster (hidden below sm) */}
            <div
              className="hidden sm:flex items-center gap-6 md:gap-8"
              style={{
                opacity: navEntered ? 1 : 0,
                transform: navEntered ? 'translateY(0)' : 'translateY(-12px)',
                transition:
                  'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) 500ms, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) 500ms',
              }}
            >
              {/* NEWS + 20px circle filled with current nav color, Info icon size 10 inverted */}
              <div
                className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
                style={{ color: navColor }}
              >
                <span className="text-xs tracking-[0.2em] uppercase font-medium transition-colors duration-500">
                  NEWS
                </span>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-500"
                  style={{ backgroundColor: navColor, color: navInvertedColor }}
                >
                  <Info size={10} strokeWidth={2.5} />
                </div>
              </div>

              {/* MENU label: lg+ span, below lg button that opens overlay */}
              <span
                className="hidden lg:inline text-xs tracking-[0.2em] uppercase font-medium transition-colors duration-500"
                style={{ color: navColor }}
              >
                MENU
              </span>
              <button
                id="menu-trigger-btn"
                onClick={() => setMenuOpen(true)}
                className="lg:hidden text-xs tracking-[0.2em] uppercase font-medium transition-colors duration-500 hover:opacity-70 cursor-pointer"
                style={{ color: navColor }}
              >
                MENU
              </button>
            </div>
          </nav>

          {/* SECTION 1 (hero, left aligned, vertically centered) */}
          <div
            id="section-1"
            style={{
              opacity: s1Opacity,
              transition: 'opacity 0.1s ease-out',
            }}
            className={`absolute inset-0 flex flex-col justify-center px-6 sm:px-8 md:px-20 lg:px-32 ${
              s1Visible ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            <div className="max-w-4xl">
              <Stagger delay={0} visible={s1Visible}>
                <h1
                  style={{
                    fontSize: 'clamp(2rem, 5vw, 5rem)',
                    color: DARK,
                  }}
                  className="font-light uppercase leading-[1.2] tracking-tight"
                >
                  Advancing resources for a cleaner future
                </h1>
              </Stagger>

              <Stagger delay={150} visible={s1Visible}>
                <p
                  style={{ color: 'rgba(29, 48, 69, 0.90)' }}
                  className="mt-6 text-sm tracking-[0.3em] uppercase font-medium"
                >
                  Sustainable power with purpose
                </p>
              </Stagger>
            </div>

            {/* Bottom-right absolute bottom-12 right-6 sm:right-8 md:right-12: 48px circle button, border DARK 50%, ArrowRight 18 */}
            <div className="absolute bottom-12 right-6 sm:right-8 md:right-12">
              <Stagger delay={300} visible={s1Visible}>
                <button
                  id="s1-arrow-btn"
                  onClick={() => scrollToProgress(0.45)}
                  style={{
                    borderColor: 'rgba(29, 48, 69, 0.50)',
                    color: DARK,
                  }}
                  className="w-12 h-12 rounded-full border flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity duration-300"
                  aria-label="Next section"
                >
                  <ArrowRight size={18} />
                </button>
              </Stagger>
            </div>
          </div>

          {/* SECTION 2 (center) */}
          <div
            id="section-2"
            style={{
              opacity: s2Opacity,
              transition: 'opacity 0.1s ease-out',
            }}
            className={`absolute inset-0 flex items-center justify-center px-6 sm:px-8 ${
              s2Visible ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            <div className="max-w-[900px] mx-auto text-center">
              <Stagger delay={0} visible={s2Visible}>
                <h2
                  style={{
                    fontSize: 'clamp(1.5rem, 4.5vw, 4.5rem)',
                    color: DARK,
                  }}
                  className="font-extralight tracking-wide leading-[1.3] text-center uppercase"
                >
                  We build lasting partnerships with vision{' '}
                  <span style={{ color: 'rgba(29, 48, 69, 0.80)' }}>and precision</span>{' '}
                  <span style={{ color: 'rgba(29, 48, 69, 0.50)' }}>across every frontier</span>
                </h2>
              </Stagger>
            </div>

            {/* Right column absolute bottom-16 right-6 sm:right-8 md:right-12, flex-col items-center gap-4 */}
            <div
              className={`absolute bottom-16 right-6 sm:right-8 md:right-12 flex flex-col items-center gap-4 ${
                s2Visible ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              {/* 48px circle, border DARK 40%, ArrowDown 18 */}
              <Stagger delay={200} visible={s2Visible}>
                <button
                  id="s2-down-btn"
                  onClick={() => scrollToProgress(0.85)}
                  style={{
                    borderColor: 'rgba(29, 48, 69, 0.40)',
                    color: DARK,
                  }}
                  className="w-12 h-12 rounded-full border flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity duration-300"
                  aria-label="Next section"
                >
                  <ArrowDown size={18} />
                </button>
              </Stagger>

              {/* mt-4 three dots: 8px solid DARK (active), 6px DARK 40%, 6px DARK 40%, gap-2 */}
              <Stagger delay={350} visible={s2Visible}>
                <div className="mt-4 flex flex-col items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#1D3045]" />
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: 'rgba(29, 48, 69, 0.40)' }}
                  />
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: 'rgba(29, 48, 69, 0.40)' }}
                  />
                </div>
              </Stagger>

              {/* 40px circle, border DARK 30%, ChevronUp 16, color DARK 80%, mt-2 */}
              <Stagger delay={500} visible={s2Visible}>
                <button
                  id="s2-top-btn"
                  onClick={() => scrollToProgress(0)}
                  style={{
                    borderColor: 'rgba(29, 48, 69, 0.30)',
                    color: 'rgba(29, 48, 69, 0.80)',
                  }}
                  className="mt-2 w-10 h-10 rounded-full border flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity duration-300"
                  aria-label="Scroll to top"
                >
                  <ChevronUp size={16} />
                </button>
              </Stagger>
            </div>
          </div>

          {/* SECTION 3 (right aligned, white type — video is dark here) */}
          <div
            id="section-3"
            style={{
              opacity: s3Opacity,
              transition: 'opacity 0.1s ease-out',
            }}
            className={`absolute inset-0 flex items-center justify-end px-6 sm:px-8 md:px-20 lg:px-32 ${
              s3Visible ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            <div className="max-w-2xl text-left">
              {/* Eyebrow: "Halder | Nordvik" text-white/60 text-lg tracking-wide mb-4 */}
              <Stagger delay={0} visible={s3Visible}>
                <p className="text-white/60 text-lg tracking-wide mb-4 font-normal">
                  Halder | Nordvik
                </p>
              </Stagger>

              {/* H2: "Fueling ambition," line break "shaping tomorrow." */}
              <Stagger delay={150} visible={s3Visible}>
                <h2
                  style={{ fontSize: 'clamp(2rem, 4vw, 4rem)' }}
                  className="font-light text-white leading-[1.2] uppercase tracking-wide mb-8"
                >
                  Fueling ambition,
                  <br />
                  shaping tomorrow.
                </h2>
              </Stagger>

              {/* CTA row gap-4: "Contact Nordvik" text-sm tracking-[0.3em] text-white/80 uppercase + 40px white circle */}
              <Stagger delay={300} visible={s3Visible}>
                <div className="flex items-center gap-4">
                  <span className="text-sm tracking-[0.3em] text-white/80 uppercase font-medium">
                    Contact Nordvik
                  </span>
                  <button
                    id="s3-contact-btn"
                    onClick={() => scrollToProgress(0)}
                    className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-800 hover:scale-110 duration-300 transition-transform cursor-pointer shadow-lg"
                    aria-label="Contact Nordvik"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </Stagger>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE MENU OVERLAY: fixed inset-0 z-[100], background DARK */}
      <div
        id="mobile-menu-overlay"
        className={`fixed inset-0 z-[100] transition-[opacity,visibility] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          menuOpen
            ? 'opacity-100 visible pointer-events-auto'
            : 'opacity-0 invisible pointer-events-none'
        }`}
        style={{ backgroundColor: DARK }}
      >
        <div
          className={`w-full h-full flex flex-col justify-between transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            menuOpen ? 'translate-y-0' : '-translate-y-8'
          }`}
        >
          {/* Close: top-right px-6 sm:px-8 pt-8 sm:pt-12, 40px circle border-white/30, X 18, hover:border-white */}
          <div className="flex justify-end px-6 sm:px-8 pt-8 sm:pt-12">
            <button
              id="mobile-menu-close-btn"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="w-10 h-10 rounded-full border border-white/30 flex items-center justify-center text-white hover:border-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Links centered vertically, px-8 sm:px-12, py-3, text-2xl sm:text-3xl font-light tracking-wide uppercase */}
          <div className="flex-1 flex flex-col justify-center px-8 sm:px-12">
            {NAV_LINKS.map((link, i) => {
              const isActive = activeLink === link.name;
              return (
                <div
                  key={link.name}
                  style={{
                    transform: menuOpen ? 'translateY(0)' : 'translateY(20px)',
                    opacity: menuOpen ? 1 : 0,
                    transition: `transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${
                      i * 60
                    }ms, opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${i * 60}ms`,
                  }}
                >
                  <button
                    id={`mobile-link-${i}`}
                    onClick={() => {
                      setActiveLink(link.name);
                      setMenuOpen(false);
                    }}
                    className={`py-3 text-2xl sm:text-3xl font-light tracking-wide uppercase text-left transition-colors duration-200 cursor-pointer block ${
                      isActive ? 'text-white' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {link.name}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer: NEWS and CONTACT, text-xs tracking-[0.2em] uppercase text-white/60, px-8 sm:px-12 pb-10 */}
          <div className="flex items-center gap-8 text-xs tracking-[0.2em] uppercase text-white/60 px-8 sm:px-12 pb-10">
            <span className="cursor-pointer hover:text-white transition-colors">
              NEWS
            </span>
            <span className="cursor-pointer hover:text-white transition-colors">
              CONTACT
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
