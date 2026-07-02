import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import { Link, NavLink } from "react-router-dom";
import { AUTH_APP_URL } from "../../utils/appLinks";
import footerLogisticsVisual from "../../assets/feather-hero-logistics-visual-hd.webp";
import Icon from "./Icons";
import { companyProfile, siteNavigation } from "./siteData";

const MotionNav = motion.nav;
const MotionDiv = motion.div;
const MotionImg = motion.img;
const logoImage = "/feather-global-logo.svg";

const productLinks = [
  { label: "Weight Calculator", to: "/volumetric-weight-calculator", icon: "calculator" },
];

const supportHighlights = [
  "Order Verification",
  "Next Day Delivery",
  "Dedicated Shipping Advisors",
  "Multi-Carrier Access",
  "RTO Reduction",
  "Shipment Security",
];

const legalItems = [
  {
    title: "Refund & Cancellation Policy",
    description: "Understand our refund and cancellation process clearly.",
  },
  {
    title: "Privacy Policy",
    description: "Learn how we handle and protect your personal data.",
  },
  {
    title: "Terms of Service",
    description: "Read the rules, guidelines, and acceptable usage.",
  },
];

const socialLinks = [
  { label: "LinkedIn", href: "https://www.linkedin.com", icon: "linkedin" },
  { label: "Twitter", href: "https://twitter.com", icon: "twitter" },
  { label: "Facebook", href: "https://www.facebook.com", icon: "facebook" },
  { label: "YouTube", href: "https://www.youtube.com", icon: "youtube" },
];

function DesktopNavLink({ item }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        [
          "rounded-full px-3 py-2 text-sm font-medium transition",
          isActive
            ? "bg-[#e4f6f8] text-[#047b85] shadow-[0_8px_18px_rgba(4,123,133,0.12)]"
            : "text-[#17242d] hover:bg-[#eef9fb] hover:text-[#047b85]",
        ].join(" ")
      }
    >
      {item.label}
    </NavLink>
  );
}

function MobileNavLink({ item, onClose }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        [
          "rounded-2xl px-4 py-3 text-sm font-medium transition",
          isActive
            ? "bg-[#e4f6f8] text-[#047b85]"
            : "bg-white text-[#17242d] hover:bg-[#eef9fb] hover:text-[#047b85]",
        ].join(" ")
      }
      onClick={onClose}
    >
      {item.label}
    </NavLink>
  );
}

function FooterCtaShowcase() {
  return (
    <MotionDiv
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative min-h-[15rem] overflow-hidden lg:min-h-[21rem]"
    >
      <div className="absolute inset-x-2 top-4 h-36 opacity-35 [clip-path:polygon(0_18%,18%_6%,38%_14%,55%_4%,82%_16%,100%_34%,88%_62%,70%_58%,54%_76%,34%_66%,18%_82%,4%_58%)] [background-image:radial-gradient(circle,#80c5ce_1.3px,transparent_1.55px)] [background-size:8px_8px]" />
      <svg className="absolute right-[12%] top-10 hidden h-24 w-[23rem] text-[#047b85] opacity-75 sm:block" viewBox="0 0 360 96" fill="none" aria-hidden="true">
        <path d="M60 50 C132 8 230 14 306 38" stroke="currentColor" strokeWidth="1.7" />
        <path d="M60 33v33" stroke="#047b85" strokeWidth="8" strokeLinecap="round" />
        <circle cx="60" cy="33" r="12" fill="#047b85" />
        <circle cx="60" cy="33" r="4" fill="white" />
        <path d="M306 22v33" stroke="#ff821c" strokeWidth="8" strokeLinecap="round" />
        <circle cx="306" cy="22" r="12" fill="#ff821c" />
        <circle cx="306" cy="22" r="4" fill="white" />
      </svg>
      <MotionImg
        src={footerLogisticsVisual}
        alt="Feather Global shipping network"
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        className="absolute inset-x-0 bottom-0 z-10 h-full w-full object-contain object-bottom mix-blend-multiply lg:object-right-bottom"
      />
    </MotionDiv>
  );
}

function FooterBrandLogo() {
  return (
    <div className="flex items-center gap-4" role="img" aria-label={companyProfile.name}>
      <div className="relative h-[4.4rem] w-[4.4rem] shrink-0">
        <span className="absolute left-0 top-[1.35rem] h-8 w-8 rounded-[2px] bg-[#ff7a1a]" />
        <span className="absolute left-8 top-[2.15rem] h-8 w-8 rounded-[2px] bg-[#007f8c]" />
        <span className="absolute left-0 top-0 h-8 w-8 rounded-[2px] bg-[#007f8c]" />
        <span className="absolute left-8 top-[0.8rem] h-8 w-8 rounded-[2px] bg-[#ff7a1a]" />
        <span className="absolute left-[0.7rem] top-[0.28rem] text-sm font-bold text-white">F</span>
        <span className="absolute left-[2.72rem] top-[2.42rem] text-sm font-bold text-white">G</span>
      </div>
      <span className="font-display text-xl font-extrabold leading-[1.15] tracking-[0.34em] text-white">
        FEATHER
        <br />
        GLOBAL
      </span>
    </div>
  );
}

export function SiteHeader({ menuOpen, onToggleMenu, onCloseMenu }) {
  const { scrollYProgress } = useScroll();
  const progressScale = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 28,
    mass: 0.25,
  });

  return (
    <header className="sticky top-0 z-50 border-b border-[#d7eef1] bg-white/92 shadow-[0_10px_30px_rgba(4,62,69,0.06)] backdrop-blur-xl">
      <MotionDiv
        className="absolute inset-x-0 bottom-[-1px] h-[2px] origin-left bg-[linear-gradient(90deg,#047b85,#ff821c)]"
        style={{ scaleX: progressScale }}
        aria-hidden="true"
      />
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2 sm:gap-6 sm:px-6 lg:px-8">
        <Link to="/" className="shrink-0">
          <img src={logoImage} alt={companyProfile.name} className="h-[4.15rem] w-auto object-contain sm:h-[4.7rem] lg:h-[5.1rem]" />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-2 lg:flex xl:gap-3">
          {siteNavigation.map((item) => (
            <DesktopNavLink key={item.to} item={item} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <a
            href={AUTH_APP_URL}
            className="hidden rounded-xl border border-[#047b85] bg-white px-6 py-3 text-sm font-semibold text-[#047b85] shadow-[0_14px_28px_rgba(4,123,133,0.08)] transition hover:-translate-y-0.5 hover:bg-[#047b85] hover:text-white lg:inline-flex"
          >
            Login
          </a>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#b9e0e5] bg-white text-[#047b85] transition hover:bg-[#eef9fb] lg:hidden"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            onClick={onToggleMenu}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {menuOpen ? (
          <MotionNav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-[#d7eef1] bg-[#f7fcfd] lg:hidden"
          >
            <div className="mx-auto grid max-w-7xl gap-3 px-4 py-4 sm:px-6">
              {siteNavigation.map((item) => (
                <MobileNavLink key={item.to} item={item} onClose={onCloseMenu} />
              ))}
              <a
                href={AUTH_APP_URL}
                onClick={onCloseMenu}
                className="inline-flex justify-center rounded-2xl bg-[#047b85] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#056c76]"
              >
                Login
              </a>
            </div>
          </MotionNav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer id="site-footer" className="overflow-hidden bg-[#013f49] text-white">
      <div className="px-0 pt-0">
        <div className="mx-auto max-w-[1518px] rounded-t-[4.6rem] rounded-b-[2.6rem] bg-[#f3fbff] px-5 py-10 text-[#071923] shadow-[0_18px_60px_rgba(0,24,30,0.18)] sm:px-8 lg:px-16 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-[0.42fr_0.58fr] lg:items-center">
            <MotionDiv
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10"
            >
              <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#f47d21]">
                Ready to ship smarter?
              </p>
              <h2 className="mt-5 font-display text-[2.45rem] font-extrabold leading-[1.08] text-[#071923] sm:text-[3.25rem]">
                One Platform.
                <br />
                <span className="text-[#047b85]">Endless Possibilities.</span>
              </h2>
              <p className="mt-5 max-w-[32rem] text-base font-medium leading-[1.85] text-[#17242d]">
                Get started today and transform your delivery experience with cleaner logistics,
                better visibility, and faster shipping decisions.
              </p>
              <div className="mt-8">
                <a
                  href={AUTH_APP_URL}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-4 rounded-lg bg-[#047b85] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(4,123,133,0.18)] transition hover:-translate-y-0.5 hover:bg-[#056c76] sm:w-auto"
                  style={{ color: "#ffffff" }}
                >
                  <span>Get Started</span>
                  <Icon name="chevronRight" className="h-5 w-5" />
                </a>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-8 gap-y-3 text-sm font-medium text-[#17242d]">
                {["Cleaner logistics", "Better visibility", "Faster decisions"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-3">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-[#047b85] text-white">
                      <Icon name="checkCircle" className="h-3.5 w-3.5" />
                    </span>
                    <span>{item}</span>
                  </span>
                ))}
              </div>
            </MotionDiv>

            <FooterCtaShowcase />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1518px] px-5 py-12 sm:px-8 lg:px-16">
        <div className="grid gap-10 border-b border-white/8 pb-10 lg:grid-cols-[1.35fr_0.8fr_1fr_1.05fr_1.1fr]">
          <div>
            <FooterBrandLogo />
            <p className="mt-5 max-w-sm text-base leading-7 text-white/82">
              Your trusted partner in reliable, fast, and affordable delivery solutions. Seamless
              logistics to power your business growth.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {socialLinks.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={item.label}
                  className="grid h-11 w-11 place-items-center rounded-full bg-[#002f38] text-white/82 shadow-[0_10px_28px_rgba(0,0,0,0.16)] transition hover:-translate-y-0.5 hover:bg-[#056c76] hover:text-white"
                >
                  <Icon name={item.icon} className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>

          <div className="border-white/10 lg:border-l lg:pl-8">
            <h3 className="text-base font-extrabold text-white">Product</h3>
            <div className="mt-5 grid gap-3.5">
              {productLinks.map((item) => (
                <NavLink key={item.to} className="text-sm font-medium text-white/76 transition hover:text-white" to={item.to}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>

          <div className="border-white/10 lg:border-l lg:pl-8">
            <h3 className="text-base font-extrabold text-white">Features</h3>
            <ul className="mt-5 grid gap-3.5">
              {supportHighlights.map((item) => (
                <li key={item} className="text-sm font-medium text-white/76">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-white/10 lg:border-l lg:pl-8">
            <h3 className="text-base font-extrabold text-white">Legal</h3>
            <div className="mt-5 grid gap-4">
              {legalItems.map((item) => (
                <div key={item.title} className="text-sm">
                  <p className="font-semibold text-white/88">{item.title}</p>
                  <p className="mt-1 leading-6 text-white/56">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-white/10 lg:border-l lg:pl-8">
            <h3 className="text-base font-extrabold text-white">Contact</h3>
            <div className="mt-5 grid gap-3.5 text-sm font-medium text-white/76">
              <a href={`mailto:${companyProfile.email}`} className="transition hover:text-white">
                Email: {companyProfile.email}
              </a>
              <a href={`tel:${companyProfile.mobile}`} className="transition hover:text-white">
                Mobile: {companyProfile.mobile}
              </a>
              <a href={`tel:${companyProfile.phone.replace(/-/g, "")}`} className="transition hover:text-white">
                Phone: {companyProfile.phone}
              </a>
              <p className="leading-6">{companyProfile.address}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-7 text-sm text-white/62 sm:flex-row sm:items-center sm:justify-between">
          <p>(c) 2026 {companyProfile.name}. Seamless logistics to power smarter shipping operations.</p>
          <a href={AUTH_APP_URL} className="font-semibold text-white/76 transition hover:text-white">
            Get Started
          </a>
        </div>
      </div>
    </footer>
  );
}
