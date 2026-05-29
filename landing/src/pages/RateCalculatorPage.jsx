import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { PageShell } from '../components/PageShell'
import { Seo } from '../components/Seo'
import { company } from '../data/site'
import {
  calculateBillableWeight,
  calculateRateEstimate,
  calculateVolumetricWeight,
} from '../utils/calculators'
import { buildApiUrl } from '../utils/api'

export function RateCalculatorPage() {
  const MotionDiv = motion.div
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState([])
  const [form, setForm] = useState({
    pickupPincode: '',
    deliveryPincode: '',
    actualWeight: '500',
    length: '20',
    width: '15',
    height: '10',
    shipmentValue: '1000',
    divisor: '5000',
    paymentType: 'prepaid',
  })

  const volumetricWeight = useMemo(
    () => calculateVolumetricWeight(form),
    [form],
  )
  const billableWeight = useMemo(
    () => calculateBillableWeight(Number(form.actualWeight || 0) / 1000, volumetricWeight),
    [form.actualWeight, volumetricWeight],
  )
  const estimatedCharges = useMemo(
    () =>
      calculateRateEstimate({
        zone: 'national',
        service: form.paymentType === 'cod' ? 'express' : 'standard',
        billableWeight,
        codEnabled: form.paymentType === 'cod',
      }),
    [billableWeight, form.paymentType],
  )

  function updateField(event) {
    const { name, value, type, checked } = event.target
    const nextValue =
      name === 'pickupPincode' || name === 'deliveryPincode'
        ? value.replace(/\D/g, '').slice(0, 6)
        : value
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : nextValue,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setIsLoading(true)
    setError('')
    setResults([])

    try {
      if (!/^\d{6}$/.test(form.pickupPincode) || !/^\d{6}$/.test(form.deliveryPincode)) {
        throw new Error('Enter valid 6-digit pickup and delivery pincodes.')
      }

      const response = await fetch(buildApiUrl('/api/public/shipping/rates'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origin: form.pickupPincode,
          destination: form.deliveryPincode,
          payment_type: form.paymentType,
          order_amount: Number(form.shipmentValue || 0),
          weight: Number(form.actualWeight || 0),
          length: Number(form.length || 0),
          breadth: Number(form.width || 0),
          height: Number(form.height || 0),
        }),
      })

      const payload = await response.json()

      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || payload.error || 'Unable to fetch courier options right now.')
      }

      const rateCards = Array.isArray(payload.data?.rates)
        ? payload.data.rates
        : Array.isArray(payload.data)
          ? payload.data
          : []

      setResults(rateCards.slice(0, 4))
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : 'Unable to fetch courier options right now.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <PageShell>
      <Seo
        title="Courier Rate Calculator India"
        description="Estimate delivery charges in India with Shiplifi using pickup area, destination, package details, and payment type."
        path="/rate-calculator"
        keywords="courier rate calculator india, shipping calculator india, courier charges calculator"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'Shiplifi Rate Calculator',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          url: `${company.website}/rate-calculator`,
          description:
            'Estimate delivery charges in India using pickup area, destination, package details, and payment type.',
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
            Rate Calculator
          </p>
          <h1 className="mt-5 max-w-4xl font-display text-5xl font-bold tracking-tight sm:text-6xl">
            Check likely delivery prices before you book.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Enter your pickup area, delivery area, package details, and payment type to see available options.
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
            <form onSubmit={handleSubmit} className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                    Pick-up Area Pincode
                  </span>
                  <input
                    name="pickupPincode"
                    type="text"
                    inputMode="numeric"
                    maxLength="6"
                    value={form.pickupPincode}
                    onChange={updateField}
                    className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 outline-none transition focus:border-ocean"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                    Delivery Area Pincode
                  </span>
                  <input
                    name="deliveryPincode"
                    type="text"
                    inputMode="numeric"
                    maxLength="6"
                    value={form.deliveryPincode}
                    onChange={updateField}
                    className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 outline-none transition focus:border-ocean"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                    Package Weight
                  </span>
                  <div className="flex overflow-hidden rounded-2xl border border-ink/10 bg-mist">
                    <input
                      name="actualWeight"
                      type="number"
                      min="0"
                      value={form.actualWeight}
                      onChange={updateField}
                      className="w-full bg-transparent px-4 py-3 outline-none"
                    />
                    <span className="flex items-center border-l border-ink/10 px-4 text-sm font-semibold text-steel">
                      GM
                    </span>
                  </div>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                    Order Value
                  </span>
                  <div className="flex overflow-hidden rounded-2xl border border-ink/10 bg-mist">
                    <span className="flex items-center border-r border-ink/10 px-4 text-sm font-semibold text-steel">
                      Rs
                    </span>
                    <input
                      name="shipmentValue"
                      type="number"
                      min="0"
                      value={form.shipmentValue}
                      onChange={updateField}
                      className="w-full bg-transparent px-4 py-3 outline-none"
                    />
                  </div>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                    Length
                  </span>
                  <div className="flex overflow-hidden rounded-2xl border border-ink/10 bg-mist">
                    <input
                      name="length"
                      type="number"
                      min="0"
                      value={form.length}
                      onChange={updateField}
                      className="w-full bg-transparent px-4 py-3 outline-none"
                    />
                    <span className="flex items-center border-l border-ink/10 px-4 text-sm font-semibold text-steel">
                      CM
                    </span>
                  </div>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                    Width
                  </span>
                  <div className="flex overflow-hidden rounded-2xl border border-ink/10 bg-mist">
                    <input
                      name="width"
                      type="number"
                      min="0"
                      value={form.width}
                      onChange={updateField}
                      className="w-full bg-transparent px-4 py-3 outline-none"
                    />
                    <span className="flex items-center border-l border-ink/10 px-4 text-sm font-semibold text-steel">
                      CM
                    </span>
                  </div>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                    Height
                  </span>
                  <div className="flex overflow-hidden rounded-2xl border border-ink/10 bg-mist">
                    <input
                      name="height"
                      type="number"
                      min="0"
                      value={form.height}
                      onChange={updateField}
                      className="w-full bg-transparent px-4 py-3 outline-none"
                    />
                    <span className="flex items-center border-l border-ink/10 px-4 text-sm font-semibold text-steel">
                      CM
                    </span>
                  </div>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                    Payment Type
                  </span>
                  <div className="flex rounded-2xl border border-ink/10 bg-mist p-1">
                    {[
                      { label: 'Prepaid', value: 'prepaid' },
                      { label: 'COD', value: 'cod' },
                    ].map((option) => (
                      <label
                        key={option.value}
                        className={`flex-1 cursor-pointer rounded-[1rem] px-4 py-3 text-center text-sm font-semibold transition ${
                          form.paymentType === option.value
                            ? 'bg-white text-ink shadow-sm'
                            : 'text-steel'
                        }`}
                      >
                        <input
                          type="radio"
                          name="paymentType"
                          value={option.value}
                          checked={form.paymentType === option.value}
                          onChange={updateField}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </label>
              </div>

              <button className="mt-2 w-fit rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-7 py-3 font-semibold text-ink shadow-lg shadow-coral/20 transition hover:scale-[1.02]">
                {isLoading ? 'Checking Rates...' : 'Check Available Couriers'}
              </button>

              {error ? (
                <div className="rounded-[1.2rem] border border-coral/20 bg-sand px-4 py-4 text-sm text-coral">
                  {error}
                </div>
              ) : null}
            </form>
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="grid gap-5"
          >
            <div className="rounded-[2rem] bg-ink p-8 text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky">
                Shipment Summary
              </p>
              <div className="mt-8 grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-300">
                      Size-based weight
                    </p>
                    <p className="mt-3 font-display text-3xl font-bold">{volumetricWeight} kg</p>
                  </div>
                  <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
                    <p className="text-sm uppercase tracking-[0.2em] text-slate-300">
                      Chargeable weight
                    </p>
                    <p className="mt-3 font-display text-3xl font-bold">{billableWeight} kg</p>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center justify-between py-2 text-slate-300">
                    <span>Pickup</span>
                    <span>{form.pickupPincode || '--'}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 text-slate-300">
                    <span>Delivery</span>
                    <span>{form.deliveryPincode || '--'}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 text-slate-300">
                    <span>Payment</span>
                    <span className="uppercase">{form.paymentType}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 text-slate-300">
                    <span>Order value</span>
                    <span>Rs. {form.shipmentValue || 0}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-4">
                    <span className="text-sm font-semibold uppercase tracking-[0.2em] text-sky">
                      Available options
                    </span>
                    <span className="font-display text-4xl font-bold text-white">
                      {results.length}
                    </span>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-sky/20 bg-gradient-to-r from-ocean/15 via-sky/15 to-coral/15 p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-300">
                    Estimated starting price
                  </p>
                  <p className="mt-3 font-display text-3xl font-bold text-white">
                    Rs. {estimatedCharges.total}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Shown when a courier price is not available yet.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]">
              <p className="font-semibold uppercase tracking-[0.22em] text-ocean">
                Courier Options
              </p>
              <div className="mt-6 grid gap-4">
                {results.length ? (
                  results.map((courier, index) => {
                    const liveRate = Number(
                      courier.rate ?? courier.freight_charges ?? courier.charge ?? 0,
                    )
                    const displayRate = liveRate > 0 ? liveRate : estimatedCharges.total

                    return (
                    <div
                      key={`${courier.id ?? courier.courier_id ?? courier.name}-${index}`}
                      className="rounded-[1.4rem] border border-ink/8 bg-mist p-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-display text-2xl font-bold text-ink">
                            {courier.displayName || courier.name || courier.courier_name || 'Courier option'}
                          </p>
                          <p className="mt-1 text-sm text-steel">
                            ETA: {courier.estimated_delivery_days || courier.tat || '3-5'} days
                          </p>
                        </div>
                        <div className="rounded-full bg-sand px-4 py-2 text-sm font-semibold text-coral">
                          Rs. {displayRate}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3 text-sm text-steel">
                        <span className="rounded-full bg-white px-3 py-2">
                          Chargeable: {courier.chargeable_weight ?? courier.chargeable_weight_g ?? '--'}
                        </span>
                        <span className="rounded-full bg-white px-3 py-2">
                          COD: {courier.cod_available === false ? 'No' : 'Yes'}
                        </span>
                        <span className="rounded-full bg-white px-3 py-2">
                          Zone: {courier.zone || 'Auto'}
                        </span>
                        {liveRate <= 0 ? (
                          <span className="rounded-full bg-white px-3 py-2">
                            Estimated price
                          </span>
                        ) : null}
                      </div>
                      <a
                        href={company.appUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-5 inline-flex rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-6 py-3 font-semibold text-ink shadow-lg shadow-coral/20 transition hover:scale-[1.02]"
                      >
                        Get Started
                      </a>
                    </div>
                    )
                  })
                ) : (
                  <div className="rounded-[1.4rem] border border-dashed border-ink/12 bg-mist p-5 text-sm leading-7 text-steel">
                    Courier options will appear here after you check rates.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[2rem] border border-ink/8 bg-sand p-8">
              <p className="font-semibold uppercase tracking-[0.22em] text-ocean">
                Need to check package size first?
              </p>
              <p className="mt-4 text-lg leading-8 text-steel">
                Use the separate package size page for a simpler size and weight check.
              </p>
              <Link
                to="/volumetric-weight-calculator"
                className="mt-6 inline-flex rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-6 py-3 font-semibold text-ink shadow-lg shadow-coral/20 transition hover:scale-[1.02]"
              >
                Open package size calculator
              </Link>
            </div>
          </MotionDiv>
        </div>
      </section>
    </PageShell>
  )
}
