import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { PageShell } from '../components/PageShell'
import { Seo } from '../components/Seo'
import { company } from '../data/site'
import {
  calculateBillableWeight,
  calculateVolumetricWeight,
} from '../utils/calculators'

const divisorOptions = [
  { label: 'Standard box pricing', value: 5000 },
  { label: 'Large parcel pricing', value: 6000 },
]

export function VolumetricWeightCalculatorPage() {
  const MotionDiv = motion.div
  const [form, setForm] = useState({
    length: '40',
    width: '30',
    height: '25',
    actualWeight: '4.5',
    divisor: '5000',
  })

  const volumetricWeight = useMemo(
    () => calculateVolumetricWeight(form),
    [form],
  )
  const billableWeight = useMemo(
    () => calculateBillableWeight(form.actualWeight, volumetricWeight),
    [form.actualWeight, volumetricWeight],
  )

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  return (
    <PageShell>
      <Seo
        title="Package Size Calculator"
        description="Use Shiplifi to check how package size and weight may affect delivery pricing before you book."
        path="/volumetric-weight-calculator"
        keywords="package size calculator, volumetric weight calculator india, courier weight calculator"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'Shiplifi Package Size Calculator',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          url: `${company.website}/volumetric-weight-calculator`,
          description:
            'Check how package size and weight may affect delivery pricing before booking.',
          provider: {
            '@type': 'Organization',
            name: company.name,
            url: company.website,
          },
        }}
      />
      <section className="bg-ink py-18 text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="font-semibold uppercase tracking-[0.24em] text-sky">
            Package Size Calculator
          </p>
          <h1 className="mt-5 max-w-4xl font-display text-5xl font-bold tracking-tight sm:text-6xl">
            Check how your package size may affect delivery charges.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Enter your box size and package weight to get a quick estimate of the weight a courier may use for pricing.
          </p>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                  Length (cm)
                </span>
                <input
                  name="length"
                  type="number"
                  min="0"
                  value={form.length}
                  onChange={updateField}
                  className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 outline-none transition focus:border-ocean"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                  Width (cm)
                </span>
                <input
                  name="width"
                  type="number"
                  min="0"
                  value={form.width}
                  onChange={updateField}
                  className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 outline-none transition focus:border-ocean"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                  Height (cm)
                </span>
                <input
                  name="height"
                  type="number"
                  min="0"
                  value={form.height}
                  onChange={updateField}
                  className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 outline-none transition focus:border-ocean"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                  Package Weight (kg)
                </span>
                <input
                  name="actualWeight"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.actualWeight}
                  onChange={updateField}
                  className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 outline-none transition focus:border-ocean"
                />
              </label>
            </div>

            <label className="mt-5 grid gap-2">
              <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                Pricing type
              </span>
              <select
                name="divisor"
                value={form.divisor}
                onChange={updateField}
                className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 outline-none transition focus:border-ocean"
              >
                {divisorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="grid gap-5"
          >
            <div className="rounded-[2rem] bg-ink p-8 text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky">
                Result
              </p>
              <div className="mt-8 grid gap-4">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-300">
                    Size-based weight
                  </p>
                  <p className="mt-3 font-display text-4xl font-bold">{volumetricWeight} kg</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-gradient-to-r from-ocean/15 via-sky/15 to-coral/15 p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-300">
                    Chargeable weight
                  </p>
                  <p className="mt-3 font-display text-4xl font-bold">{billableWeight} kg</p>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-ink/8 bg-sand p-8">
              <p className="font-semibold uppercase tracking-[0.22em] text-ocean">
                Next Step
              </p>
              <p className="mt-4 text-lg leading-8 text-steel">
                Once you know your package details, move to the rate calculator to check likely delivery charges.
              </p>
              <Link
                to="/rate-calculator"
                className="mt-6 inline-flex rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-6 py-3 font-semibold text-ink shadow-lg shadow-coral/20 transition hover:scale-[1.02]"
              >
                Open rate calculator
              </Link>
            </div>
          </MotionDiv>
        </div>
      </section>
    </PageShell>
  )
}
