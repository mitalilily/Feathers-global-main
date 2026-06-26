import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { PageShell } from '../components/PageShell'
import { Seo } from '../components/Seo'
import { company } from '../data/site'
import { guides } from '../data/guides'

export function GuidesIndexPage() {
  const MotionDiv = motion.div

  return (
    <PageShell>
      <Seo
        title="Shipping Guides"
        description="Read Shiplifi guides on courier comparison, shipping costs, returned orders, and delivery best practices for online sellers in India."
        path="/guides"
        keywords="shipping guides india, courier comparison guides, ecommerce shipping blog india"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Shiplifi Shipping Guides',
          url: `${company.website}/guides`,
          description:
            'Read Shiplifi guides on courier comparison, shipping costs, returned orders, and delivery best practices.',
        }}
      />

      <section className="bg-ink py-18 text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="font-semibold uppercase tracking-[0.24em] text-sky">Guides</p>
          <h1 className="mt-5 max-w-4xl font-display text-5xl font-bold tracking-tight sm:text-6xl">
            Helpful delivery guides for online sellers
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            Learn how to compare couriers, understand delivery costs, reduce returns, and make shipping easier to manage.
          </p>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-2 lg:px-8">
          {guides.map((guide, index) => (
            <MotionDiv
              key={guide.path}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.45, delay: index * 0.05 }}
              className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                Guide 0{index + 1}
              </p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">
                {guide.title}
              </h2>
              <p className="mt-4 leading-8 text-steel">{guide.description}</p>
              <Link
                to={guide.path}
                className="mt-6 inline-flex rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-6 py-3 font-semibold text-ink transition hover:scale-[1.02]"
              >
                Read guide
              </Link>
            </MotionDiv>
          ))}
        </div>
      </section>
    </PageShell>
  )
}
