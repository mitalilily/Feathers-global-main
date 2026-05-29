import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { PageShell } from '../components/PageShell'
import { Seo } from '../components/Seo'
import { company } from '../data/site'

export function GuideArticlePage({ guide }) {
  const MotionDiv = motion.div

  return (
    <PageShell>
      <Seo
        title={guide.title}
        description={guide.description}
        path={guide.path}
        keywords={guide.keywords}
        schema={[
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: guide.title,
            description: guide.description,
            author: {
              '@type': 'Organization',
              name: company.name,
            },
            publisher: {
              '@type': 'Organization',
              name: company.name,
            },
            mainEntityOfPage: new URL(guide.path, company.website).toString(),
          },
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
                name: 'Guides',
                item: `${company.website}/guides`,
              },
              {
                '@type': 'ListItem',
                position: 3,
                name: guide.title,
                item: new URL(guide.path, company.website).toString(),
              },
            ],
          },
        ]}
      />

      <section className="bg-ink py-18 text-white">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <p className="font-semibold uppercase tracking-[0.24em] text-sky">Guide</p>
          <h1 className="mt-5 font-display text-5xl font-bold tracking-tight sm:text-6xl">
            {guide.headline}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">{guide.intro}</p>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto max-w-5xl px-6 lg:px-8">
          <div className="grid gap-6">
            {guide.sections.map((section, index) => (
              <MotionDiv
                key={section.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, delay: index * 0.05 }}
                className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                  Section 0{index + 1}
                </p>
                <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">
                  {section.title}
                </h2>
                <p className="mt-4 text-lg leading-8 text-steel">{section.text}</p>
              </MotionDiv>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              to="/guides"
              className="rounded-full border border-ink/10 bg-white px-6 py-3 font-semibold text-ink transition hover:border-ocean hover:text-ocean"
            >
              More guides
            </Link>
            <Link
              to="/contact"
              className="rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-6 py-3 font-semibold text-ink transition hover:scale-[1.02]"
            >
              Talk to Shiplifi
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  )
}
