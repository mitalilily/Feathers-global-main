import { motion } from 'framer-motion'
import { PageShell } from '../components/PageShell'
import { Seo } from '../components/Seo'
import { analyticsBlocks, company, featureHighlights } from '../data/site'

export function AboutPage() {
  const MotionDiv = motion.div

  return (
    <PageShell>
      <Seo
        title="About Shiplifi"
        description="Learn how Shiplifi helps online brands compare courier options, send orders faster, and keep delivery updates clear."
        path="/about"
        keywords="about shiplifi, courier comparison platform india, shipping company india"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          name: 'About Shiplifi',
          url: `${company.website}/about`,
          description:
            'Learn how Shiplifi helps online brands compare courier options, send orders faster, and keep delivery updates clear.',
        }}
      />
      <section className="bg-ink py-18 text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="font-semibold uppercase tracking-[0.24em] text-sky">
            About Shiplifi
          </p>
          <h1 className="mt-5 max-w-3xl font-display text-5xl font-bold tracking-tight sm:text-6xl">
            Built to make sending orders feel easier.
          </h1>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-[1fr_0.9fr] lg:px-8">
          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.6 }}
            className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]"
          >
            <p className="font-display text-3xl font-bold text-ink">
              {company.name}
            </p>
            <p className="mt-5 text-lg leading-8 text-steel">
              Shiplifi helps businesses compare courier options, book orders, and follow deliveries from one place.
            </p>
            <p className="mt-5 text-lg leading-8 text-steel">
              It is made for brands that want smoother daily shipping, better visibility, and a more reliable delivery experience.
            </p>
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="rounded-[2rem] bg-sand p-8"
          >
            <p className="font-semibold uppercase tracking-[0.22em] text-ocean">
              Company Details
            </p>
            <div className="mt-6 grid gap-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
                  Brand Name
                </p>
                <p className="mt-2 text-xl font-semibold text-ink">{company.brand}</p>
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
                  Website
                </p>
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block text-xl font-semibold text-ink transition hover:text-ocean"
                >
                  {company.domain}
                </a>
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
                  Address
                </p>
                <p className="mt-2 text-lg leading-8 text-steel">
                  {company.address}
                </p>
              </div>
            </div>
          </MotionDiv>
        </div>
      </section>

      <section className="bg-mist py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: 'Easy Comparison',
                text: 'Compare available courier options before you choose the one that fits best.',
              },
              {
                title: 'Everything in One Place',
                text: 'Book orders, create labels, and follow delivery updates from one screen.',
              },
              {
                title: 'Room to Grow',
                text: 'Keep things simple as your daily order volume grows.',
              },
            ].map((item, index) => (
              <MotionDiv
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="rounded-[1.8rem] border border-ink/8 bg-white p-7"
              >
                <h2 className="font-display text-2xl font-bold text-ink">
                  {item.title}
                </h2>
                <p className="mt-4 leading-8 text-steel">{item.text}</p>
              </MotionDiv>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-sand py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-2">
            {featureHighlights.slice(0, 4).map((item, index) => (
              <MotionDiv
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.5, delay: index * 0.06 }}
                className="rounded-[1.8rem] bg-white p-7"
              >
                <h2 className="font-display text-2xl font-bold text-ink">
                  {item.title}
                </h2>
                <p className="mt-4 leading-8 text-steel">{item.text}</p>
              </MotionDiv>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-3">
            {analyticsBlocks.map((item, index) => (
              <MotionDiv
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="rounded-[1.8rem] border border-ink/8 bg-white p-7"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                  Focus 0{index + 1}
                </p>
                <h2 className="mt-4 font-display text-2xl font-bold text-ink">
                  {item.title}
                </h2>
                <p className="mt-4 leading-8 text-steel">{item.text}</p>
              </MotionDiv>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  )
}
