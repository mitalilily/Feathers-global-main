import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { PageShell } from '../components/PageShell'
import { Seo } from '../components/Seo'
import { company } from '../data/site'

export function SeoLandingPage({ page }) {
  const MotionDiv = motion.div

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.title,
    description: page.description,
    url: new URL(page.path, company.website).toString(),
    about: 'Shipping and courier comparison for ecommerce brands in India',
  }

  return (
    <PageShell>
      <Seo
        title={page.title}
        description={page.description}
        path={page.path}
        keywords={page.keywords}
        schema={[
          schema,
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'Home',
                item: company.website,
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: page.title,
                item: new URL(page.path, company.website).toString(),
              },
            ],
          },
        ]}
      />

      <section className="bg-ink py-18 text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="font-semibold uppercase tracking-[0.24em] text-sky">Shiplifi</p>
          <h1 className="mt-5 max-w-4xl font-display text-5xl font-bold tracking-tight sm:text-6xl">
            {page.headline}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">{page.intro}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              to="/contact"
              className="rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-7 py-3 font-semibold text-ink transition hover:scale-[1.02]"
            >
              Talk to Shiplifi
            </Link>
            <Link
              to="/rate-calculator"
              className="rounded-full border border-white/15 px-7 py-3 font-semibold text-white transition hover:border-sky/60 hover:bg-white/6"
            >
              Try the rate calculator
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-3 lg:px-8">
          {page.sections.map((section, index) => (
            <MotionDiv
              key={section.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, delay: index * 0.06 }}
              className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                Benefit 0{index + 1}
              </p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">
                {section.title}
              </h2>
              <p className="mt-4 leading-8 text-steel">{section.text}</p>
            </MotionDiv>
          ))}
        </div>
      </section>

      <section className="bg-mist py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-[1fr_0.9fr] lg:px-8">
          <div className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]">
            <p className="font-semibold uppercase tracking-[0.22em] text-ocean">Why Shiplifi</p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
              A better way to compare couriers and manage delivery
            </h2>
            <div className="mt-6 grid gap-4 text-lg leading-8 text-steel">
              <p>Check likely prices before booking.</p>
              <p>Keep package size, rate checks, and tracking tools in one website.</p>
              <p>Give customers a smoother delivery experience after checkout.</p>
            </div>
          </div>

          <div className="rounded-[2rem] bg-sand p-8">
            <p className="font-semibold uppercase tracking-[0.22em] text-ocean">Useful Links</p>
            <div className="mt-6 grid gap-4">
              <Link
                to="/volumetric-weight-calculator"
                className="rounded-[1.3rem] border border-ink/8 bg-white px-5 py-4 text-lg font-semibold text-ink transition hover:border-ocean hover:text-ocean"
              >
                Package size calculator
              </Link>
              <Link
                to="/rate-calculator"
                className="rounded-[1.3rem] border border-ink/8 bg-white px-5 py-4 text-lg font-semibold text-ink transition hover:border-ocean hover:text-ocean"
              >
                Rate calculator
              </Link>
              <Link
                to="/tracking"
                className="rounded-[1.3rem] border border-ink/8 bg-white px-5 py-4 text-lg font-semibold text-ink transition hover:border-ocean hover:text-ocean"
              >
                Track an order
              </Link>
              <Link
                to="/contact"
                className="rounded-[1.3rem] border border-ink/8 bg-white px-5 py-4 text-lg font-semibold text-ink transition hover:border-ocean hover:text-ocean"
              >
                Contact Shiplifi
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  )
}
