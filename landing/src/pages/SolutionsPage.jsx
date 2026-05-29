import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { PageShell } from '../components/PageShell'
import { Seo } from '../components/Seo'
import { analyticsBlocks, company, featureHighlights, journey, solutions } from '../data/site'

export function SolutionsPage() {
  const MotionArticle = motion.article
  const MotionDiv = motion.div

  return (
    <PageShell>
      <Seo
        title="Shipping Solutions for Growing Brands"
        description="Explore Shiplifi solutions for online sellers who want easier courier comparison, smoother bookings, and better order updates."
        path="/solutions"
        keywords="shipping solutions india, ecommerce shipping platform, courier comparison platform, d2c shipping"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Shiplifi Shipping Solutions',
          url: `${company.website}/solutions`,
          description:
            'Explore Shiplifi solutions for online sellers who want easier courier comparison, smoother bookings, and better order updates.',
        }}
      />
      <section className="bg-ink px-6 py-18 text-white lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="font-semibold uppercase tracking-[0.24em] text-sky">Solutions</p>
          <h1 className="mt-5 max-w-3xl font-display text-5xl font-bold tracking-tight sm:text-6xl">
            Shipping made simpler for growing brands.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Shiplifi helps teams compare options, send orders faster, and keep delivery updates easy
            to follow.
          </p>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-2 lg:px-8">
          {solutions.map((solution, index) => (
            <MotionArticle
              key={solution.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                Capability 0{index + 1}
              </p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">
                {solution.title}
              </h2>
              <p className="mt-4 leading-8 text-steel">{solution.text}</p>
            </MotionArticle>
          ))}
        </div>
      </section>

      <section className="bg-sand py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-semibold uppercase tracking-[0.24em] text-ocean">
              Platform Features
            </p>

            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
              Everything sellers need to manage shipping from checkout to delivery.
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
                className="rounded-[2rem] bg-white p-8"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                  Feature 0{index + 1}
                </p>

                <h3 className="mt-4 font-display text-2xl font-bold text-ink">{item.title}</h3>

                <p className="mt-4 leading-8 text-steel">{item.text}</p>
              </MotionArticle>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-mist py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="font-semibold uppercase tracking-[0.24em] text-ocean">How It Flows</p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
              A simple view of how orders move from booking to delivery.
            </h2>
          </div>
          <div className="grid gap-4">
            {journey.map((step, index) => (
              <MotionDiv
                key={step}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="flex items-center gap-5 rounded-[1.6rem] border border-ink/8 bg-white px-6 py-5"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-ocean via-sky to-coral font-display text-lg font-bold text-ink">
                  {index + 1}
                </div>
                <p className="text-lg font-medium text-steel">{step}</p>
              </MotionDiv>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-semibold uppercase tracking-[0.24em] text-ocean">Insights</p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
              See what is working well and where you can improve.
            </h2>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {analyticsBlocks.map((item, index) => (
              <MotionDiv
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="rounded-[1.8rem] border border-ink/8 bg-white p-7"
              >
                <h3 className="font-display text-2xl font-bold text-ink">{item.title}</h3>
                <p className="mt-4 leading-8 text-steel">{item.text}</p>
              </MotionDiv>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-sand py-20">
        <div className="mx-auto max-w-7xl rounded-[2.5rem] bg-ink px-8 py-12 text-white lg:px-12">
          <p className="font-semibold uppercase tracking-[0.22em] text-sky">
            Ready to Grow with Shiplifi?
          </p>
          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="max-w-2xl font-display text-4xl font-bold tracking-tight">
              Let’s create a delivery experience that feels simple, reliable, and ready to grow.
            </h2>
            <Link
              to="/contact"
              className="rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-7 py-3 font-semibold text-ink transition hover:scale-[1.02]"
            >
              Talk to Shiplifi
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  )
}
