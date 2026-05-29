import { motion } from 'framer-motion'
import { PageShell } from '../components/PageShell'
import { Seo } from '../components/Seo'
import { company } from '../data/site'
import {
  courierPartners,
  integrationCapabilities,
  platformLogos,
} from '../data/site'

const storeMeta = {
  Shopify: {
    logo: 'https://www.google.com/s2/favicons?domain=shopify.com&sz=128',
    status: 'Live',
  },
  WooCommerce: {
    logo: 'https://www.google.com/s2/favicons?domain=woocommerce.com&sz=128',
    status: 'Coming Soon',
  },
  Amazon: {
    logo: 'https://www.google.com/s2/favicons?domain=amazon.in&sz=128',
    status: 'Coming Soon',
  },
  Flipkart: {
    logo: 'https://www.google.com/s2/favicons?domain=flipkart.com&sz=128',
    status: 'Coming Soon',
  },
  Magento: {
    logo: 'https://www.google.com/s2/favicons?domain=magento.com&sz=128',
    status: 'Coming Soon',
  },
  Myntra: {
    logo: 'https://www.google.com/s2/favicons?domain=myntra.com&sz=128',
    status: 'Coming Soon',
  },
  Meesho: {
    logo: 'https://www.google.com/s2/favicons?domain=meesho.com&sz=128',
    status: 'Coming Soon',
  },
  'Custom Storefronts': {
    logo: 'https://www.google.com/s2/favicons?domain=shiplifi.com&sz=128',
    status: 'Coming Soon',
  },
}

const courierMeta = {
  Delhivery: {
    logo: 'https://www.google.com/s2/favicons?domain=delhivery.com&sz=128',
  },
  'Blue Dart': {
    logo: 'https://www.google.com/s2/favicons?domain=bluedart.com&sz=128',
  },
  XpressBees: {
    logo: 'https://www.google.com/s2/favicons?domain=xpressbees.com&sz=128',
  },
  DTDC: {
    logo: 'https://www.google.com/s2/favicons?domain=dtdc.in&sz=128',
  },
  'Ecom Express': {
    logo: 'https://www.google.com/s2/favicons?domain=ecomexpress.in&sz=128',
  },
  Shadowfax: {
    logo: 'https://www.google.com/s2/favicons?domain=shadowfax.in&sz=128',
  },
  Ekart: {
    logo: 'https://www.google.com/s2/favicons?domain=ekartlogistics.com&sz=128',
  },
  'India Post': {
    logo: 'https://www.google.com/s2/favicons?domain=indiapost.gov.in&sz=128',
  },
}

export function IntegrationsPage() {
  const MotionDiv = motion.div

  return (
    <PageShell>
      <Seo
        title="Store and Courier Integrations"
        description="Connect your store, marketplaces, and courier partners with Shiplifi to keep orders and delivery updates in one place."
        path="/integrations"
        keywords="shipping integrations india, shopify courier integration, ecommerce courier integration"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Shiplifi Integrations',
          url: `${company.website}/integrations`,
          description:
            'Connect your store, marketplaces, and courier partners with Shiplifi to keep orders and delivery updates in one place.',
        }}
      />
      <section className="bg-ink py-18 text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="font-semibold uppercase tracking-[0.24em] text-sky">
            Integrations
          </p>
          <h1 className="mt-5 max-w-4xl font-display text-5xl font-bold tracking-tight sm:text-6xl">
            Connect your stores and delivery partners in one place.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Bring your selling channels and courier options together so everything feels easier to manage.
          </p>
        </div>
      </section>

      <section className="bg-cloud py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-10">
            <div>
              <p className="font-semibold uppercase tracking-[0.22em] text-ocean">
                Store Connections
              </p>
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {platformLogos.map((item, index) => (
                  <MotionDiv
                    key={item}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.35 }}
                    transition={{ duration: 0.45, delay: index * 0.04 }}
                    className="rounded-[1.5rem] border border-ink/8 bg-white px-5 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mist p-2 shadow-lg">
                          <img
                            src={storeMeta[item].logo}
                            alt={`${item} logo`}
                            className="h-8 w-8 object-contain"
                          />
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-ink">{item}</p>
                          <p className="text-sm text-steel">
                            {storeMeta[item].status === 'Live'
                              ? 'Available now'
                              : 'Coming soon'}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                          storeMeta[item].status === 'Live'
                            ? 'bg-[#e8f7d8] text-[#3f6f1f]'
                            : 'bg-sand text-coral'
                        }`}
                      >
                        {storeMeta[item].status}
                      </div>
                    </div>
                  </MotionDiv>
                ))}
              </div>
            </div>

            <div>
              <p className="font-semibold uppercase tracking-[0.22em] text-ocean">
                Courier Connections
              </p>
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {courierPartners.map((item, index) => (
                  <MotionDiv
                    key={item}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.35 }}
                    transition={{ duration: 0.45, delay: index * 0.04 }}
                    className="rounded-[1.5rem] border border-ink/8 bg-sand px-5 py-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white p-2 shadow-lg">
                        <img
                          src={courierMeta[item].logo}
                          alt={`${item} logo`}
                          className="h-8 w-8 object-contain"
                        />
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-ink">{item}</p>
                        <p className="text-sm text-steel">Available delivery partner</p>
                      </div>
                    </div>
                  </MotionDiv>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-mist py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-3">
            {integrationCapabilities.map((item, index) => (
              <MotionDiv
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="rounded-[1.8rem] border border-ink/8 bg-white p-7"
              >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                  Connection 0{index + 1}
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
