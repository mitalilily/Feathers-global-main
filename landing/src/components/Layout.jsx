import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { NavLink, useLocation } from 'react-router-dom'
import shiplifiLogo from '../assets/shiplifi-logo.png'
import { company, navItems } from '../data/site'
import { guides } from '../data/guides'

function ScrollToTop() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [location.pathname])

  return null
}

export function Layout({ children }) {
  const MotionHeader = motion.header
  const MotionDiv = motion.div
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const quickLinks = navItems.slice(0, 5)
  const utilityLinks = [
    { label: 'Package Size Calculator', path: '/volumetric-weight-calculator' },
    { label: 'Rate Calculator', path: '/rate-calculator' },
    { label: 'Track Order', path: '/tracking' },
    { label: 'Contact Sales', path: '/contact' },
  ]
  const guideLinks = guides.slice(0, 4)
  return (
    <div className="min-h-screen bg-cloud text-ink">
      <ScrollToTop />
      <MotionHeader
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className="sticky top-0 z-50 border-b border-white/10 bg-[linear-gradient(90deg,rgba(6,27,5,0.78),rgba(24,53,0,0.7),rgba(6,27,5,0.78))] backdrop-blur-2xl"
      >
        <MotionDiv
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
          className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4 lg:px-8"
        >
          <NavLink to="/" className="flex items-center gap-3">
            <img
              src={shiplifiLogo}
              alt="Shiplifi logo"
              className="h-14 w-14 rounded-2xl object-contain bg-white/5 p-1 shadow-lg shadow-coral/20"
            />
            <div>
              <p className="font-display text-lg font-bold tracking-tight text-white">
                {company.brand}
              </p>
              <p className="text-sm text-sky/90">{company.tagline}</p>
            </div>
          </NavLink>

          <div className="hidden items-center justify-end gap-3 lg:flex">
            <nav className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-2 text-sm text-white/78">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `rounded-full px-4 py-2 transition ${
                      isActive
                        ? 'bg-gradient-to-r from-ocean via-sky to-coral text-ink'
                        : 'hover:bg-white/8 hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <a
              href={company.appUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-5 py-3 text-sm font-semibold text-ink shadow-lg shadow-coral/20 transition hover:scale-[1.02]"
            >
              Get Started
            </a>
          </div>

          <div className="flex items-center gap-3 lg:hidden">
            <a
              href={company.appUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-4 py-2.5 text-sm font-semibold text-ink shadow-lg shadow-coral/20 sm:inline-flex"
            >
              Get Started
            </a>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((current) => !current)}
              aria-expanded={isMobileMenuOpen}
              aria-label="Toggle navigation"
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-white shadow-[0_12px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:bg-white/12"
            >
              <span className="flex flex-col gap-1.5">
                <span
                  className={`h-0.5 w-5 rounded-full bg-current transition ${
                    isMobileMenuOpen ? 'translate-y-2 rotate-45' : ''
                  }`}
                />
                <span
                  className={`h-0.5 w-5 rounded-full bg-current transition ${
                    isMobileMenuOpen ? 'opacity-0' : ''
                  }`}
                />
                <span
                  className={`h-0.5 w-5 rounded-full bg-current transition ${
                    isMobileMenuOpen ? '-translate-y-2 -rotate-45' : ''
                  }`}
                />
              </span>
            </button>
          </div>
        </MotionDiv>

        {isMobileMenuOpen ? (
          <div className="border-t border-white/10 px-6 pb-5 lg:hidden">
            <div className="relative mx-auto mt-4 max-w-7xl overflow-hidden rounded-[1.9rem] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.07))] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
              <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(255,229,0,0.16),transparent_38%),radial-gradient(circle_at_center,rgba(34,195,19,0.12),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(255,122,0,0.18),transparent_34%)]" />
              <nav className="grid gap-2">
                {navItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `rounded-2xl border px-4 py-3 text-sm font-medium backdrop-blur-xl transition ${
                        isActive
                          ? 'border-white/18 bg-gradient-to-r from-ocean via-sky to-coral text-ink shadow-[0_10px_30px_rgba(255,122,0,0.22)]'
                          : 'border-white/8 bg-white/6 text-white/82 hover:border-white/14 hover:bg-white/10 hover:text-white'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <a
                href={company.appUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-white/12 bg-[linear-gradient(135deg,rgba(34,195,19,0.94),rgba(255,229,0,0.94),rgba(255,122,0,0.94))] px-5 py-3 text-sm font-semibold text-ink shadow-[0_18px_50px_rgba(255,122,0,0.24)]"
              >
                Get Started
              </a>
            </div>
          </div>
        ) : null}
      </MotionHeader>

      <main>{children}</main>

      <footer className="border-t border-white/10 bg-[#061b05] text-white">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
          <div className="grid gap-8 rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_30px_120px_rgba(0,0,0,0.18)] backdrop-blur-xl lg:grid-cols-[1.1fr_0.7fr_0.7fr_0.7fr_0.9fr]">
            <div>
              <div className="flex items-center gap-4">
                <img
                  src={shiplifiLogo}
                  alt="Shiplifi logo"
                  className="h-16 w-16 rounded-2xl object-contain bg-white/10 p-1 shadow-lg shadow-coral/20"
                />
                <div>
                  <p className="font-display text-2xl font-bold">{company.brand}</p>
                  <p className="text-sm text-sand/70">{company.tagline}</p>
                </div>
              </div>
              <p className="mt-5 max-w-md text-sm leading-7 text-sand/72">
                A simple delivery experience for online brands that want better prices,
                easier bookings, and clearer order updates.
              </p>
              <div className="mt-6">
                <a
                  href={company.appUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-5 py-3 text-sm font-semibold text-ink shadow-lg shadow-coral/20 transition hover:scale-[1.02]"
                >
                  Get Started With Shiplifi
                </a>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                Platform
              </p>
              <div className="mt-4 grid gap-3 text-sm text-sand/72">
                {quickLinks.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className="transition hover:text-white"
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                Tools
              </p>
              <div className="mt-4 grid gap-3 text-sm text-sand/72">
                {utilityLinks.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className="transition hover:text-white"
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                Guides
              </p>
              <div className="mt-4 grid gap-3 text-sm text-sand/72">
                {guideLinks.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className="transition hover:text-white"
                  >
                    {item.title}
                  </NavLink>
                ))}
                <NavLink to="/guides" className="transition hover:text-white">
                  All Guides
                </NavLink>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                Company
              </p>
              <div className="mt-4 grid gap-4 text-sm text-sand/72">
                <div>
                  <p className="font-semibold text-white">Website</p>
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block transition hover:text-white"
                  >
                    {company.domain}
                  </a>
                </div>
                <div>
                  <p className="font-semibold text-white">Address</p>
                  <p className="mt-1 leading-7">{company.address}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs uppercase tracking-[0.18em] text-sand/45 sm:flex-row sm:items-center sm:justify-between">
            <p>{company.name}</p>
            <div className="flex flex-col gap-3 sm:items-end">
              <p>{company.tagline}</p>
              <a
                href="https://searchcraftdigital.com/"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] tracking-[0.18em] text-sand/55 transition hover:text-white"
              >
                Crafted by SearchCraft Digital
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
