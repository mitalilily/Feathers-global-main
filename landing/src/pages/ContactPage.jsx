import { motion } from 'framer-motion'
import { useState } from 'react'
import { PageShell } from '../components/PageShell'
import { Seo } from '../components/Seo'
import { company, faqs } from '../data/site'

export function ContactPage() {
  const MotionDiv = motion.div
  const [form, setForm] = useState({
    name: '',
    email: '',
    requirement: '',
  })

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    const subject = `Shiplifi enquiry from ${form.name || 'Website visitor'}`
    const body = [
      `Name: ${form.name || '-'}`,
      `Email: ${form.email || '-'}`,
      '',
      'Requirement:',
      form.requirement || '-',
    ].join('\n')

    window.location.href = `mailto:info@shiplifi.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <PageShell>
      <Seo
        title="Contact Shiplifi"
        description="Talk to Shiplifi about courier comparison, delivery tools, and shipping support for your online business."
        path="/contact"
        keywords="contact shiplifi, shipping platform demo, courier aggregator contact"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'ContactPage',
          name: 'Contact Shiplifi',
          url: `${company.website}/contact`,
          description:
            'Get in touch with Shiplifi about courier comparison, delivery tools, and shipping support.',
          mainEntity: {
            '@type': 'Organization',
            name: company.name,
            url: company.website,
          },
        }}
      />
      <section className="bg-ink py-18 text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="font-semibold uppercase tracking-[0.24em] text-sky">Contact</p>
          <h1 className="mt-5 max-w-3xl font-display text-5xl font-bold tracking-tight sm:text-6xl">
            Start the conversation behind smoother shipping.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Tell us a little about your business and what kind of shipping help you are looking for.
          </p>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.6 }}
            className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]"
          >
            <p className="font-semibold uppercase tracking-[0.22em] text-ocean">Inquiry Form</p>
            <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
              <label className="grid gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                  Name
                </span>
                <input
                  name="name"
                  type="text"
                  placeholder="Your name"
                  value={form.name}
                  onChange={updateField}
                  className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 outline-none transition focus:border-ocean"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                  Email
                </span>
                <input
                  name="email"
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={updateField}
                  className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 outline-none transition focus:border-ocean"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                  Requirement
                </span>
                <textarea
                  name="requirement"
                  rows="5"
                  placeholder="Tell us about your business and shipping needs"
                  value={form.requirement}
                  onChange={updateField}
                  className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 outline-none transition focus:border-ocean"
                />
              </label>
              <button
                type="submit"
                className="mt-2 w-fit rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-7 py-3 font-semibold text-ink transition hover:scale-[1.02]"
              >
                Send Inquiry
              </button>
            </form>
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="grid gap-6"
          >
            <div className="rounded-[2rem] bg-sand p-8">
              <p className="font-semibold uppercase tracking-[0.22em] text-ocean">
                Business Details
              </p>
              <div className="mt-6 space-y-5">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
                    Company
                  </p>
                  <p className="mt-2 text-xl font-semibold text-ink">{company.name}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
                    Punch Line
                  </p>
                  <p className="mt-2 text-xl font-semibold text-ink">{company.tagline}</p>
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
                    Email
                  </p>
                  <a
                    href="mailto:info@shiplifi.com"
                    className="mt-2 block text-xl font-semibold text-ink transition hover:text-ocean"
                  >
                    info@shiplifi.com
                  </a>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-ink/8 bg-white p-8">
              <p className="font-semibold uppercase tracking-[0.22em] text-ocean">Location</p>
              <p className="mt-5 text-lg leading-8 text-steel">{company.address}</p>
            </div>
          </MotionDiv>
        </div>
      </section>

      <section className="bg-mist py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-semibold uppercase tracking-[0.24em] text-ocean">
              Need More Detail?
            </p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink">
              Common questions merchants ask before choosing a shipping platform.
            </h2>
          </div>

          <div className="mt-10 grid gap-5">
            {faqs.slice(0, 3).map((item, index) => (
              <MotionDiv
                key={item.question}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
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
