import { useEffect, useState } from "react";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import heroLogisticsVisual from "../../assets/feather-hero-logistics-visual-hd.webp";
import { AUTH_APP_URL } from "../../utils/appLinks";
import Icon from "./Icons";
import { companyProfile } from "./siteData";
import { Reveal } from "./primitives";

const MotionArticle = motion.article;
const MotionButton = motion.button;
const MotionDiv = motion.div;
const MotionImg = motion.img;
const MotionSpan = motion.span;

const primaryButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center gap-4 rounded-lg bg-[#047b85] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(4,123,133,0.18)] transition hover:-translate-y-0.5 hover:bg-[#056c76] sm:w-auto";

const courierPartners = [
  {
    name: "Delhivery",
    mark: "D",
    bg: "#0f172a",
    accent: "#e21b2d",
  },
  {
    name: "Blue Dart",
    mark: "BD",
    bg: "#1e6ab3",
    accent: "#f6c343",
  },
  {
    name: "DTDC",
    mark: "DT",
    bg: "#1d7f4f",
    accent: "#f5c84c",
  },
  {
    name: "XpressBees",
    mark: "XB",
    bg: "#111827",
    accent: "#f59e0b",
  },
  {
    name: "Ecom Express",
    mark: "EX",
    bg: "#ffffff",
    accent: "#ef4444",
  },
  {
    name: "Shadowfax",
    mark: "SF",
    bg: "#07966f",
    accent: "#f7c948",
  },
];

const heroProofItems = [
  { label: "Live routing", value: "27+ carriers", icon: "route" },
  { label: "Dispatch ready", value: "labels + manifests", icon: "package" },
  { label: "Ops support", value: "onboarding help", icon: "headset" },
];

const whyChooseCards = [
  {
    title: "Multiple Couriers",
    description: "Access top courier partners worldwide from a single platform.",
    icon: "users",
    tone: "teal",
  },
  {
    title: "Easy Integration",
    description: "Integrate once and connect with all supported couriers seamlessly.",
    icon: "gear",
    tone: "orange",
  },
  {
    title: "Real-time Tracking",
    description: "Track shipments in real-time and keep your customers informed.",
    icon: "barChart",
    tone: "teal",
  },
  {
    title: "Save Time & Money",
    description: "Automate shipping processes and get the best rates effortlessly.",
    icon: "pieChart",
    tone: "orange",
  },
];

const featureShowcaseItems = [
  {
    title: "Unified Dashboard",
    tabDescription: "All your shipping data, in one place.",
    icon: "barChart",
    number: "01",
    description:
      "Manage all shipments, carriers, and performance metrics from a single, intuitive dashboard.",
    bullets: [
      "View all shipments and statuses in real-time",
      "Monitor delivery performance and KPIs",
      "Centralize operations across all locations",
      "Custom filters, saved views, and exports",
    ],
    metrics: [
      { label: "Total Shipments", value: "2,458", change: "+12.5%", icon: "package", tone: "teal" },
      { label: "In Transit", value: "1,245", change: "+8.7%", icon: "truck", tone: "teal" },
      { label: "Delivered", value: "1,150", change: "+15.2%", icon: "checkCircle", tone: "teal" },
      { label: "Exceptions", value: "63", change: "-4.3%", icon: "alertTriangle", tone: "orange" },
    ],
    lineA: "M8 126 L54 102 L96 102 L140 54 L184 86 L228 74 L272 78 L316 58 L360 68 L404 34 L448 54 L492 36",
    lineB: "M8 142 L54 126 L96 114 L140 88 L184 108 L228 94 L272 88 L316 96 L360 94 L404 78 L448 90 L492 72",
    status: [
      { label: "Delivered", value: "46%", color: "#047b85" },
      { label: "In Transit", value: "30%", color: "#0f9aa4" },
      { label: "Pending", value: "10%", color: "#ff821c" },
      { label: "Exception", value: "14%", color: "#ef4b3f" },
    ],
  },
  {
    title: "Multiple Carrier Access",
    tabDescription: "Connect with top global carriers instantly.",
    icon: "truck",
    number: "02",
    description:
      "Compare and ship through trusted courier partners without switching between separate portals.",
    bullets: [
      "Connect Delhivery, Blue Dart, DTDC, XpressBees and more",
      "Compare serviceability, speed, and rates before dispatch",
      "Assign carriers by lane, weight, COD, and delivery priority",
      "Scale carrier coverage as your order volume grows",
    ],
    metrics: [
      { label: "Courier Partners", value: "27+", change: "+6 live", icon: "truck", tone: "teal" },
      { label: "Pin Codes", value: "29K+", change: "+18%", icon: "mapPin", tone: "teal" },
      { label: "Best Match", value: "94%", change: "+11.8%", icon: "checkCircle", tone: "teal" },
      { label: "Manual Checks", value: "0", change: "-100%", icon: "refresh", tone: "orange" },
    ],
    lineA: "M8 116 L54 96 L96 84 L140 78 L184 60 L228 54 L272 48 L316 42 L360 36 L404 30 L448 28 L492 24",
    lineB: "M8 136 L54 130 L96 116 L140 104 L184 96 L228 82 L272 74 L316 70 L360 62 L404 52 L448 48 L492 42",
    status: [
      { label: "Express", value: "38%", color: "#047b85" },
      { label: "Standard", value: "34%", color: "#0f9aa4" },
      { label: "Economy", value: "18%", color: "#ff821c" },
      { label: "Special", value: "10%", color: "#ef4b3f" },
    ],
  },
  {
    title: "Real-time Tracking",
    tabDescription: "Track every shipment in real-time.",
    icon: "mapPin",
    number: "03",
    description:
      "Track courier movement, milestone updates, and delivery exceptions from one live timeline.",
    bullets: [
      "Sync shipment milestones from booking to delivery",
      "Share customer-ready tracking updates automatically",
      "Spot stuck shipments and exceptions earlier",
      "Give support teams one clear status source",
    ],
    metrics: [
      { label: "Live Updates", value: "24/7", change: "always on", icon: "clock", tone: "teal" },
      { label: "In Transit", value: "1,082", change: "+9.1%", icon: "truck", tone: "teal" },
      { label: "Delivered", value: "934", change: "+13.4%", icon: "checkCircle", tone: "teal" },
      { label: "Attention", value: "41", change: "-5.8%", icon: "alertTriangle", tone: "orange" },
    ],
    lineA: "M8 132 L54 120 L96 94 L140 102 L184 70 L228 72 L272 56 L316 64 L360 48 L404 42 L448 44 L492 28",
    lineB: "M8 144 L54 132 L96 126 L140 112 L184 104 L228 96 L272 90 L316 82 L360 78 L404 70 L448 64 L492 56",
    status: [
      { label: "Delivered", value: "51%", color: "#047b85" },
      { label: "Moving", value: "29%", color: "#0f9aa4" },
      { label: "Pending", value: "12%", color: "#ff821c" },
      { label: "NDR", value: "8%", color: "#ef4b3f" },
    ],
  },
  {
    title: "Automated Workflows",
    tabDescription: "Save time with smart automation.",
    icon: "gear",
    number: "04",
    description:
      "Automate repetitive shipping tasks so teams can process orders faster with fewer errors.",
    bullets: [
      "Auto-generate labels, manifests, and AWB updates",
      "Trigger courier rules based on business preferences",
      "Reduce manual task load during peak order cycles",
      "Keep customers notified without repetitive follow-up",
    ],
    metrics: [
      { label: "Labels Created", value: "8,420", change: "+21.5%", icon: "package", tone: "teal" },
      { label: "Rules Active", value: "36", change: "+12", icon: "gear", tone: "teal" },
      { label: "Hours Saved", value: "128", change: "+18.2%", icon: "clock", tone: "teal" },
      { label: "Manual Errors", value: "9", change: "-42%", icon: "alertTriangle", tone: "orange" },
    ],
    lineA: "M8 118 L54 100 L96 92 L140 76 L184 82 L228 62 L272 58 L316 44 L360 42 L404 32 L448 30 L492 22",
    lineB: "M8 142 L54 132 L96 120 L140 112 L184 104 L228 92 L272 86 L316 78 L360 70 L404 64 L448 58 L492 50",
    status: [
      { label: "Auto Labels", value: "42%", color: "#047b85" },
      { label: "Rules", value: "28%", color: "#0f9aa4" },
      { label: "Alerts", value: "18%", color: "#ff821c" },
      { label: "Manual", value: "12%", color: "#ef4b3f" },
    ],
  },
  {
    title: "Smart Analytics",
    tabDescription: "Make data-driven decisions with insights that matter.",
    icon: "pieChart",
    number: "05",
    description:
      "Understand cost, delivery performance, and courier reliability with clean operational insights.",
    bullets: [
      "Review courier cost trends and lane performance",
      "Track COD, RTO, and exception patterns",
      "Identify the best courier mix by business goal",
      "Export insights for leadership and operations reviews",
    ],
    metrics: [
      { label: "Cost Savings", value: "18%", change: "+7.2%", icon: "coins", tone: "teal" },
      { label: "Reports", value: "42", change: "+8", icon: "barChart", tone: "teal" },
      { label: "Best Lanes", value: "214", change: "+15%", icon: "route", tone: "teal" },
      { label: "RTO Risk", value: "6.8%", change: "-3.1%", icon: "alertTriangle", tone: "orange" },
    ],
    lineA: "M8 134 L54 112 L96 118 L140 82 L184 74 L228 90 L272 62 L316 66 L360 44 L404 50 L448 36 L492 24",
    lineB: "M8 146 L54 138 L96 126 L140 116 L184 108 L228 98 L272 92 L316 86 L360 76 L404 72 L448 66 L492 58",
    status: [
      { label: "Profitable", value: "44%", color: "#047b85" },
      { label: "Stable", value: "31%", color: "#0f9aa4" },
      { label: "Watch", value: "15%", color: "#ff821c" },
      { label: "Risk", value: "10%", color: "#ef4b3f" },
    ],
  },
];

const featureSupportItems = [
  {
    title: "Secure & Reliable",
    description: "Enterprise-grade security to keep your data safe.",
    icon: "shield",
  },
  {
    title: "Scalable Platform",
    description: "Built to grow with your business, anywhere.",
    icon: "layers",
  },
  {
    title: "Global Reach",
    description: "Ship to 220+ countries with local expertise.",
    icon: "globe",
  },
  {
    title: "Expert Support",
    description: "Get help from real people, whenever you need it.",
    icon: "headset",
  },
];

const testimonialSlides = [
  [
    {
      quote:
        "Feather Global has completely transformed our shipping operations. One integration, multiple carriers, and real-time tracking - everything just works.",
      name: "James Carter",
      role: "Operations Manager, TrendyMart",
      brand: "TrendyMart",
      brandIcon: "shoppingBag",
      avatar: "https://i.pravatar.cc/96?img=12",
    },
    {
      quote:
        "The platform is easy to use, reliable, and the support team is outstanding. It has helped us reduce shipping costs and deliver a better experience to our customers.",
      name: "Sarah Lee",
      role: "CEO, LuxeHome",
      brand: "LuxeHome",
      brandIcon: "store",
      avatar: "https://i.pravatar.cc/96?img=47",
    },
    {
      quote:
        "From API integration to everyday shipments, Feather Global makes global shipping simple and scalable. Highly recommended!",
      name: "Michael Brown",
      role: "Co-founder, GearUp",
      brand: "GearUp",
      brandIcon: "spark",
      avatar: "https://i.pravatar.cc/96?img=68",
    },
  ],
  [
    {
      quote:
        "Our team now manages courier allocation, tracking, and exceptions from one clean dashboard. It saves hours every week and keeps customers informed.",
      name: "Aisha Mehta",
      role: "Logistics Lead, UrbanNest",
      brand: "UrbanNest",
      brandIcon: "store",
      avatar: "https://i.pravatar.cc/96?img=32",
    },
    {
      quote:
        "Feather Global helped us bring order volume, carrier performance, and cost visibility into one place. The workflow feels built for scaling brands.",
      name: "Ravi Kapoor",
      role: "Founder, QuickCart",
      brand: "QuickCart",
      brandIcon: "shoppingBag",
      avatar: "https://i.pravatar.cc/96?img=15",
    },
    {
      quote:
        "The real-time shipment updates and automated workflows have improved our delivery experience. Our support tickets are down and dispatch is smoother.",
      name: "Priya Nair",
      role: "Customer Experience Head, Glowly",
      brand: "Glowly",
      brandIcon: "star",
      avatar: "https://i.pravatar.cc/96?img=44",
    },
  ],
  [
    {
      quote:
        "We needed a shipping platform that could grow with us. Feather Global gave us carrier access, tracking visibility, and a reliable operating rhythm.",
      name: "Daniel Evans",
      role: "COO, CraftLane",
      brand: "CraftLane",
      brandIcon: "package",
      avatar: "https://i.pravatar.cc/96?img=11",
    },
    {
      quote:
        "The dashboard is practical, fast, and easy for our team to learn. We can compare courier options and move orders forward with much less friction.",
      name: "Neha Shah",
      role: "Director, FreshBox",
      brand: "FreshBox",
      brandIcon: "layers",
      avatar: "https://i.pravatar.cc/96?img=49",
    },
    {
      quote:
        "Feather Global makes shipping decisions clearer. The analytics helped us understand which lanes, couriers, and service levels work best.",
      name: "Omar Khan",
      role: "Growth Manager, ModeHaus",
      brand: "ModeHaus",
      brandIcon: "barChart",
      avatar: "https://i.pravatar.cc/96?img=59",
    },
  ],
];

const testimonialStats = [
  {
    value: "10,000+",
    label: "Businesses Trust Us",
    icon: "users",
  },
  {
    value: "2M+",
    label: "Shipments Delivered",
    icon: "package",
  },
  {
    value: "220+",
    label: "Countries Reached",
    icon: "globe",
  },
  {
    value: "99.8%",
    label: "Customer Satisfaction",
    icon: "star",
  },
];

const faqItems = [
  {
    question: "What is Feather Global?",
    answer:
      "Feather Global is an all-in-one shipping platform that connects you with multiple courier partners through a single integration. It helps businesses simplify shipping, save time and money, and deliver a better customer experience.",
  },
  {
    question: "Which couriers are integrated with Feather Global?",
    answer:
      "Feather Global supports leading courier partners including Delhivery, Blue Dart, DTDC, XpressBees, Ecom Express, Shadowfax, and other trusted networks for domestic and international delivery.",
  },
  {
    question: "How does the pricing work?",
    answer:
      "Pricing depends on shipment weight, dimensions, origin, destination, service level, and courier partner. The platform helps compare available options so teams can choose the best rate for every order.",
  },
  {
    question: "Is there a setup or monthly fee?",
    answer:
      "Plans can be tailored based on shipment volume and integration needs. The goal is to keep onboarding simple, transparent, and aligned with how your business ships.",
  },
  {
    question: "How secure is my data with Feather Global?",
    answer:
      "Feather Global is built with secure access patterns and operational safeguards so shipment, customer, and business data remain protected across the workflow.",
  },
  {
    question: "Can I integrate Feather Global with my existing platform?",
    answer:
      "Yes. Feather Global can connect with ecommerce stores, marketplaces, internal tools, and custom systems using API-ready shipping workflows.",
  },
  {
    question: "What kind of support do you provide?",
    answer:
      "Support is available for onboarding, courier setup, integration questions, shipment workflows, and day-to-day operational guidance.",
  },
];

const valueCards = [
  {
    title: "Multi-Channel Integration",
    description:
      "Connect Shopify, WooCommerce, Amazon, Flipkart and more so every selling channel lives in one place.",
    icon: "globe",
    shell:
      "bg-[linear-gradient(135deg,rgba(198,231,255,0.5),rgba(255,255,255,0.95))]",
  },
  {
    title: "27+ Courier Partners",
    description:
      "Work with Blue Dart, Delhivery, XpressBees, FedEx and more from one shipping workspace.",
    icon: "truck",
    shell:
      "bg-[linear-gradient(135deg,rgba(255,221,174,0.42),rgba(255,255,255,0.95))]",
  },
  {
    title: "Auto Order Sync",
    description:
      "Orders from all channels flow into the dashboard automatically so your team can ship faster.",
    icon: "refresh",
    shell:
      "bg-[linear-gradient(135deg,rgba(212,246,255,0.58),rgba(255,255,255,0.95))]",
  },
  {
    title: "Automated Label Generation",
    description:
      "Labels are prepared using your preferred courier logic so operators spend less time repeating manual tasks.",
    icon: "package",
    shell:
      "bg-[linear-gradient(135deg,rgba(198,231,255,0.46),rgba(255,255,255,0.95))]",
  },
  {
    title: "Unified Dashboard",
    description:
      "Manage orders, shipments, analytics, and delivery updates from a single operational view.",
    icon: "chart",
    shell:
      "bg-[linear-gradient(135deg,rgba(255,221,174,0.34),rgba(255,255,255,0.95))]",
  },
];

const insightCards = [
  {
    title: "Delivery Performance",
    description: "Track delivery metrics and courier performance in real-time.",
    icon: "chart",
  },
  {
    title: "Financial Analytics",
    description: "Monitor courier costs, COD collection, and RTO trends.",
    icon: "coins",
  },
  {
    title: "Customer Metrics",
    description: "Access detailed reports on customer satisfaction and order trends.",
    icon: "checkCircle",
  },
];

const ecommerceCards = [
  {
    title: "Automatic Order Sync",
    description: "Orders from all connected channels are automatically synced to your dashboard.",
    icon: "refresh",
  },
  {
    title: "AWB Number Update",
    description: "AWB numbers are automatically updated back to your store or marketplace.",
    icon: "package",
  },
  {
    title: "Real-time Tracking Updates",
    description: "Shipment tracking updates are synced in real-time to keep customers informed.",
    icon: "bell",
  },
];

const dashboardBars = [
  "h-16 bg-[#8FD8FF]",
  "h-24 bg-[#FFD8A8]",
  "h-20 bg-[#BEEBFF]",
  "h-32 bg-[#9BCBFF]",
  "h-[5.4rem] bg-[#FDE7C5]",
  "h-28 bg-[#CFEFFF]",
  "h-[6.5rem] bg-[#FFCFA0]",
];

const rateCards = [
  {
    title: "Live Rate Comparison",
    description: "Compare courier pricing, delivery speed, and serviceability before every booking.",
    icon: "calculator",
    metric: "27+",
    label: "courier options",
  },
  {
    title: "Cost Control",
    description: "Spot high-cost lanes, COD impact, RTO risk, and avoidable surcharges earlier.",
    icon: "wallet",
    metric: "18%",
    label: "average savings",
  },
  {
    title: "No Guesswork",
    description: "Choose the right carrier with clear delivery promises and operational signals.",
    icon: "checkCircle",
    metric: "94%",
    label: "best-fit match",
  },
];

const rateRows = [
  {
    courier: "Delhivery",
    lane: "Surface",
    price: "Rs 64",
    eta: "2-4 days",
    fit: "Best value",
    width: "w-[88%]",
  },
  {
    courier: "Blue Dart",
    lane: "Air",
    price: "Rs 112",
    eta: "1-2 days",
    fit: "Fastest",
    width: "w-[74%]",
  },
  {
    courier: "XpressBees",
    lane: "Standard",
    price: "Rs 72",
    eta: "3-5 days",
    fit: "COD ready",
    width: "w-[81%]",
  },
];

const launchSteps = [
  {
    title: "Connect Channels",
    description: "Map stores, marketplaces, pickup points, and courier preferences.",
    icon: "api",
  },
  {
    title: "Configure Rules",
    description: "Set lane logic, COD rules, service priorities, and shipment automation.",
    icon: "gear",
  },
  {
    title: "Go Live",
    description: "Start shipping with labels, tracking, reports, and expert support ready.",
    icon: "rocket",
  },
];

const supportCards = [
  {
    title: "Onboarding Support",
    description: "A guided setup path for teams moving from spreadsheets or multiple courier portals.",
    icon: "headset",
  },
  {
    title: "Operational Playbooks",
    description: "Practical workflows for NDR, RTO, courier allocation, and customer updates.",
    icon: "layers",
  },
  {
    title: "Scale Reviews",
    description: "Review delivery performance and courier mix as shipment volume grows.",
    icon: "barChart",
  },
];

function ActionAnchor({ href, children, className, style }) {
  return (
    <a className={className} href={href} style={style}>
      {children}
    </a>
  );
}

function HeroRouteOverlay() {
  return (
    <div className="hero-route-overlay" aria-hidden="true">
      <svg className="hero-route-overlay__line" viewBox="0 0 640 360" fill="none">
        <motion.path
          d="M64 230 C150 150 238 170 316 108 C418 28 510 76 590 28"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
          strokeDasharray="10 12"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2.2, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      {[
        { label: "SUR", className: "left-[9%] top-[58%]", delay: 0.75 },
        { label: "DXB", className: "left-[47%] top-[25%]", delay: 0.95 },
        { label: "LHR", className: "right-[7%] top-[8%]", delay: 1.15 },
      ].map((pin) => (
        <MotionSpan
          key={pin.label}
          initial={{ opacity: 0, y: 12, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, delay: pin.delay, ease: [0.22, 1, 0.36, 1] }}
          className={`hero-route-overlay__pin ${pin.className}`}
        >
          {pin.label}
        </MotionSpan>
      ))}
    </div>
  );
}

function HeroProofStrip() {
  return (
    <div className="hero-proof-strip">
      {heroProofItems.map((item, index) => (
        <div
          key={item.label}
          className="hero-proof-strip__item"
          style={{ animationDelay: `${0.36 + index * 0.08}s` }}
        >
          <span className="hero-proof-strip__icon">
            <Icon name={item.icon} className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-[0.66rem] font-extrabold uppercase tracking-[0.14em] text-[#f47d21]">
              {item.label}
            </span>
            <span className="mt-1 block text-sm font-semibold leading-snug text-[#071923]">
              {item.value}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function AlignedPanelSection({ children, shellClassName = "", innerClassName = "", sectionNumber }) {
  return (
    <section className="section-transition bg-[#047b85]">
      <div
        className={`relative mx-auto max-w-[1518px] overflow-hidden rounded-t-[4.6rem] bg-[#f3fbff] px-5 pb-10 pt-12 sm:px-8 sm:pb-12 sm:pt-14 lg:px-16 ${shellClassName}`}
      >
        <span className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(4,123,133,0.32),rgba(255,130,28,0.24),transparent)]" />
        {sectionNumber ? (
          <span className="pointer-events-none absolute right-6 top-6 hidden font-display text-[4.8rem] font-extrabold leading-none text-[#047b85]/[0.07] lg:block">
            {sectionNumber}
          </span>
        ) : null}
        <div className={`mx-auto max-w-[1360px] ${innerClassName}`}>{children}</div>
      </div>
    </section>
  );
}

function AlignedSectionHeading({ eyebrow, title, description, className = "" }) {
  return (
    <div className={className}>
      <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#f47d21]">
        {eyebrow}
      </p>
      <h2 className="mt-4 max-w-[44rem] font-display text-[2rem] font-extrabold leading-[1.16] text-[#071923] sm:text-[2.55rem]">
        {title}
      </h2>
      <p className="mt-5 max-w-[36rem] text-sm font-medium leading-[1.75] text-[#17242d] sm:text-base">
        {description}
      </p>
    </div>
  );
}

function HeroSection() {
  const { scrollYProgress } = useScroll();
  const visualY = useTransform(scrollYProgress, [0, 0.2], [0, -38]);
  const visualScale = useTransform(scrollYProgress, [0, 0.2], [1, 0.975]);

  return (
    <section className="hero-section section-transition overflow-hidden bg-[#fbfefe] pt-12 sm:pt-16 lg:pt-18">
      <div className="mx-auto grid max-w-[1440px] min-w-0 grid-cols-1 gap-8 px-5 pb-10 sm:px-8 lg:grid-cols-[0.45fr_0.55fr] lg:items-center lg:px-16 lg:pb-4">
        <Reveal className="min-w-0" delay={0.04}>
          <div className="relative z-10 min-w-0 max-w-[40rem] lg:pb-4">
            <span className="text-[0.95rem] font-extrabold uppercase tracking-[0.12em] text-[#f47d21] sm:text-[1.12rem]">
              One Platform. All Couriers.
            </span>
            <h1 className="mt-6 max-w-full break-words font-display text-[2.18rem] font-extrabold leading-[1.12] text-[#061a27] sm:text-[4.05rem] sm:leading-[1.08] lg:text-[3.55rem] xl:text-[3.75rem]">
              <span className="block sm:whitespace-nowrap">Simplify Shipping.</span>
              <span className="mt-1 block text-[#087f8c]">Scale Globally.</span>
            </h1>
            <p className="mt-7 max-w-[21.5rem] text-[1rem] leading-[1.85] text-[#0d1720] sm:max-w-[31rem] sm:text-[1.2rem]">
              Feather Global connects you with multiple courier partners through a single
              integration, saving you time, money, and effort.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              <ActionAnchor
                href={AUTH_APP_URL}
                className="inline-flex min-h-14 w-full max-w-[21.75rem] items-center justify-center rounded-lg bg-[#037c87] px-7 py-4 text-base font-bold text-white shadow-[0_14px_28px_rgba(3,124,135,0.18)] transition hover:-translate-y-0.5 hover:bg-[#056c76] sm:w-auto"
                style={{ color: "#ffffff" }}
              >
                Get Started
              </ActionAnchor>
              <a
                href="#site-footer"
                className="inline-flex min-h-14 w-full max-w-[21.75rem] items-center justify-center rounded-lg border border-[#b9e0e5] bg-white px-7 py-4 text-base font-bold text-[#047b85] shadow-[0_12px_26px_rgba(4,123,133,0.06)] transition hover:-translate-y-0.5 hover:bg-[#eef9fb] sm:w-auto"
              >
                Talk to Us
              </a>
            </div>
            <HeroProofStrip />
          </div>
        </Reveal>

        <Reveal className="min-w-0" delay={0.14}>
          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            style={{ y: visualY, scale: visualScale }}
            className="hero-visual-frame relative min-h-[18rem] min-w-0 overflow-hidden sm:-mx-8 sm:min-h-[25rem] lg:-ml-4 lg:mr-[-1rem] lg:-mt-10 lg:min-h-[31rem]"
          >
            <MotionImg
              src={heroLogisticsVisual}
              alt="Global courier network with air and road logistics"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="h-full min-h-[18rem] w-full max-w-full object-contain object-center sm:min-h-[25rem] lg:min-h-[31rem]"
            />
            <HeroRouteOverlay />
          </MotionDiv>
        </Reveal>
      </div>
    </section>
  );
}

function CourierPartnerLogo({ partner }) {
  const darkText = partner.bg === "#ffffff";

  return (
    <span
      className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-[0_10px_24px_rgba(0,33,39,0.18)]"
      aria-hidden="true"
    >
      <svg className="h-full w-full" viewBox="0 0 48 48" role="img" aria-label={`${partner.name} mark`}>
        <rect x="5" y="5" width="38" height="38" rx="9" fill={partner.bg} />
        <path d="M8 33 33 8h10v10L18 43H8V33Z" fill={partner.accent} opacity="0.96" />
        <circle cx="35.5" cy="12.5" r="3.5" fill={darkText ? "#047b85" : "#ffffff"} opacity="0.92" />
        <text
          x="24"
          y="29"
          textAnchor="middle"
          fontFamily="Inter, Arial, sans-serif"
          fontSize={partner.mark.length > 1 ? 13 : 18}
          fontWeight="900"
          letterSpacing={partner.mark.length > 1 ? 0.4 : 0}
          fill={darkText ? "#047b85" : "#ffffff"}
        >
          {partner.mark}
        </text>
      </svg>
    </span>
  );
}

function PlatformsSection() {
  return (
    <section className="section-transition relative overflow-hidden bg-[#047b85] pb-9 pt-[3.45rem] text-white sm:pb-10">
      <div className="pointer-events-none absolute -top-[4.8rem] left-1/2 h-[7.8rem] w-full -translate-x-1/2 rounded-b-[50%] bg-[#fbfefe] sm:w-[112%]" />
      <div className="relative mx-auto max-w-[1240px] px-5 sm:px-8">
        <MotionDiv
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="mx-auto max-w-[18rem] text-center text-[0.76rem] font-bold uppercase leading-6 tracking-[0.18em] text-white/82 sm:max-w-none sm:text-[0.78rem] sm:tracking-[0.46em]">
            Trusted Courier Partners Across India
          </p>
        </MotionDiv>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6 lg:gap-8">
          {courierPartners.map((partner, index) => (
            <MotionArticle
              key={partner.name}
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -10, scale: 1.05 }}
              className="group flex min-h-[4.25rem] cursor-pointer items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 shadow-[0_18px_30px_rgba(0,44,50,0.14)] backdrop-blur-sm transition-colors hover:bg-white/[0.12]"
            >
              <CourierPartnerLogo partner={partner} />
              <span className="text-sm font-extrabold tracking-wide text-white sm:text-base">
                {partner.name}
              </span>
            </MotionArticle>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatherMark({ compact = false }) {
  return (
    <div
      className={`grid ${compact ? "h-16 w-16" : "h-[5.6rem] w-[5.6rem]"} grid-cols-2 grid-rows-2 gap-1 rounded-xl border border-[#dceef2] bg-white p-3 shadow-[0_14px_34px_rgba(4,62,69,0.08)]`}
      aria-hidden="true"
    >
      <div className="grid place-items-center bg-[#047b85] text-sm font-bold text-white">F</div>
      <div className="bg-[#ff821c]" />
      <div className="bg-[#ff821c]" />
      <div className="grid place-items-center bg-[#047b85] text-sm font-bold text-white">G</div>
    </div>
  );
}

function ConnectorDot({ className = "" }) {
  return (
    <span
      className={`absolute left-1/2 -bottom-[0.62rem] z-20 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full bg-[#047b85] text-white shadow-[0_6px_14px_rgba(4,123,133,0.2)] ${className}`}
      aria-hidden="true"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
    </span>
  );
}

function WhyChooseSection() {
  return (
    <section className="section-transition bg-[#047b85]">
      <div className="mx-auto max-w-[1518px] rounded-t-[5.5rem] bg-[#f1fbff] px-5 pb-9 pt-11 sm:px-8 sm:pb-12 sm:pt-12 lg:px-24">
        <div className="grid gap-10 lg:grid-cols-[0.34fr_0.66fr] lg:items-start">
          <Reveal>
            <div className="max-w-[28rem]">
              <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#f47d21]">
                Why Choose Feather Global?
              </p>
              <h2 className="mt-4 font-display text-[1.72rem] font-extrabold leading-[1.24] text-[#071923] sm:text-[2.15rem] lg:text-[2.1rem]">
                Everything You Need,
                <br />
                In One Powerful Platform
              </h2>
              <p className="mt-5 text-base leading-[1.62] text-[#17242d] sm:text-[1rem]">
                Feather Global simplifies shipping so you can focus on growing your business.
                One integration. Endless possibilities.
              </p>
              <ActionAnchor
                href={AUTH_APP_URL}
                className="mt-6 inline-flex min-h-12 items-center justify-center gap-5 rounded-lg bg-[#047b85] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(4,123,133,0.18)] transition hover:-translate-y-0.5 hover:bg-[#056c76] sm:min-w-[12.4rem]"
                style={{ color: "#ffffff" }}
              >
                <span>Get Started Today</span>
                <Icon name="chevronRight" className="h-5 w-5" />
              </ActionAnchor>
            </div>
          </Reveal>

          <div className="relative pb-16 lg:pb-[5.55rem]">
            <svg
              className="pointer-events-none absolute bottom-5 left-[7%] right-[7%] z-0 hidden h-[5.6rem] w-[86%] overflow-visible lg:block"
              viewBox="0 0 880 110"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M92 8 C135 76 240 78 313 58"
                stroke="#047b85"
                strokeDasharray="5 7"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
              <path
                d="M313 58 L302 52 M313 58 L303 65"
                stroke="#047b85"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
              <path
                d="M526 58 C602 80 692 72 748 8"
                stroke="#047b85"
                strokeDasharray="5 7"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
              <path
                d="M526 58 L537 52 M526 58 L536 65"
                stroke="#047b85"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
              <path
                d="M748 8 C790 82 842 72 866 8"
                stroke="#047b85"
                strokeDasharray="5 7"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>

            <div className="relative z-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {whyChooseCards.map((card, index) => {
                const isOrange = card.tone === "orange";

                return (
                  <MotionArticle
                    key={card.title}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.52, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -8, scale: 1.02 }}
                    className="relative h-[15rem] rounded-lg border border-[#e9f3f5] bg-white px-4 pb-7 pt-6 text-center shadow-[0_14px_34px_rgba(7,25,35,0.05)]"
                  >
                    <div
                      className={`mx-auto grid h-16 w-16 place-items-center rounded-full text-white shadow-[0_10px_22px_rgba(4,82,89,0.16)] ${
                        isOrange ? "bg-[#ff821c]" : "bg-[#047b85]"
                      }`}
                    >
                      <Icon name={card.icon} className="h-7 w-7" />
                    </div>
                    <h3 className="mt-5 text-[1rem] font-extrabold leading-tight text-[#101820] sm:whitespace-nowrap">
                      {card.title}
                    </h3>
                    <p className="mx-auto mt-3 max-w-[12.5rem] text-[0.82rem] leading-[1.5] text-[#33414b]">
                      {card.description}
                    </p>
                    {index !== 1 ? <ConnectorDot /> : null}
                  </MotionArticle>
                );
              })}
            </div>

            <MotionDiv
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.52, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-0 left-1/2 z-10 hidden -translate-x-1/2 lg:block"
            >
              <FeatherMark />
            </MotionDiv>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureMapBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-[14rem] overflow-hidden md:block" aria-hidden="true">
      <div className="absolute left-0 top-8 hidden h-28 w-[29rem] opacity-35 [clip-path:polygon(0_24%,18%_8%,45%_20%,62%_4%,92%_24%,86%_62%,66%_70%,54%_58%,34%_76%,13%_62%)] [background-image:radial-gradient(circle,#80c5ce_1.35px,transparent_1.6px)] [background-size:8px_8px] md:block" />
      <div className="absolute right-2 top-8 hidden h-28 w-[29rem] opacity-35 [clip-path:polygon(4%_28%,25%_10%,44%_22%,64%_8%,96%_30%,86%_68%,62%_60%,47%_78%,25%_66%,10%_76%)] [background-image:radial-gradient(circle,#80c5ce_1.35px,transparent_1.6px)] [background-size:8px_8px] md:block" />
      <svg className="absolute left-[13%] top-[4.8rem] hidden h-28 w-80 text-[#047b85] opacity-60 md:block" viewBox="0 0 320 112" fill="none">
        <path d="M34 40 C90 104 162 18 262 62" stroke="currentColor" strokeDasharray="4 7" strokeWidth="1.5" />
        <path d="M34 30v30" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
        <circle cx="34" cy="30" r="11" fill="#047b85" />
        <circle cx="34" cy="30" r="4" fill="white" />
      </svg>
      <svg className="absolute right-[7%] top-[5rem] hidden h-28 w-80 text-[#ff821c] opacity-70 md:block" viewBox="0 0 320 112" fill="none">
        <path d="M54 64 C126 112 226 92 278 30" stroke="#047b85" strokeDasharray="4 7" strokeWidth="1.5" />
        <path d="M278 21v30" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
        <circle cx="278" cy="21" r="11" fill="#ff821c" />
        <circle cx="278" cy="21" r="4" fill="white" />
      </svg>
    </div>
  );
}

function getDonutGradient(status) {
  let current = 0;
  const slices = status.map((item) => {
    const value = Number.parseFloat(item.value) || 0;
    const start = current;
    current += value;
    return `${item.color} ${start}% ${current}%`;
  });

  return `conic-gradient(${slices.join(", ")})`;
}

function FeatureTrendChart({ feature }) {
  return (
    <div className="rounded-xl border border-[#e7f0f2] bg-white px-4 pb-3 pt-4">
      <p className="text-[0.76rem] font-bold text-[#071923]">Shipment Activity</p>
      <div className="mt-3 grid grid-cols-[2.1rem_1fr] gap-2">
        <div className="grid h-36 grid-rows-4 text-right text-[0.64rem] leading-none text-[#5e6b75]">
          <span>1,000</span>
          <span>750</span>
          <span>500</span>
          <span>250</span>
        </div>
        <div>
          <svg className="h-36 w-full overflow-visible" viewBox="0 0 500 160" fill="none" aria-hidden="true">
            {[28, 62, 96, 130].map((y) => (
              <path key={y} d={`M0 ${y}H500`} stroke="#dfe8eb" strokeWidth="1" />
            ))}
            <path d={feature.lineB} stroke="#ff821c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <path d={feature.lineA} stroke="#047b85" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {feature.lineA
              .match(/\d+ \d+/g)
              ?.map((point) => {
                const [cx, cy] = point.split(" ");
                return <circle key={`${feature.title}-${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="#047b85" stroke="white" strokeWidth="2" />;
              })}
            {feature.lineB
              .match(/\d+ \d+/g)
              ?.map((point) => {
                const [cx, cy] = point.split(" ");
                return <circle key={`${feature.title}-orange-${cx}-${cy}`} cx={cx} cy={cy} r="3.8" fill="#ff821c" stroke="white" strokeWidth="2" />;
              })}
          </svg>
          <div className="grid grid-cols-7 text-center text-[0.64rem] text-[#5e6b75]">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureStatusDonut({ feature }) {
  return (
    <div className="rounded-xl border border-[#e7f0f2] bg-white p-4">
      <p className="text-[0.76rem] font-bold text-[#071923]">Shipments by Status</p>
      <div className="mt-5 grid grid-cols-[6.5rem_1fr] items-center gap-4">
        <div
          className="relative h-[6.5rem] w-[6.5rem] rounded-full"
          style={{ background: getDonutGradient(feature.status) }}
          aria-hidden="true"
        >
          <div className="absolute inset-[1.55rem] rounded-full bg-white" />
        </div>
        <div className="grid gap-2.5">
          {feature.status.map((item) => (
            <div key={item.label} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[0.68rem] text-[#33414b]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
              <span className="font-semibold">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureDashboardPreview({ feature }) {
  return (
    <MotionDiv
      key={feature.title}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="h-full rounded-xl border border-[#e8f2f4] bg-white p-4 shadow-[0_16px_42px_rgba(7,25,35,0.04)] sm:p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {feature.metrics.map((metric) => {
          const isOrange = metric.tone === "orange";

          return (
            <div key={metric.label} className="rounded-xl border border-[#e7f0f2] bg-white px-4 py-4 shadow-[0_8px_22px_rgba(7,25,35,0.025)]">
              <div className="flex items-center gap-3">
                <span className={`grid h-10 w-10 place-items-center rounded-lg ${isOrange ? "bg-[#fff0e5] text-[#ef6f1a]" : "bg-[#e8f7f9] text-[#047b85]"}`}>
                  <Icon name={metric.icon} className="h-5 w-5" />
                </span>
                <span className="text-[0.68rem] font-medium text-[#57636d]">{metric.label}</span>
              </div>
              <p className="mt-3 text-xl font-extrabold text-[#071923]">{metric.value}</p>
              <p className={`mt-1 text-[0.68rem] font-bold ${metric.change.startsWith("-") ? "text-[#e45043]" : "text-[#047b85]"}`}>
                {metric.change}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.42fr_0.8fr]">
        <FeatureTrendChart feature={feature} />
        <FeatureStatusDonut feature={feature} />
      </div>

      <a
        href={AUTH_APP_URL}
        className="mt-5 inline-flex w-full items-center justify-end gap-3 text-sm font-semibold text-[#047b85] transition hover:text-[#035f67]"
      >
        <span>View Dashboard</span>
        <Icon name="chevronRight" className="h-5 w-5" />
      </a>
    </MotionDiv>
  );
}

function FeaturesShowcaseSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeFeature = featureShowcaseItems[activeIndex];

  return (
    <section className="section-transition bg-[#047b85] pt-0">
      <div className="relative mx-auto max-w-[1518px] overflow-hidden rounded-t-[4.6rem] bg-[#f3fbff] px-5 pb-10 pt-10 sm:px-8 sm:pb-12 sm:pt-12 lg:px-16">
        <FeatureMapBackdrop />

        <Reveal className="relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#f47d21]">
              Features
            </p>
            <h2 className="mt-4 font-display text-[2rem] font-extrabold leading-[1.18] text-[#071923] sm:text-[2.8rem]">
              Powerful Features.
              <br />
              Built for <span className="text-[#047b85]">Global Shipping.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm font-medium leading-[1.75] text-[#17242d] sm:text-base">
              Everything you need to ship smarter, scale faster, and deliver an exceptional
              customer experience.
            </p>
          </div>
        </Reveal>

        <div className="relative z-10 mt-8 grid gap-4 lg:grid-cols-[0.28fr_0.29fr_0.43fr] xl:gap-5">
          <Reveal>
            <div className="overflow-hidden rounded-xl border border-[#e5f1f3] bg-white shadow-[0_16px_40px_rgba(7,25,35,0.04)]">
              {featureShowcaseItems.map((item, index) => {
                const isActive = index === activeIndex;

                return (
                  <MotionButton
                    key={item.title}
                    type="button"
                    whileHover={{ x: isActive ? 0 : 4 }}
                    transition={{ duration: 0.2 }}
                    className={`grid w-full grid-cols-[3.8rem_1fr_auto] items-center gap-3 border-b border-[#e8f2f4] px-4 py-4 text-left last:border-b-0 ${
                      isActive ? "border-l-[0.45rem] border-l-[#047b85] bg-[#eaf8fb]" : "border-l-[0.45rem] border-l-transparent bg-white hover:bg-[#f6fcfe]"
                    }`}
                    onClick={() => setActiveIndex(index)}
                    aria-pressed={isActive}
                  >
                    <span className={`grid h-[3.25rem] w-[3.25rem] place-items-center rounded-xl ${isActive ? "bg-[#047b85] text-white" : "bg-[#ecfbff] text-[#047b85]"}`}>
                      <Icon name={item.icon} className="h-6 w-6" />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-extrabold ${isActive ? "text-[#047b85]" : "text-[#071923]"}`}>
                        {item.title}
                      </span>
                      <span className="mt-1 block text-[0.8rem] leading-[1.5] text-[#33414b]">
                        {item.tabDescription}
                      </span>
                    </span>
                    <Icon name="chevronRight" className={`h-5 w-5 ${isActive ? "text-[#047b85]" : "text-[#80909a]"}`} />
                  </MotionButton>
                );
              })}
            </div>
          </Reveal>

          <div className="min-w-0">
            <AnimatePresence mode="wait">
              <MotionArticle
                key={activeFeature.title}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="h-full rounded-xl border border-[#e5f1f3] bg-white px-6 py-8 shadow-[0_16px_40px_rgba(7,25,35,0.04)] sm:px-8"
              >
                <div className="flex items-center gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-lg bg-[#047b85] text-lg font-extrabold text-white">
                    {activeFeature.number}
                  </span>
                  <h3 className="font-display text-[1.32rem] font-extrabold leading-tight text-[#071923]">
                    {activeFeature.title}
                  </h3>
                </div>
                <p className="mt-7 text-sm leading-[1.7] text-[#25313a]">
                  {activeFeature.description}
                </p>

                <ul className="mt-8 grid gap-5">
                  {activeFeature.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-[0.86rem] leading-[1.55] text-[#17242d]">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#047b85] text-white">
                        <Icon name="checkCircle" className="h-3.5 w-3.5" />
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>

                <ActionAnchor
                  href={AUTH_APP_URL}
                  className="mt-9 inline-flex min-h-11 items-center justify-center gap-4 rounded-lg bg-[#047b85] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(4,123,133,0.16)] transition hover:-translate-y-0.5 hover:bg-[#056c76]"
                  style={{ color: "#ffffff" }}
                >
                  <span>Get Started</span>
                  <Icon name="chevronRight" className="h-5 w-5" />
                </ActionAnchor>
              </MotionArticle>
            </AnimatePresence>
          </div>

          <div className="min-w-0">
            <AnimatePresence mode="wait">
              <FeatureDashboardPreview feature={activeFeature} />
            </AnimatePresence>
          </div>
        </div>

        <Reveal className="relative z-10" delay={0.08}>
          <div className="mt-8 grid overflow-hidden rounded-xl border border-[#dfeff2] bg-[#edf9fc] shadow-[0_16px_42px_rgba(7,25,35,0.04)] sm:grid-cols-2 lg:grid-cols-4">
            {featureSupportItems.map((item, index) => {
              const mobileBorder = index < featureSupportItems.length - 1 ? "border-b" : "";
              const tabletBorder = [
                index % 2 === 0 ? "sm:border-r" : "sm:border-r-0",
                index < 2 ? "sm:border-b" : "sm:border-b-0",
              ].join(" ");
              const desktopBorder = index < featureSupportItems.length - 1 ? "lg:border-r lg:border-b-0" : "lg:border-r-0 lg:border-b-0";

              return (
              <div
                key={item.title}
                className={`flex items-center gap-5 border-[#d5e6ea] px-6 py-5 ${mobileBorder} ${tabletBorder} ${desktopBorder}`}
              >
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#e4f7fb] text-[#047b85]">
                  <Icon name={item.icon} className="h-9 w-9" />
                </span>
                <span>
                  <span className="block text-sm font-extrabold text-[#071923]">{item.title}</span>
                  <span className="mt-2 block text-[0.82rem] leading-[1.55] text-[#33414b]">
                    {item.description}
                  </span>
                </span>
              </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TestimonialMapBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-[18rem] overflow-hidden md:block" aria-hidden="true">
      <div className="absolute left-12 top-10 h-44 w-[31rem] opacity-30 [clip-path:polygon(0_18%,18%_6%,38%_14%,55%_4%,82%_16%,100%_34%,88%_62%,70%_58%,54%_76%,34%_66%,18%_82%,4%_58%)] [background-image:radial-gradient(circle,#80c5ce_1.35px,transparent_1.6px)] [background-size:8px_8px]" />
      <div className="absolute right-10 top-10 h-44 w-[32rem] opacity-30 [clip-path:polygon(4%_20%,28%_8%,44%_16%,62%_6%,90%_18%,100%_42%,86%_72%,64%_62%,48%_78%,26%_66%,8%_74%)] [background-image:radial-gradient(circle,#80c5ce_1.35px,transparent_1.6px)] [background-size:8px_8px]" />
      <svg className="absolute left-[8%] top-[7.5rem] h-36 w-[24rem] text-[#047b85] opacity-55" viewBox="0 0 380 144" fill="none">
        <path d="M48 118 C12 64 88 34 124 82 C158 126 222 24 320 58" stroke="currentColor" strokeDasharray="4 7" strokeWidth="1.5" />
        <path d="M124 56v35" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <circle cx="124" cy="56" r="12" fill="#047b85" />
        <circle cx="124" cy="56" r="4" fill="white" />
      </svg>
      <svg className="absolute right-[7%] top-[7.5rem] h-36 w-[24rem] text-[#ff821c] opacity-65" viewBox="0 0 380 144" fill="none">
        <path d="M42 90 C96 118 168 122 228 78 C266 50 306 74 332 110" stroke="#047b85" strokeDasharray="4 7" strokeWidth="1.5" />
        <path d="M306 54v35" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <circle cx="306" cy="54" r="12" fill="#ff821c" />
        <circle cx="306" cy="54" r="4" fill="white" />
      </svg>
    </div>
  );
}

function TestimonialCard({ testimonial, index }) {
  return (
    <MotionArticle
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: "easeOut" }}
      className="flex min-h-[23.5rem] flex-col overflow-hidden rounded-xl border border-[#e6f1f3] bg-white shadow-[0_20px_50px_rgba(7,25,35,0.06)]"
    >
      <div className="flex flex-1 flex-col px-6 pb-5 pt-6 sm:px-7">
        <span className="text-[3.1rem] font-extrabold leading-none text-[#047b85]">"</span>
        <p className="mt-3 min-h-[8.6rem] text-[0.96rem] font-medium leading-[1.7] text-[#071923]">
          {testimonial.quote}
        </p>

        <div className="mt-5 flex gap-1 text-[#ff821c]" aria-label="5 star rating">
          {Array.from({ length: 5 }).map((_, starIndex) => (
            <Icon key={starIndex} name="star" className="h-4 w-4 fill-current" />
          ))}
        </div>

        <div className="mt-6 flex items-center gap-4">
          <img
            src={testimonial.avatar}
            alt={testimonial.name}
            loading="lazy"
            decoding="async"
            className="h-12 w-12 rounded-full object-cover shadow-[0_8px_20px_rgba(7,25,35,0.12)]"
          />
          <div>
            <h3 className="text-sm font-extrabold text-[#071923]">{testimonial.name}</h3>
            <p className="mt-1 text-xs font-medium text-[#6a7780]">{testimonial.role}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-[#eaf2f4] bg-[#f7fbfd] px-6 py-4 text-[#047b85] sm:px-7">
        <Icon name={testimonial.brandIcon} className="h-6 w-6" />
        <span className="text-sm font-extrabold">{testimonial.brand}</span>
      </div>
    </MotionArticle>
  );
}

function TestimonialsSection() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % testimonialSlides.length);
    }, 10000);

    return () => window.clearInterval(timer);
  }, []);

  const goToSlide = (direction) => {
    setActiveSlide((current) => {
      if (direction === "previous") {
        return (current - 1 + testimonialSlides.length) % testimonialSlides.length;
      }

      return (current + 1) % testimonialSlides.length;
    });
  };

  return (
    <section className="section-transition bg-[#047b85]">
      <div className="relative mx-auto max-w-[1518px] overflow-hidden rounded-t-[4.6rem] bg-[#f3fbff] px-5 pb-10 pt-12 sm:px-8 sm:pb-12 sm:pt-14 lg:px-16">
        <TestimonialMapBackdrop />

        <Reveal className="relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#f47d21]">
              Testimonials
            </p>
            <h2 className="mt-4 font-display text-[2rem] font-extrabold leading-[1.18] text-[#071923] sm:text-[2.8rem]">
              Trusted by Businesses
              <br />
              <span className="text-[#047b85]">Worldwide.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm font-medium leading-[1.75] text-[#17242d] sm:text-base">
              See how businesses of all sizes are simplifying shipping, saving time, and growing
              with Feather Global.
            </p>
          </div>
        </Reveal>

        <div className="relative z-10 mt-8">
          <button
            type="button"
            aria-label="Previous testimonials"
            onClick={() => goToSlide("previous")}
            className="absolute left-2 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#047b85] shadow-[0_18px_34px_rgba(7,25,35,0.08)] transition hover:-translate-x-0.5 hover:bg-[#f7fcfd] lg:flex"
          >
            <Icon name="chevronLeft" className="h-6 w-6" />
          </button>

          <div className="mx-auto max-w-[1050px] lg:px-8">
            <AnimatePresence mode="wait">
              <MotionDiv
                key={activeSlide}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.38, ease: "easeOut" }}
                className="grid gap-6 md:grid-cols-3"
              >
                {testimonialSlides[activeSlide].map((testimonial, index) => (
                  <TestimonialCard key={testimonial.name} testimonial={testimonial} index={index} />
                ))}
              </MotionDiv>
            </AnimatePresence>
          </div>

          <button
            type="button"
            aria-label="Next testimonials"
            onClick={() => goToSlide("next")}
            className="absolute right-2 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#047b85] shadow-[0_18px_34px_rgba(7,25,35,0.08)] transition hover:translate-x-0.5 hover:bg-[#f7fcfd] lg:flex"
          >
            <Icon name="chevronRight" className="h-6 w-6" />
          </button>

          <div className="mt-8 flex items-center justify-center gap-4 lg:hidden">
            <button
              type="button"
              aria-label="Previous testimonials"
              onClick={() => goToSlide("previous")}
              className="grid h-11 w-11 place-items-center rounded-full bg-white text-[#047b85] shadow-[0_14px_26px_rgba(7,25,35,0.08)]"
            >
              <Icon name="chevronLeft" className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next testimonials"
              onClick={() => goToSlide("next")}
              className="grid h-11 w-11 place-items-center rounded-full bg-white text-[#047b85] shadow-[0_14px_26px_rgba(7,25,35,0.08)]"
            >
              <Icon name="chevronRight" className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-8 flex items-center justify-center gap-3">
            {testimonialSlides.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Show testimonial set ${index + 1}`}
                onClick={() => setActiveSlide(index)}
                className={`h-3 w-3 rounded-full transition ${
                  index === activeSlide ? "bg-[#047b85]" : "bg-[#d8e7eb] hover:bg-[#b7d5dc]"
                }`}
              />
            ))}
          </div>
        </div>

        <Reveal className="relative z-10" delay={0.1}>
          <div className="mx-auto mt-10 grid max-w-[1260px] overflow-hidden rounded-xl border border-[#dfeff2] bg-white/70 shadow-[0_16px_42px_rgba(7,25,35,0.04)] sm:grid-cols-2 lg:grid-cols-4">
            {testimonialStats.map((stat, index) => {
              const mobileBorder = index < testimonialStats.length - 1 ? "border-b" : "";
              const tabletBorder = [
                index % 2 === 0 ? "sm:border-r" : "sm:border-r-0",
                index < 2 ? "sm:border-b" : "sm:border-b-0",
              ].join(" ");
              const desktopBorder = index < testimonialStats.length - 1 ? "lg:border-r lg:border-b-0" : "lg:border-r-0 lg:border-b-0";

              return (
                <div
                  key={stat.label}
                  className={`flex items-center gap-6 border-[#d5e6ea] px-7 py-7 ${mobileBorder} ${tabletBorder} ${desktopBorder}`}
                >
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#e4f7fb] text-[#047b85]">
                    <Icon name={stat.icon} className="h-9 w-9" />
                  </span>
                  <span>
                    <span className="block text-[1.75rem] font-extrabold leading-tight text-[#047b85]">
                      {stat.value}
                    </span>
                    <span className="mt-2 block text-[0.82rem] leading-[1.55] text-[#33414b]">
                      {stat.label}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function WhatYouGetSection() {
  return (
    <AlignedPanelSection sectionNumber="07">
      <div className="grid gap-10 xl:grid-cols-[0.36fr_0.64fr] xl:items-start">
        <Reveal>
          <div className="relative z-10">
            <AlignedSectionHeading
              eyebrow="What You Get"
              title="Everything you need to streamline your shipping operations in one powerful platform."
              description="The platform is designed to keep operations simple, connected, and easier to scale as order volume grows."
            />
            <ActionAnchor href={`mailto:${companyProfile.email}`} className={`${primaryButtonClass} mt-8`}>
              Get Started
            </ActionAnchor>
          </div>
        </Reveal>

        <div className="grid gap-5 md:grid-cols-2">
          {valueCards.map((item, index) => (
            <Reveal key={item.title} delay={0.05 * index}>
              <MotionArticle
                whileHover={{ y: -6, scale: 1.01 }}
                transition={{ duration: 0.25 }}
                className={`h-full rounded-xl border border-[#e5f1f3] p-5 shadow-[0_16px_40px_rgba(7,25,35,0.04)] sm:p-7 ${item.shell} ${
                  index === valueCards.length - 1 ? "md:col-span-2" : ""
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-[#047b85] shadow-sm">
                    <Icon name={item.icon} />
                  </span>
                  <div>
                    <h3 className="font-display text-[1.35rem] font-extrabold leading-tight text-[#071923]">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-[#33414b]">{item.description}</p>
                  </div>
                </div>
              </MotionArticle>
            </Reveal>
          ))}
      </div>
      </div>
    </AlignedPanelSection>
  );
}

function FaqRouteMap() {
  return (
    <div className="relative mt-9 h-40 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-x-0 top-4 h-32 opacity-30 [clip-path:polygon(0_20%,16%_8%,34%_22%,48%_4%,70%_16%,98%_25%,92%_72%,70%_62%,52%_78%,33%_68%,15%_82%,4%_62%)] [background-image:radial-gradient(circle,#80c5ce_1.35px,transparent_1.6px)] [background-size:8px_8px]" />
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 440 180" fill="none">
        <path
          d="M124 88 C156 138 210 134 252 108 C294 82 338 76 382 84"
          stroke="#047b85"
          strokeDasharray="5 8"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
        <path d="M124 78v34" stroke="#047b85" strokeLinecap="round" strokeWidth="8" />
        <circle cx="124" cy="78" r="13" fill="#047b85" />
        <circle cx="124" cy="78" r="4" fill="white" />
        <path d="M382 72v36" stroke="#ff821c" strokeLinecap="round" strokeWidth="8" />
        <circle cx="382" cy="72" r="13" fill="#ff821c" />
        <circle cx="382" cy="72" r="4" fill="white" />
      </svg>
    </div>
  );
}

function FaqSupportIllustration() {
  return (
    <div className="relative h-36 w-40 shrink-0" aria-hidden="true">
      <div className="absolute left-7 top-1 h-20 w-20 rounded-full bg-[#f6c6a9]" />
      <div className="absolute left-5 top-0 h-24 w-24 rounded-full bg-[#123847] [clip-path:polygon(12%_18%,70%_0,96%_36%,88%_100%,12%_100%,0_42%)]" />
      <div className="absolute left-9 top-5 h-16 w-14 rounded-[45%] bg-[#ffd4b8]" />
      <div className="absolute left-14 top-10 h-1.5 w-1.5 rounded-full bg-[#16323c]" />
      <div className="absolute left-[4.4rem] top-10 h-1.5 w-1.5 rounded-full bg-[#16323c]" />
      <div className="absolute left-[3.55rem] top-[3.35rem] h-4 w-8 rounded-b-full border-b-2 border-[#9d5f4a]" />
      <div className="absolute left-3 top-9 h-10 w-6 rounded-full border-4 border-[#047b85] bg-white" />
      <div className="absolute left-[5.9rem] top-9 h-10 w-6 rounded-full border-4 border-[#047b85] bg-white" />
      <div className="absolute left-[5.4rem] top-[4.2rem] h-1.5 w-7 rounded-full bg-[#047b85]" />
      <div className="absolute bottom-2 left-2 h-20 w-28 rounded-t-[3rem] bg-[#047b85]" />
      <div className="absolute bottom-0 left-10 h-14 w-28 rounded-lg bg-[#d9f2f6] shadow-[0_8px_18px_rgba(7,25,35,0.08)]">
        <span className="absolute left-12 top-5 text-xs font-bold text-[#047b85]">FG</span>
      </div>
      <div className="absolute right-0 top-6 rounded-2xl bg-[#047b85] px-3 py-2 text-white shadow-sm">
        <span className="block h-1.5 w-6 rounded-full bg-white" />
        <span className="mt-1.5 block h-1.5 w-4 rounded-full bg-white/70" />
      </div>
      <div className="absolute right-3 top-[4.9rem] rounded-2xl bg-[#e8f7f9] px-3 py-2">
        <span className="block h-1.5 w-5 rounded-full bg-[#b5dce3]" />
        <span className="mt-1.5 block h-1.5 w-3 rounded-full bg-[#cfe9ee]" />
      </div>
    </div>
  );
}

function FaqPackageIllustration() {
  return (
    <div className="relative hidden h-24 w-28 shrink-0 sm:block" aria-hidden="true">
      <div className="absolute right-3 top-0 h-20 w-20 rounded-full border-2 border-[#047b85] bg-[#cdeef4]" />
      <svg className="absolute right-4 top-1 h-[4.8rem] w-[4.8rem]" viewBox="0 0 92 92" fill="none">
        <circle cx="46" cy="46" r="41" fill="#cdeef4" stroke="#047b85" strokeWidth="2" />
        <path d="M18 44h56M46 7c14 15 14 62 0 78M46 7c-14 15-14 62 0 78" stroke="#72b9c4" strokeWidth="2" />
        <path d="M26 20c12 8 28 8 40 0M26 72c12-8 28-8 40 0" stroke="#72b9c4" strokeWidth="2" />
      </svg>
      <div className="absolute bottom-1 left-5 h-9 w-9 rounded-sm bg-[#d99658] shadow-sm" />
      <div className="absolute bottom-1 left-14 h-10 w-10 rounded-sm bg-[#c98747] shadow-sm" />
      <div className="absolute bottom-8 left-10 h-9 w-9 rounded-sm bg-[#e5aa6c] shadow-sm" />
      <div className="absolute left-8 top-6 h-5 w-4 rounded-full border-2 border-[#ff821c]" />
      <div className="absolute left-10 top-10 h-4 w-1 rounded-full bg-[#ff821c]" />
      <div className="absolute right-0 top-7 h-5 w-4 rounded-full border-2 border-[#ff821c]" />
      <div className="absolute right-1 top-11 h-4 w-1 rounded-full bg-[#ff821c]" />
    </div>
  );
}

function FaqAccordionItem({ item, index, activeIndex, setActiveIndex }) {
  const isOpen = activeIndex === index;

  return (
    <div
      className="border-b border-[#e6eef1] last:border-b-0"
      onMouseEnter={() => setActiveIndex(index)}
      onFocus={() => setActiveIndex(index)}
    >
      <button
        type="button"
        className="grid w-full grid-cols-[2.1rem_1fr_auto] items-center gap-4 px-5 py-5 text-left sm:grid-cols-[2.3rem_1fr_auto] sm:px-8"
        onClick={() => setActiveIndex(isOpen ? null : index)}
        aria-expanded={isOpen}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#047b85] text-white shadow-[0_8px_18px_rgba(4,123,133,0.16)]">
          <Icon name={isOpen ? "minus" : "plus"} className="h-4 w-4" />
        </span>
        <span className="text-[0.98rem] font-extrabold text-[#071923] sm:text-[1.05rem]">
          {item.question}
        </span>
        <Icon name="chevronDown" className={`h-5 w-5 text-[#047b85] transition ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <MotionDiv
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-5 px-5 pb-8 pl-[4.55rem] pr-5 sm:grid-cols-[1fr_auto] sm:px-8 sm:pl-[5.55rem]">
              <p className="max-w-[43rem] text-sm font-medium leading-[1.75] text-[#17242d]">
                {item.answer}
              </p>
              {index === 0 ? <FaqPackageIllustration /> : null}
            </div>
          </MotionDiv>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FaqSection() {
  const [activeFaq, setActiveFaq] = useState(0);

  return (
    <section className="section-transition bg-[#047b85]">
      <div className="relative mx-auto max-w-[1518px] overflow-hidden rounded-t-[4.6rem] bg-[#f3fbff] px-5 pb-10 pt-12 sm:px-8 sm:pb-12 sm:pt-14 lg:px-16">
        <div className="grid gap-10 lg:grid-cols-[0.35fr_0.65fr] lg:items-start">
          <Reveal>
            <div className="relative z-10">
              <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#f47d21]">
                FAQ
              </p>
              <h2 className="mt-4 font-display text-[2rem] font-extrabold leading-[1.16] text-[#071923] sm:text-[2.55rem]">
                Frequently Asked
                <br />
                <span className="text-[#047b85]">Questions.</span>
              </h2>
              <p className="mt-5 max-w-[25rem] text-sm font-medium leading-[1.75] text-[#17242d] sm:text-base">
                Everything you need to know about Feather Global and how it can simplify your
                shipping operations.
              </p>

              <FaqRouteMap />

              <div className="mt-7 rounded-xl border border-[#e6f1f3] bg-white p-5 shadow-[0_18px_50px_rgba(7,25,35,0.05)] sm:p-6">
                <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
                  <FaqSupportIllustration />
                  <div>
                    <h3 className="text-[1.12rem] font-extrabold leading-tight text-[#071923]">
                      Still have questions?
                      <br />
                      <span className="text-[#047b85]">We're here to help!</span>
                    </h3>
                    <p className="mt-4 text-sm font-medium leading-[1.7] text-[#17242d]">
                      Our support team is ready to assist you with anything you need.
                    </p>
                    <a
                      href={`mailto:${companyProfile.email}`}
                      className="mt-6 inline-flex min-h-11 items-center justify-center gap-3 rounded-lg bg-[#047b85] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(4,123,133,0.16)] transition hover:-translate-y-0.5 hover:bg-[#056c76]"
                      style={{ color: "#ffffff" }}
                    >
                      <span>Contact Support</span>
                      <Icon name="chevronRight" className="h-5 w-5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div
              className="overflow-hidden rounded-xl border border-[#e6f1f3] bg-white shadow-[0_20px_56px_rgba(7,25,35,0.05)]"
              onMouseLeave={() => setActiveFaq(0)}
            >
              {faqItems.map((item, index) => (
                <FaqAccordionItem
                  key={item.question}
                  item={item}
                  index={index}
                  activeIndex={activeFaq}
                  setActiveIndex={setActiveFaq}
                />
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.12}>
          <div className="mt-10 grid overflow-hidden rounded-xl border border-[#dfeff2] bg-[#f5fcfe] shadow-[0_16px_42px_rgba(7,25,35,0.04)] lg:grid-cols-[1.25fr_0.8fr_0.8fr_0.8fr]">
            <div className="flex items-center gap-5 border-b border-[#d5e6ea] px-7 py-7 lg:border-b-0 lg:border-r">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#e4f7fb] text-[#047b85]">
                <Icon name="messages" className="h-9 w-9" />
              </span>
              <span>
                <span className="block text-[1.05rem] font-extrabold text-[#071923]">
                  Can't find what you're looking for?
                </span>
                <span className="mt-2 block text-sm font-medium text-[#33414b]">
                  Our team is just a message away.
                </span>
              </span>
            </div>
            {[
              { title: "Live Chat", detail: "Chat with our experts", icon: "messageSquare" },
              { title: "Email Us", detail: companyProfile.email, icon: "mail" },
              { title: "Call Us", detail: companyProfile.phone, icon: "phone" },
            ].map((item, index) => (
              <a
                key={item.title}
                href={item.icon === "mail" ? `mailto:${companyProfile.email}` : item.icon === "phone" ? `tel:${companyProfile.mobile}` : AUTH_APP_URL}
                className={`flex items-center gap-5 border-b border-[#d5e6ea] px-7 py-7 transition hover:bg-white/70 lg:border-b-0 ${
                  index < 2 ? "lg:border-r" : ""
                }`}
              >
                <Icon name={item.icon} className="h-9 w-9 shrink-0 text-[#047b85]" />
                <span>
                  <span className="block text-sm font-extrabold text-[#071923]">{item.title}</span>
                  <span className="mt-1 block text-sm font-medium text-[#33414b]">{item.detail}</span>
                </span>
              </a>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function AnalyticsDashboard() {
  return (
    <div className="rounded-xl border border-[#e5f1f3] bg-white p-5 shadow-[0_20px_56px_rgba(7,25,35,0.05)] sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Analytics dashboard
          </p>
          <h3 className="mt-3 font-display text-3xl text-slate-950">Operational snapshot</h3>
        </div>
        <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-sky-700 shadow-sm">
          Live
        </span>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ["92%", "On-time delivery"],
          ["18%", "Lower RTO drift"],
          ["24/7", "Courier visibility"],
        ].map(([value, label]) => (
          <div key={label} className="rounded-xl border border-[#e7f0f2] bg-[#f7fcfd] p-4 shadow-sm">
            <p className="font-display text-3xl text-slate-950">{value}</p>
            <p className="mt-2 text-sm text-slate-600">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-[#e7f0f2] bg-white p-5">
        <div className="flex items-end gap-3">
          {dashboardBars.map((barClass, index) => (
            <MotionDiv
              key={`${barClass}-${index}`}
              initial={{ scaleY: 0.18, opacity: 0.45 }}
              whileInView={{ scaleY: 1, opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.7, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
              className={`origin-bottom flex-1 rounded-t-[0.75rem] ${barClass}`}
            />
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-[#eef8ff] px-4 py-3 text-sm text-slate-600">Delivery performance trends</div>
          <div className="rounded-lg bg-[#fff8ef] px-4 py-3 text-sm text-slate-600">COD and cost movement</div>
          <div className="rounded-lg bg-[#effcff] px-4 py-3 text-sm text-slate-600">Customer experience signals</div>
        </div>
      </div>
    </div>
  );
}

function InsightsSection() {
  return (
    <AlignedPanelSection sectionNumber="08">
      <div className="grid gap-10 lg:grid-cols-[0.45fr_0.55fr] lg:items-center">
        <Reveal>
          <div>
            <AlignedSectionHeading
              eyebrow="Unlock Actionable Insights"
              title="Make data-driven decisions with real-time shipping intelligence."
              description="Make data-driven decisions with real-time insights on delivery performance, courier costs, COD collection, RTO trends, and customer satisfaction metrics."
            />

            <div className="mt-8 grid gap-4">
              {insightCards.map((card, index) => (
                <Reveal key={card.title} delay={0.05 * index}>
                  <div className="rounded-xl border border-[#e5f1f3] bg-white p-5 shadow-[0_16px_40px_rgba(7,25,35,0.04)]">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#e8f7f9] text-[#047b85]">
                        <Icon name={card.icon} />
                      </span>
                      <div>
                        <h3 className="font-display text-[1.35rem] font-extrabold leading-tight text-[#071923]">
                          {card.title}
                        </h3>
                        <p className="mt-3 text-sm leading-7 text-[#33414b]">{card.description}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            <ActionAnchor href={`mailto:${companyProfile.email}`} className={`${primaryButtonClass} mt-8`}>
              Get Started
            </ActionAnchor>
          </div>
        </Reveal>

        <Reveal delay={0.14}>
          <AnalyticsDashboard />
        </Reveal>
      </div>
    </AlignedPanelSection>
  );
}

function CommercePanel() {
  return (
    <div className="rounded-xl border border-[#e5f1f3] bg-white p-5 shadow-[0_20px_56px_rgba(7,25,35,0.05)] sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[#e7f0f2] bg-[#f7fcfd] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            Store connections
          </p>
          <div className="mt-4 grid gap-3">
            {["Shopify", "WooCommerce", "Amazon", "Flipkart"].map((label, index) => (
              <MotionDiv
                key={label}
                initial={{ opacity: 0, x: -14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.48, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
              >
                <span className="flex items-center gap-2">
                  <Icon
                    name={index === 0 ? "shoppingBag" : index === 1 ? "store" : index === 2 ? "globe" : "package"}
                    className="h-4 w-4"
                  />
                  <span>{label}</span>
                </span>
                <span className="rounded-full bg-[#D4F6FF] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-700">
                  Synced
                </span>
              </MotionDiv>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#e7f0f2] bg-[#fff8ef] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Shipment updates
          </p>
          <div className="mt-4 space-y-3">
            {[
              ["AWB linked", "Store order updated"],
              ["Manifest ready", "Courier allocation completed"],
              ["Tracking live", "Customer timeline synced"],
            ].map(([title, detail], index) => (
              <MotionDiv
                key={title}
                initial={{ opacity: 0, x: 14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.48, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-lg bg-white px-4 py-3 shadow-sm"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Icon name={index === 0 ? "package" : index === 1 ? "checkCircle" : "bell"} className="h-4 w-4" />
                  <span>{title}</span>
                </p>
                <p className="mt-1 text-sm text-slate-600">{detail}</p>
              </MotionDiv>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[#e7f0f2] bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {["Orders received", "AWB sent back", "Tracking synced"].map((item, index) => (
            <MotionDiv
              key={item}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.45 }}
              transition={{ duration: 0.45, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-lg bg-[#effcff] px-4 py-4 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Step 0{index + 1}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{item}</p>
            </MotionDiv>
          ))}
        </div>
      </div>
    </div>
  );
}

function EcommerceSection() {
  return (
    <AlignedPanelSection sectionNumber="09">
      <div className="grid gap-10 lg:grid-cols-[0.45fr_0.55fr] lg:items-center">
        <Reveal>
          <div>
            <AlignedSectionHeading
              eyebrow="eCommerce Integration"
              title="Connect Your Stores and Marketplaces"
              description="Connect with Shopify, WooCommerce, Magento, BigCommerce, Wix and more. Automatically sync orders, update AWB numbers, and track shipments in real-time."
            />

            <div className="mt-8 grid gap-4">
              {ecommerceCards.map((item, index) => (
                <Reveal key={item.title} delay={0.05 * index}>
                  <div className="rounded-xl border border-[#e5f1f3] bg-white p-5 shadow-[0_16px_40px_rgba(7,25,35,0.04)]">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#fff1df] text-[#ff821c]">
                        <Icon name={item.icon} />
                      </span>
                      <div>
                        <h3 className="font-display text-[1.35rem] font-extrabold leading-tight text-[#071923]">
                          {item.title}
                        </h3>
                        <p className="mt-3 text-sm leading-7 text-[#33414b]">{item.description}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            <ActionAnchor href={`mailto:${companyProfile.email}`} className={`${primaryButtonClass} mt-8`}>
              Get Started
            </ActionAnchor>
          </div>
        </Reveal>

        <Reveal delay={0.14}>
          <CommercePanel />
        </Reveal>
      </div>
    </AlignedPanelSection>
  );
}

function RateComparisonPreview() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#e5f1f3] bg-white p-5 shadow-[0_20px_56px_rgba(7,25,35,0.05)] sm:p-7">
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ff821c]">
            Rate engine
          </p>
          <h3 className="mt-3 font-display text-3xl font-extrabold text-[#071923]">
            Best carrier, visible cost.
          </h3>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#e4f7fb] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#047b85]">
          <Icon name="spark" className="h-4 w-4" />
          Smart match
        </span>
      </div>

      <div className="relative mt-7 grid gap-4">
        {rateRows.map((row, index) => (
          <MotionArticle
            key={row.courier}
            initial={{ opacity: 0, x: 28 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.42, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -4, scale: 1.01 }}
            className="rounded-xl border border-[#dceef2] bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#047b85] text-sm font-extrabold text-white">
                  {row.courier.slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-[#071923]">{row.courier}</p>
                  <p className="mt-1 text-xs font-semibold text-[#66747e]">{row.lane} - {row.eta}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-extrabold text-[#047b85]">{row.price}</p>
                <p className="text-xs font-semibold text-[#ff821c]">{row.fit}</p>
              </div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-[#e8f4f6]">
              <div className={`h-full rounded-full bg-[linear-gradient(90deg,#047b85,#ff821c)] ${row.width}`} />
            </div>
          </MotionArticle>
        ))}
      </div>

      <div className="relative mt-5 grid gap-3 sm:grid-cols-3">
        {["Rate", "SLA", "Risk"].map((label, index) => (
          <div key={label} className="rounded-lg border border-[#dceef2] bg-[#f7fcfd] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#66747e]">{label}</p>
            <p className="mt-2 text-sm font-extrabold text-[#071923]">
              {index === 0 ? "Compared" : index === 1 ? "Checked" : "Scored"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RateConfidenceSection() {
  return (
    <AlignedPanelSection sectionNumber="10">
      <div className="grid gap-10 lg:grid-cols-[0.46fr_0.54fr] lg:items-center">
        <Reveal>
          <div>
            <AlignedSectionHeading
              eyebrow="Pricing Confidence"
              title="Know the best shipping option before every dispatch."
              description="Give operators a clear view of courier rate, delivery promise, COD readiness, and serviceability so every order moves with the right cost-speed balance."
            />
            <div className="mt-8 grid gap-4">
              {rateCards.map((card, index) => (
                <Reveal key={card.title} delay={index * 0.05}>
                  <MotionArticle
                    whileHover={{ x: 6 }}
                    className="rounded-xl border border-[#dceef2] bg-white p-5 shadow-[0_18px_42px_rgba(7,25,35,0.05)]"
                  >
                    <div className="flex items-start gap-4">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#047b85] text-white shadow-[0_12px_24px_rgba(4,123,133,0.18)]">
                        <Icon name={card.icon} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <h3 className="font-display text-[1.35rem] font-extrabold leading-tight text-[#071923]">
                            {card.title}
                          </h3>
                          <span className="rounded-full bg-[#fff1df] px-3 py-1 text-xs font-extrabold text-[#ff821c]">
                            {card.metric} {card.label}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-[#33414b]">{card.description}</p>
                      </div>
                    </div>
                  </MotionArticle>
                </Reveal>
              ))}
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ActionAnchor href={AUTH_APP_URL} className={primaryButtonClass}>
                Get Started
              </ActionAnchor>
              <ActionAnchor href="/rate-calculator" className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-[#047b85] bg-white px-6 py-3 text-sm font-semibold text-[#047b85] transition hover:-translate-y-0.5 hover:bg-[#eef9fb] sm:w-auto">
                Rate Calculator
              </ActionAnchor>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.14}>
          <RateComparisonPreview />
        </Reveal>
      </div>
    </AlignedPanelSection>
  );
}

function LaunchTimelineVisual() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/12 bg-[#014b55] p-5 text-white shadow-[0_30px_90px_rgba(0,45,53,0.18)] sm:p-7">
      <div className="absolute inset-x-0 top-0 h-32 opacity-25 [clip-path:polygon(0_20%,16%_8%,34%_22%,48%_4%,70%_16%,98%_25%,92%_72%,70%_62%,52%_78%,33%_68%,15%_82%,4%_62%)] [background-image:radial-gradient(circle,#c8f5fb_1.3px,transparent_1.55px)] [background-size:8px_8px]" />
      <div className="relative">
        <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ffd8a8]">
          Launch plan
        </p>
        <h3 className="mt-3 max-w-md font-display text-3xl font-extrabold leading-tight">
          From first connect to live shipments without the chaos.
        </h3>
      </div>

      <div className="relative mt-9 grid gap-4">
        {launchSteps.map((step, index) => (
          <MotionArticle
            key={step.title}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.42, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
            className="relative rounded-xl border border-white/10 bg-white/[0.08] p-5 backdrop-blur-sm"
          >
            {index < launchSteps.length - 1 ? (
              <span className="absolute left-[2.35rem] top-[4.9rem] h-8 w-px bg-white/18" aria-hidden="true" />
            ) : null}
            <div className="flex gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white text-[#047b85]">
                <Icon name={step.icon} />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/52">
                  Step 0{index + 1}
                </p>
                <h4 className="mt-1 text-lg font-extrabold text-white">{step.title}</h4>
                <p className="mt-2 text-sm leading-7 text-white/72">{step.description}</p>
              </div>
            </div>
          </MotionArticle>
        ))}
      </div>

      <div className="relative mt-6 rounded-xl bg-white p-5 text-[#071923]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#ff821c]">
              Dedicated help
            </p>
            <p className="mt-2 text-lg font-extrabold">Support ready before your first label.</p>
          </div>
          <a href={`mailto:${companyProfile.email}`} className="inline-flex items-center justify-center rounded-lg bg-[#047b85] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#056c76]">
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}

function LaunchSupportSection() {
  return (
    <AlignedPanelSection sectionNumber="11" shellClassName="pb-12 sm:pb-14 lg:pb-16">
      <div className="grid gap-10 lg:grid-cols-[0.54fr_0.46fr] lg:items-center">
        <Reveal>
          <LaunchTimelineVisual />
        </Reveal>

        <Reveal delay={0.12}>
          <div>
            <AlignedSectionHeading
              eyebrow="Launch With Confidence"
              title="A shipping platform is only useful when your team can run it daily."
              description="Feather Global pairs clean software with practical setup support, so teams can move from fragmented courier workflows into a reliable operating rhythm."
            />
            <div className="mt-8 grid gap-4">
              {supportCards.map((card, index) => (
                <Reveal key={card.title} delay={index * 0.05}>
                  <MotionArticle
                    whileHover={{ y: -5, scale: 1.01 }}
                    className="rounded-xl border border-[#dceef2] bg-white p-5 shadow-[0_18px_42px_rgba(7,25,35,0.05)]"
                  >
                    <div className="flex items-start gap-4">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#fff1df] text-[#ff821c]">
                        <Icon name={card.icon} />
                      </span>
                      <div>
                        <h3 className="font-display text-[1.35rem] font-extrabold leading-tight text-[#071923]">
                          {card.title}
                        </h3>
                        <p className="mt-3 text-sm leading-7 text-[#33414b]">{card.description}</p>
                      </div>
                    </div>
                  </MotionArticle>
                </Reveal>
              ))}
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <a href={`tel:${companyProfile.mobile}`} className="flex items-center gap-4 rounded-xl border border-[#dceef2] bg-[#f7fcfd] p-4 text-sm font-semibold text-[#071923] transition hover:-translate-y-0.5 hover:bg-white">
                <Icon name="phone" className="h-6 w-6 text-[#047b85]" />
                <span>{companyProfile.mobile}</span>
              </a>
              <a href={`mailto:${companyProfile.email}`} className="flex items-center gap-4 rounded-xl border border-[#dceef2] bg-[#f7fcfd] p-4 text-sm font-semibold text-[#071923] transition hover:-translate-y-0.5 hover:bg-white">
                <Icon name="mail" className="h-6 w-6 text-[#047b85]" />
                <span>{companyProfile.email}</span>
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </AlignedPanelSection>
  );
}

function FeatherLandingPage() {
  return (
    <main id="home" className="overflow-hidden bg-[#047b85]">
      <HeroSection />
      <PlatformsSection />
      <WhyChooseSection />
      <FeaturesShowcaseSection />
      <TestimonialsSection />
      <FaqSection />
      <WhatYouGetSection />
      <InsightsSection />
      <EcommerceSection />
      <RateConfidenceSection />
      <LaunchSupportSection />
    </main>
  );
}

export default FeatherLandingPage;
