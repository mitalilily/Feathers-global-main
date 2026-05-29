import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { PageShell } from '../components/PageShell'
import { Seo } from '../components/Seo'
import { company } from '../data/site'
import { buildApiUrl } from '../utils/api'

function formatDateTime(value) {
  if (!value) return '--'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function TrackingPage() {
  const MotionDiv = motion.div
  const [awbNumber, setAwbNumber] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [trackingData, setTrackingData] = useState(null)

  const history = useMemo(
    () => (Array.isArray(trackingData?.history) ? trackingData.history : []),
    [trackingData],
  )

  const latestEvent = history[0] ?? null

  async function handleSubmit(event) {
    event.preventDefault()

    const normalizedAwb = awbNumber.trim()
    if (!normalizedAwb) {
      setError('Please enter your tracking number.')
      setTrackingData(null)
      return
    }

    setIsLoading(true)
    setError('')
    setTrackingData(null)

    try {
      const response = await fetch(
        buildApiUrl(`/api/public/tracking?awb=${encodeURIComponent(normalizedAwb)}`),
      )
      const payload = await response.json()

      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || 'Unable to fetch tracking details right now.')
      }

      setTrackingData(payload.data ?? null)
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : 'Unable to fetch tracking details right now.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <PageShell>
      <Seo
        title="Track Order"
        description="Track your order with Shiplifi using a tracking number to view the latest delivery status and recent updates."
        path="/tracking"
        keywords="track courier order india, track shipment, courier tracking india, shiplifi tracking"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Shiplifi Order Tracking',
          url: `${company.website}/tracking`,
          description:
            'Track your order with a tracking number and view the latest delivery updates.',
          isPartOf: {
            '@type': 'WebSite',
            name: company.name,
            url: company.website,
          },
        }}
      />
      <section className="bg-ink py-18 text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="font-semibold uppercase tracking-[0.24em] text-sky">
            Tracking
          </p>
          <h1 className="mt-5 max-w-4xl font-display text-5xl font-bold tracking-tight sm:text-6xl">
            Track your order with a tracking number.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Check the latest delivery status, expected arrival, and recent updates in one place.
          </p>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]"
          >
            <p className="font-semibold uppercase tracking-[0.22em] text-ocean">
              Track an Order
            </p>
            <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
              <label className="grid gap-2">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                  Tracking Number
                </span>
                <input
                  type="text"
                  value={awbNumber}
                  onChange={(event) => setAwbNumber(event.target.value)}
                  placeholder="Enter tracking number"
                  className="rounded-2xl border border-ink/10 bg-mist px-4 py-3 outline-none transition focus:border-ocean"
                />
              </label>

              <button
                type="submit"
                className="w-fit rounded-full bg-gradient-to-r from-ocean via-sky to-coral px-7 py-3 font-semibold text-ink shadow-lg shadow-coral/20 transition hover:scale-[1.02]"
              >
                {isLoading ? 'Checking Order...' : 'Track Order'}
              </button>

              {error ? (
                <div className="rounded-[1.2rem] border border-coral/20 bg-sand px-4 py-4 text-sm text-coral">
                  {error}
                </div>
              ) : null}
            </form>

            <div className="mt-8 rounded-[1.6rem] bg-sand p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
                What you can view
              </p>
              <div className="mt-4 grid gap-3 text-sm leading-7 text-steel">
                <p>Current delivery status and courier name</p>
                <p>Expected arrival date and payment type</p>
                <p>Recent order updates with place and time</p>
              </div>
            </div>
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="grid gap-5"
          >
            <div className="rounded-[2rem] bg-ink p-8 text-white">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky">
                    Order Summary
                  </p>
                  <h2 className="mt-4 font-display text-3xl font-bold">
                    {trackingData?.status || 'Waiting for tracking details'}
                  </h2>
                </div>
                <div className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold uppercase tracking-[0.16em] text-white/88">
                  {trackingData?.courier_name || 'Courier'}
                </div>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-300">
                    Tracking Number
                  </p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {trackingData?.awb_number || '--'}
                  </p>
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-300">
                    Order Number
                  </p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {trackingData?.order_number || '--'}
                  </p>
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-300">
                    Expected Delivery
                  </p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {trackingData?.edd ? formatDateTime(trackingData.edd) : '--'}
                  </p>
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-300">
                    Payment Type
                  </p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {trackingData?.payment_type || '--'}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
                <p className="text-sm uppercase tracking-[0.2em] text-slate-300">
                  Latest Update
                </p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {latestEvent?.message || trackingData?.shipment_info || 'Order updates will appear here.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
                  <span>{latestEvent?.location || 'Location unavailable'}</span>
                  <span>{latestEvent?.event_time ? formatDateTime(latestEvent.event_time) : '--'}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-ink/8 bg-white p-8 shadow-[0_20px_80px_rgba(15,23,42,0.06)]">
              <p className="font-semibold uppercase tracking-[0.22em] text-ocean">
                Tracking Timeline
              </p>

              {history.length ? (
                <div className="mt-6 grid gap-5">
                  {history.map((event, index) => (
                    <div
                      key={`${event.event_time}-${event.status_code}-${index}`}
                      className="relative rounded-[1.5rem] border border-ink/8 bg-mist p-5 pl-8"
                    >
                      <span className="absolute left-4 top-6 h-3 w-3 rounded-full bg-gradient-to-r from-ocean via-sky to-coral" />
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-display text-2xl font-bold text-ink">
                            {event.message || event.status_code || 'Latest update'}
                          </p>
                          <p className="mt-1 text-sm text-steel">
                            {event.location || 'Location unavailable'}
                          </p>
                        </div>
                        <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-coral">
                          {formatDateTime(event.event_time)}
                        </div>
                      </div>
                      <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-steel">
                        {event.status_code || 'Order update'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-[1.4rem] border border-dashed border-ink/12 bg-mist p-5 text-sm leading-7 text-steel">
                  Order updates will appear here after you enter a tracking number.
                </div>
              )}
            </div>
          </MotionDiv>
        </div>
      </section>
    </PageShell>
  )
}
