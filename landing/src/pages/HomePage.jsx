import { motion, useScroll, useTransform } from 'framer-motion'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageShell } from '../components/PageShell'
import { Seo } from '../components/Seo'
import {
  analyticsBlocks,
  calculatorHighlights,
  company,
  faqs,
  featureHighlights,
  homepageMoments,
  networkMoments,
  pillars,
  scaleFeatures,
  stats,
} from '../data/site'
import { calculateBillableWeight, calculateVolumetricWeight } from '../utils/calculators'

const HomeBackgroundScene = lazy(() =>
  import('../components/HomeBackgroundScene').then((module) => ({
    default: module.HomeBackgroundScene,
  })),
)

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay, ease: 'easeOut' },
  }),
}

const routingPreview = [
  { label: 'Connected stores', value: 'Shopify, Amazon, WooCommerce' },
  { label: 'Daily activity', value: 'New orders, bookings, and order updates' },
  { label: 'Courier choices', value: 'Delhivery, DTDC, Blue Dart, XpressBees' },
]

export function HomePage() {
  const heroSectionRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: heroSectionRef,
    offset: ['start end', 'end start'],
  })
  const heroCopyY = useTransform(scrollYProgress, [0, 1], [0, -70])
  const heroPanelY = useTransform(scrollYProgress, [0, 1], [0, -42])
  const heroCardsY = useTransform(scrollYProgress, [0, 1], [0, -22])
  const [volumetricForm, setVolumetricForm] = useState({
    length: '32',
    width: '24',
    height: '18',
    actualWeight: '2.8',
    divisor: '5000',
  })

  const homeVolumetricWeight = useMemo(
    () => calculateVolumetricWeight(volumetricForm),
    [volumetricForm],
  )
  const homeBillableWeight = useMemo(
    () => calculateBillableWeight(Number(volumetricForm.actualWeight || 0), homeVolumetricWeight),
    [homeVolumetricWeight, volumetricForm.actualWeight],
  )

  const MotionP = motion.p
  const MotionH1 = motion.h1
  const MotionDiv = motion.div
  const MotionArticle = motion.article

  function updateVolumetricField(event) {
    const { name, value } = event.target
    setVolumetricForm((current) => ({ ...current, [name]: value }))
  }

  return (
    <PageShell>
      <Seo
        title="Shipping Aggregator and Courier Comparison for India"
        description="Compare courier options, check delivery charges, track orders, and simplify shipping across India with Shiplifi."
        path="/"
        keywords="shipping aggregator india, courier aggregator india, shipping platform india, courier comparison india, courier rate calculator india"
        schema={[
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: company.name,
            url: company.website,
            logo: `${company.website}/favicon.png`,
            address: {
              '@type': 'PostalAddress',
              streetAddress: company.address,
              addressCountry: 'IN',
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: company.name,
            url: company.website,
          },
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqs.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
              },
            })),
          },
        ]}
      />
      <section
        ref={heroSectionRef}
        className="relative overflow-hidden bg-ink pb-24 pt-16 text-white"
      >
        <div className="absolute inset-0">
          <Suspense fallback={null}>
            <HomeBackgroundScene />
          </Suspense>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(34,195,19,0.22),transparent_28%),radial-gradient(circle_at_70%_8%,rgba(255,229,0,0.22),transparent_30%),radial-gradient(circle_at_92%_42%,rgba(255,122,0,0.18),transparent_28%),linear-gradient(180deg,rgba(6,27,5,0.18)_0%,rgba(6,27,5,0.56)_35%,rgba(6,27,5,0.94)_100%)]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid items-start gap-10 pt-8 lg:grid-cols-[1.02fr_0.98fr]">
            <MotionDiv className="max-w-3xl" style={{ y: heroCopyY }}>
              <MotionH1
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={0.12}
                className="mt-6 max-w-3xl font-display text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl"
              >
                Ship Smarter, Save More with Shiplifi
              </MotionH1>
              <MotionP
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={0.2}
                className="mt-6 max-w-2xl text-lg leading-8 text-sand/80"
              >
                Compare delivery prices, book quickly, and keep every order in view from one simple
                place built for online sellers.
              </MotionP>
              <MotionDiv
                variants={fadeUp}
                initial="hidden"
                animate="show"
                custom={0.28}
                className="mt-10 flex flex-wrap gap-4"
              >
                <Link
                  to="/contact"
                  className="rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-7 py-3 font-semibold text-ink transition hover:scale-[1.02]"
                >
                  Request a Demo
                </Link>
                <Link
                  to="/solutions"
                  className="rounded-full border border-white/15 px-7 py-3 font-semibold text-white transition hover:border-sky/60 hover:bg-white/6"
                >
                  Explore Platform Features
                </Link>
              </MotionDiv>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {stats.map((stat, index) => (
                  <MotionDiv
                    key={stat.label}
                    variants={fadeUp}
                    initial="hidden"
                    animate="show"
                    custom={0.34 + index * 0.08}
                    className="rounded-3xl border border-white/10 bg-white/8 p-5 backdrop-blur-md"
                  >
                    <p className="font-display text-2xl font-bold text-gradient">{stat.value}</p>
                    <p className="mt-2 text-sm leading-6 text-sand/75">{stat.label}</p>
                  </MotionDiv>
                ))}
              </div>
            </MotionDiv>

            <MotionDiv
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut', delay: 0.18 }}
              style={{ y: heroPanelY }}
              className="rounded-[2.25rem] border border-white/14 bg-white/8 p-2 shadow-[0_30px_120px_rgba(0,0,0,0.2)] backdrop-blur-2xl"
            >
              <div className="rounded-[2rem] border border-white/14 bg-[radial-gradient(circle_at_top_right,rgba(255,122,0,0.16),transparent_34%),linear-gradient(180deg,rgba(24,53,0,0.76)_0%,rgba(6,27,5,0.86)_100%)] p-6 text-white">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-md">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
                      At a glance
                    </p>
                    <h3 className="mt-2 font-display text-[1.9rem] font-bold leading-tight">
                      See your orders, courier choices, and delivery progress in one screen.
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-white/68">
                      Keep track of what is coming in, what is being sent, and what is on the way.
                    </p>
                  </div>
                  <div className="rounded-full border border-white/14 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/85 shadow-sm backdrop-blur">
                    Live Overview
                  </div>
                </div>

                <div className="mt-6 rounded-[1.6rem] border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
                  <div className="grid gap-3">
                    {routingPreview.map((item, index) => (
                      <div
                        key={item.label}
                        className="grid gap-2 rounded-[1.2rem] border border-white/10 bg-white/6 px-4 py-4 shadow-sm backdrop-blur"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-ocean via-sky to-coral text-xs font-bold text-ink shadow-lg shadow-coral/20">
                            0{index + 1}
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-coral">
                            {item.label}
                          </span>
                        </div>
                        <span className="text-sm font-medium leading-6 text-white/78">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </MotionDiv>
          </div>

          <MotionDiv
            style={{ y: heroCardsY }}
            className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            {networkMoments.map((item, index) => (
              <MotionDiv
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.2 + index * 0.08 }}
                className="rounded-[1.75rem] border border-white/10 bg-[#183500]/72 px-6 py-6 backdrop-blur-md"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky">
                  Stage 0{index + 1}
                </p>
                <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <h3 className="font-display text-2xl font-bold text-white">{item.title}</h3>
                </div>
                <p className="mt-4 max-w-3xl text-base leading-7 text-sand/75">{item.text}</p>
              </MotionDiv>
            ))}
          </MotionDiv>
        </div>
      </section>

      <section className="section-grid bg-cloud py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-semibold uppercase tracking-[0.24em] text-ocean">Platform Modules</p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
              Everything you need to send orders with less effort.
            </h2>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {pillars.map((pillar, index) => (
              <MotionArticle
                key={pillar.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.55, delay: index * 0.08 }}
                className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                  Module 0{index + 1}
                </p>
                <h3 className="mt-4 font-display text-2xl font-bold text-ink">{pillar.title}</h3>
                <p className="mt-4 leading-8 text-steel">{pillar.text}</p>
              </MotionArticle>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-sand py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="font-semibold uppercase tracking-[0.24em] text-ocean">Why Shiplifi?</p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
              What growing brands look for in a delivery partner
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-steel">
              Better prices, easier bookings, and clearer order updates should feel simple from day
              one.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {scaleFeatures.map((item, index) => (
              <MotionArticle
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45, delay: index * 0.05 }}
                className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-ocean via-sky to-coral text-sm font-bold text-ink shadow-lg shadow-coral/20">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <h3 className="mt-5 font-display text-2xl font-bold text-ink">{item.title}</h3>
                <p className="mt-4 leading-8 text-steel">{item.text}</p>
              </MotionArticle>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-mist py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
          <div>
            <p className="font-semibold uppercase tracking-[0.24em] text-ocean">Operations Flow</p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
              See how orders move from sales channels to courier delivery inside Shiplifi.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-steel">
              Shiplifi brings orders, courier choices, and delivery updates into one simple flow for
              growing brands.
            </p>

            <div className="mt-8 grid gap-4">
              {networkMoments.map((item, index) => (
                <MotionDiv
                  key={item.title}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ duration: 0.45, delay: index * 0.06 }}
                  className="rounded-[1.6rem] border border-ink/8 bg-white px-5 py-5"
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                    Stage 0{index + 1}
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-bold text-ink">{item.title}</h3>
                  <p className="mt-3 leading-7 text-steel">{item.text}</p>
                </MotionDiv>
              ))}
            </div>
          </div>

          <MotionDiv
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.6 }}
            className="self-center"
          >
            <div className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]">
              <div className="grid gap-4">
                {[
                  'Orders from different channels come together in one place.',
                  'You can compare options before choosing a courier.',
                  'Bookings and labels are handled without extra steps.',
                  'Order updates stay easy to follow until delivery.',
                ].map((item, index) => (
                  <MotionDiv
                    key={item}
                    initial={{ opacity: 0, x: 24 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.35 }}
                    transition={{ duration: 0.45, delay: index * 0.06 }}
                    className="rounded-[1.4rem] bg-mist px-5 py-5 text-steel"
                  >
                    <span className="font-semibold text-ocean">0{index + 1}.</span> {item}
                  </MotionDiv>
                ))}
              </div>
            </div>
          </MotionDiv>
        </div>
      </section>

      <section className="bg-ink py-20 text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="font-semibold uppercase tracking-[0.24em] text-sky">
                Shipping Network Overview
              </p>
              <h2 className="mt-4 font-display text-4xl font-bold tracking-tight">
                One platform to compare couriers, automate dispatch, and scale every shipment.
              </h2>
            </div>

            <Link
              to="/contact"
              className="w-fit rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-6 py-3 font-semibold text-ink transition hover:scale-[1.02]"
            >
              Start Shipping Smarter
            </Link>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {homepageMoments.map((item, index) => (
              <MotionDiv
                key={item.label}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
                className="rounded-[1.8rem] border border-white/10 bg-white/5 p-6 backdrop-blur"
              >
                <p className="font-display text-4xl font-bold text-gradient">{item.value}</p>
                <p className="mt-3 leading-7 text-slate-300">{item.label}</p>
              </MotionDiv>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-mist py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <MotionDiv
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6 }}
          >
            <p className="font-semibold uppercase tracking-[0.24em] text-ocean">Why Shiplifi</p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
              Made for everyday delivery decisions.
            </h2>
          </MotionDiv>

          <div className="grid gap-5">
            {[
              'Check your package details before booking so pricing feels more predictable.',
              'Compare delivery choices before you send an order.',
              'Keep order progress and delivery updates in one place.',
            ].map((item, index) => (
              <MotionDiv
                key={item}
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.55, delay: index * 0.08 }}
                className="rounded-[1.75rem] border border-ink/8 bg-white px-6 py-5 text-lg leading-8 text-steel"
              >
                {item}
              </MotionDiv>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-semibold uppercase tracking-[0.24em] text-ocean">
              Powerful Features
            </p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
              Features built to make shipping feel simpler.
            </h2>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {featureHighlights.map((item, index) => (
              <MotionArticle
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
                className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]"
              >
                <h3 className="font-display text-2xl font-bold text-ink">{item.title}</h3>
                <p className="mt-4 leading-8 text-steel">{item.text}</p>
              </MotionArticle>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-mist py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="font-semibold uppercase tracking-[0.24em] text-ocean">Shipping Tools</p>
              <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
                Run shipping math before you commit to a courier.
              </h2>
              <p className="mt-5 text-lg leading-8 text-steel">
                Check package size and likely delivery charges without leaving the website.
              </p>
            </div>
            <Link
              to="/rate-calculator"
              className="w-fit rounded-full border border-ink/10 bg-white px-6 py-3 font-semibold text-ink transition hover:border-ocean hover:text-ocean"
            >
              Try the calculators
            </Link>
          </div>

          <div className="mt-10 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <MotionArticle
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5 }}
              className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">Tool 01</p>
              <h3 className="mt-4 font-display text-3xl font-bold text-ink">
                Package size and chargeable weight
              </h3>
              <p className="mt-4 leading-8 text-steel">
                Enter your box size and weight to get a clearer idea of how it may be priced.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  { label: 'Length (cm)', name: 'length' },
                  { label: 'Width (cm)', name: 'width' },
                  { label: 'Height (cm)', name: 'height' },
                  { label: 'Actual Weight (kg)', name: 'actualWeight' },
                ].map((field) => (
                  <label key={field.name} className="grid gap-2">
                    <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                      {field.label}
                    </span>
                    <input
                      name={field.name}
                      type="number"
                      min="0"
                      step={field.name === 'actualWeight' ? '0.1' : '1'}
                      value={volumetricForm[field.name]}
                      onChange={updateVolumetricField}
                      className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 outline-none transition focus:border-ocean"
                    />
                  </label>
                ))}
              </div>

              <label className="mt-4 grid gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                  Divisor
                </span>
                <select
                  name="divisor"
                  value={volumetricForm.divisor}
                  onChange={updateVolumetricField}
                  className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 outline-none transition focus:border-ocean"
                >
                  <option value="5000">Air Express (5000)</option>
                  <option value="6000">Cargo / Bulk (6000)</option>
                </select>
              </label>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] bg-mist p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-steel">
                    Size-based weight
                  </p>
                  <p className="mt-3 font-display text-4xl font-bold text-ink">
                    {homeVolumetricWeight} kg
                  </p>
                </div>
                <div className="rounded-[1.5rem] bg-ink p-5 text-white">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky">
                    Chargeable weight
                  </p>
                  <p className="mt-3 font-display text-4xl font-bold">{homeBillableWeight} kg</p>
                </div>
              </div>

              <Link
                to="/volumetric-weight-calculator"
                className="mt-6 inline-flex rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-6 py-3 font-semibold text-ink shadow-lg shadow-coral/20 transition hover:scale-[1.02]"
              >
                Open full package size calculator
              </Link>
            </MotionArticle>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {calculatorHighlights.map((item, index) => (
              <div
                key={item.path}
                className="rounded-[1.6rem] border border-ink/8 bg-white px-6 py-5 text-steel"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                  Tool link 0{index + 1}
                </p>
                <p className="mt-3 text-lg leading-8">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="font-semibold uppercase tracking-[0.24em] text-ocean">Guides</p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
              Useful guides that help merchants choose better shipping options
            </h2>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[
              {
                label: 'How Shipping Aggregators Work in India',
                path: '/guides/how-shipping-aggregators-work-in-india',
              },
              {
                label: 'Best Courier Companies for COD Orders',
                path: '/guides/best-courier-companies-for-cod-orders',
              },
              {
                label: 'How to Reduce RTO in eCommerce Shipping',
                path: '/guides/reduce-rto-in-ecommerce-shipping',
              },
              {
                label: 'Shipping Cost Calculator for Shopify Stores',
                path: '/guides/shipping-cost-calculator-for-shopify-stores',
              },
              {
                label: 'How to Automate Logistics for Online Stores',
                path: '/guides/how-to-automate-logistics-for-online-stores',
              },
            ].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="rounded-[1.7rem] border border-ink/8 bg-white px-6 py-6 text-lg font-semibold text-ink shadow-[0_20px_80px_rgba(15,23,42,0.06)] transition hover:border-ocean hover:text-ocean"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <Link
            to="/guides"
            className="mt-8 inline-flex rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-6 py-3 font-semibold text-ink transition hover:scale-[1.02]"
          >
            Browse all guides
          </Link>
        </div>
      </section>

      <section className="bg-mist py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-semibold uppercase tracking-[0.24em] text-ocean">
              Analytics and Insights
            </p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
              Make better delivery choices with Shiplifi's analytics and insights.
            </h2>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {analyticsBlocks.map((item, index) => (
              <MotionArticle
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="rounded-[2rem] bg-white p-8"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                  Insight 0{index + 1}
                </p>
                <h3 className="mt-4 font-display text-2xl font-bold text-ink">{item.title}</h3>
                <p className="mt-4 leading-8 text-steel">{item.text}</p>
              </MotionArticle>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-semibold uppercase tracking-[0.24em] text-ocean">Frequently Asked</p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
              More clarity for merchants exploring the platform.
            </h2>
          </div>

          <div className="mt-10 grid gap-5">
            {faqs.map((item, index) => (
              <MotionDiv
                key={item.question}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, delay: index * 0.05 }}
                className="rounded-[1.8rem] border border-ink/8 bg-white p-7"
              >
                <h3 className="font-display text-2xl font-bold text-ink">{item.question}</h3>
                <p className="mt-4 leading-8 text-steel">{item.answer}</p>
              </MotionDiv>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  )
}
