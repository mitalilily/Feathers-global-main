import { Suspense, lazy, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Route, Routes } from "react-router-dom";
import MainLayout from "./components/feather/MainLayout";

const logoImage = "/feather-global-logo.svg";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const RateCalculatorPage = lazy(() => import("./pages/RateCalculatorPage"));
const TrackingPage = lazy(() => import("./pages/TrackingPage"));
const VolumetricCalculatorPage = lazy(() => import("./pages/VolumetricCalculatorPage"));
const MotionDiv = motion.div;
const MotionImg = motion.img;
const MotionP = motion.p;

function LoadingScreen() {
  return (
    <MotionDiv
      key="site-loader"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      className="fixed inset-0 z-[9999] flex min-h-screen items-center justify-center bg-[#f4fbfc] px-6"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(4,123,133,0.12),transparent_24%),radial-gradient(circle_at_78%_28%,rgba(255,130,28,0.16),transparent_24%),linear-gradient(180deg,#ffffff_0%,#eef9fb_100%)]" />
      <MotionDiv
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10 text-center"
      >
        <MotionImg
          src={logoImage}
          alt="Feather Global"
          className="mx-auto h-36 w-auto object-contain sm:h-44"
          animate={{ opacity: [1, 0.72, 1], y: [0, -4, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <MotionP
          className="mt-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#047b85]"
          animate={{ opacity: [0.42, 1, 0.42] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          Site is loading
        </MotionP>
      </MotionDiv>
    </MotionDiv>
  );
}

function RouteFallback() {
  return <LoadingScreen />;
}

function App() {
  const [showLoader, setShowLoader] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [pageLoaded, setPageLoaded] = useState(() =>
    typeof document === "undefined" ? false : document.readyState === "complete"
  );

  useEffect(() => {
    const minimumTimer = window.setTimeout(() => {
      setMinimumElapsed(true);
    }, 1200);
    const loadFallbackTimer = window.setTimeout(() => {
      setPageLoaded(true);
    }, 2600);

    const handleLoad = () => {
      setPageLoaded(true);
    };

    if (document.readyState === "complete") {
      handleLoad();
    } else {
      window.addEventListener("load", handleLoad, { once: true });
    }

    return () => {
      window.clearTimeout(minimumTimer);
      window.clearTimeout(loadFallbackTimer);
      window.removeEventListener("load", handleLoad);
    };
  }, []);

  useEffect(() => {
    if (minimumElapsed && pageLoaded) {
      setShowLoader(false);
    }
  }, [minimumElapsed, pageLoaded]);

  return (
    <>
      <MotionDiv
        initial={false}
        animate={{ opacity: showLoader ? 0 : 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={showLoader ? "pointer-events-none" : undefined}
      >
        <Routes>
          <Route element={<MainLayout />}>
            <Route
              path="/"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <LandingPage />
                </Suspense>
              }
            />
            <Route
              path="/volumetric-weight-calculator"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <VolumetricCalculatorPage />
                </Suspense>
              }
            />
            <Route
              path="/rate-calculator"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <RateCalculatorPage />
                </Suspense>
              }
            />
            <Route
              path="/tracking"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <TrackingPage />
                </Suspense>
              }
            />
            <Route
              path="*"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <NotFoundPage />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </MotionDiv>

      <AnimatePresence>{showLoader ? <LoadingScreen /> : null}</AnimatePresence>
    </>
  );
}

export default App;
