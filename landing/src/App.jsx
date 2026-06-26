import { Suspense, lazy } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { guides } from './data/guides'
import { seoPages } from './data/seoPages'
import { GuideArticlePage } from './pages/GuideArticlePage'
import { GuidesIndexPage } from './pages/GuidesIndexPage'
import { SeoLandingPage } from './pages/SeoLandingPage'

const HomePage = lazy(() =>
  import('./pages/HomePage').then((module) => ({ default: module.HomePage })),
)
const SolutionsPage = lazy(() =>
  import('./pages/SolutionsPage').then((module) => ({
    default: module.SolutionsPage,
  })),
)
const VolumetricWeightCalculatorPage = lazy(() =>
  import('./pages/VolumetricWeightCalculatorPage').then((module) => ({
    default: module.VolumetricWeightCalculatorPage,
  })),
)
const RateCalculatorPage = lazy(() =>
  import('./pages/RateCalculatorPage').then((module) => ({
    default: module.RateCalculatorPage,
  })),
)
const TrackingPage = lazy(() =>
  import('./pages/TrackingPage').then((module) => ({
    default: module.TrackingPage,
  })),
)
const IntegrationsPage = lazy(() =>
  import('./pages/IntegrationsPage').then((module) => ({
    default: module.IntegrationsPage,
  })),
)
const AboutPage = lazy(() =>
  import('./pages/AboutPage').then((module) => ({ default: module.AboutPage })),
)
const ContactPage = lazy(() =>
  import('./pages/ContactPage').then((module) => ({
    default: module.ContactPage,
  })),
)

function App() {
  const location = useLocation()

  return (
    <Layout>
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center bg-cloud">
            <div className="rounded-full border border-ink/10 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-ocean">
              Loading Shiplifi
            </div>
          </div>
        }
      >
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<HomePage />} />
            <Route path="/solutions" element={<SolutionsPage />} />
            <Route path="/guides" element={<GuidesIndexPage />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route
              path="/volumetric-weight-calculator"
              element={<VolumetricWeightCalculatorPage />}
            />
            <Route path="/rate-calculator" element={<RateCalculatorPage />} />
            <Route path="/tracking" element={<TrackingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            {seoPages.map((page) => (
              <Route
                key={page.path}
                path={page.path}
                element={<SeoLandingPage page={page} />}
              />
            ))}
            {guides.map((guide) => (
              <Route
                key={guide.path}
                path={guide.path}
                element={<GuideArticlePage guide={guide} />}
              />
            ))}
          </Routes>
        </AnimatePresence>
      </Suspense>
    </Layout>
  )
}

export default App
