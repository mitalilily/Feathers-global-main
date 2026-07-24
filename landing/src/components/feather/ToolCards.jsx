import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import Icon from "./Icons";
import { Field, Reveal } from "./primitives";
import { trackingStatuses } from "./siteData";
import { API_BASE_URL, CLIENT_RATE_CALCULATOR_URL } from "../../utils/appLinks";
import { calculateShippingEstimate, isValidPincode } from "../../utils/shippingCalculator";

const MotionArticle = motion.article;
const MotionForm = motion.form;
const COURIER_CART_API = API_BASE_URL;
const PINCODE_API = "https://api.postalpincode.in/pincode";
const paymentTypes = ["Prepaid", "COD"];
const rateBucketKeys = ["rates", "localRates", "regionalRates", "metroRates", "nationalRates", "zonalRates"];
const VOLUMETRIC_STORAGE_KEY = "feather-volumetric-calculator";
const RATE_STORAGE_KEY = "feather-rate-calculator";
const RATE_RESULT_STORAGE_KEY = "feather-rate-calculator-result";

const normalizeAwb = (value = "") => String(value || "").trim().toUpperCase();

const TRACKING_STORAGE_KEY = "feather-tracking-panel";
const RECENT_TRACKING_STORAGE_KEY = "feather-tracking-recent-searches";

const formatTrackingDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getTrackingSearchType = (query, data) => {
  const normalizedQuery = normalizeAwb(query);
  if (!normalizedQuery) return "AWB";
  const awbNumber = normalizeAwb(data?.awb_number);
  const orderId = normalizeAwb(data?.order_id);
  const orderNumber = normalizeAwb(data?.order_number);
  if (awbNumber && normalizedQuery === awbNumber) return "AWB";
  if ((orderId && normalizedQuery === orderId) || (orderNumber && normalizedQuery === orderNumber)) {
    return "Order ID";
  }
  return normalizedQuery.replace(/[^0-9]/g, "").length >= 10 ? "AWB" : "Order ID";
};

const normalizeTrackingMode = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("booking") || normalized.includes("order") || normalized === "container") return "Order ID";
  return "AWB";
};

const looksLikeOrderIdentifier = (value) => {
  const normalized = normalizeAwb(value);
  if (!normalized) return false;
  if (normalized.startsWith("#")) return true;
  return /^(ORDER|ORD|DF|FG|B2C|B2B|SHOPIFY|WOO)[-_#]?[A-Z0-9-]+$/.test(normalized);
};

const getTrackingLatestUpdate = (data, fallback = "") => {
  const latest = data?.history?.[0];
  const message = latest?.message || latest?.status_code || data?.status || fallback || "No update available yet";
  const location = latest?.location ? ` • ${latest.location}` : "";
  return `${message}${location}`;
};

const getTimelineKey = (event) =>
  [
    normalizeAwb(event?.status_code || event?.title),
    normalizeAwb(event?.message || event?.detail),
    normalizeAwb(event?.location),
    event?.event_time || event?.time || "",
  ].join("|");

const buildTrackingTimeline = (trackingData, previewTimeline) => {
  if (!trackingData?.history?.length) return previewTimeline;

  const seen = new Set();
  return trackingData.history
    .map((event) => ({
      title: event.status_code || trackingData.status || "Tracking update",
      detail: [event.message, event.location].filter(Boolean).join(" • ") || "Shipment scan recorded.",
      location: event.location || "",
      time: event.event_time,
      complete: true,
      active: false,
      raw: event,
    }))
    .filter((event) => {
      const key = getTimelineKey(event.raw || event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8)
    .map((event, index) => ({
      ...event,
      active: index === 0,
    }));
};

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getCourierName(courier) {
  return courier?.name || courier?.courier_name || courier?.courierName || courier?.partner_name || "Courier";
}

function getCourierRateDetails(courier) {
  const knownBuckets = rateBucketKeys.map((key) => courier?.[key]?.forward);
  const nestedBuckets = Object.values(courier || {})
    .filter((value) => value && typeof value === "object" && !Array.isArray(value))
    .map((value) => value?.forward)
    .filter(Boolean);
  const forwardRate = [courier?.forward, courier?.rates?.forward, ...knownBuckets, ...nestedBuckets].find(
    (value) => value && (value.rate != null || value.mode)
  );

  return {
    mode: forwardRate?.mode || courier?.mode || "",
    rate: parseNumber(forwardRate?.rate ?? courier?.rate),
  };
}

function formatCurrency(amount) {
  return amount != null ? `Rs ${amount.toFixed(2)}` : "-";
}

function formatChargeableWeight(weight) {
  const numericWeight = parseNumber(weight);

  if (numericWeight == null || numericWeight <= 0) {
    return "-";
  }

  if (numericWeight >= 1000) {
    return `${(numericWeight / 1000).toFixed(2)} kg`;
  }

  if (numericWeight >= 100) {
    return `${numericWeight.toFixed(0)} g`;
  }

  return `${numericWeight.toFixed(2)} kg`;
}

function readStoredValue(key, fallback) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) {
      return fallback;
    }

    const parsed = JSON.parse(stored);

    if (
      fallback &&
      typeof fallback === "object" &&
      !Array.isArray(fallback) &&
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return { ...fallback, ...parsed };
    }

    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function usePersistentState(key, fallback) {
  const [value, setValue] = useState(() => readStoredValue(key, fallback));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Persistence is a convenience; the tools should still work if storage is unavailable.
    }
  }, [key, value]);

  return [value, setValue];
}

function removeStoredValue(key) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Persistence is a convenience; the tools should still work if storage is unavailable.
  }
}

export function VolumetricCalculatorCard({
  className = "surface-card rounded-[2rem] p-6",
  defaultValues = { length: "40", width: "32", height: "28", divisor: "5000" },
}) {
  const [form, setForm] = usePersistentState(VOLUMETRIC_STORAGE_KEY, defaultValues);
  const length = Number(form.length) || 0;
  const width = Number(form.width) || 0;
  const height = Number(form.height) || 0;
  const divisor = Number(form.divisor) || 5000;
  const volumetricWeight = length && width && height ? (length * width * height) / divisor : 0;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleReset = () => {
    removeStoredValue(VOLUMETRIC_STORAGE_KEY);
    setForm(defaultValues);
  };

  return (
    <MotionArticle
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ duration: 0.25 }}
      className={`${className} h-full min-w-0`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
            <Icon name="calculator" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-2xl text-slate-900">Weight Calculator</h3>
            <p className="mt-1 text-sm text-slate-500">
              Work out volumetric and billable weight using carton dimensions and your preferred divisor.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-50 sm:w-auto"
        >
          Reset
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Length (cm)" name="length" type="number" value={form.length} onChange={handleChange} placeholder="Enter length" />
        <Field label="Width (cm)" name="width" type="number" value={form.width} onChange={handleChange} placeholder="Enter width" />
        <Field label="Height (cm)" name="height" type="number" value={form.height} onChange={handleChange} placeholder="Enter height" />
        <Field label="Divisor" name="divisor" type="number" value={form.divisor} onChange={handleChange} placeholder="Enter divisor" />
      </div>

      <div className="mt-6 grid gap-6 border-t border-slate-200 pt-6 sm:grid-cols-2">
        <div className="border-l-4 border-sky-300 pl-4 text-slate-900">
          <p className="text-sm text-slate-600">Volumetric weight</p>
          <p className="mt-3 font-display text-3xl sm:text-4xl">
            {volumetricWeight.toFixed(2)} <span className="text-xl text-slate-500">kg</span>
          </p>
        </div>
        <div className="border-l-4 border-amber-200 pl-4">
          <p className="text-sm text-slate-500">Billable weight note</p>
          <p className="mt-3 text-lg font-semibold text-slate-900">(L x W x H) / divisor</p>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Shipping billing usually compares actual weight against dimensional weight and uses the higher figure.
          </p>
        </div>
      </div>
    </MotionArticle>
  );
}

export function RateCalculatorCard({
  className = "surface-card rounded-[2rem] p-6",
  defaultValues = {
    pickupPincode: "",
    deliveryPincode: "",
    weight: "",
    length: "",
    width: "",
    height: "",
    shipmentValue: "",
    paymentType: "Prepaid",
  },
}) {
  const [form, setForm] = usePersistentState(RATE_STORAGE_KEY, defaultValues);
  const [pincodeMeta, setPincodeMeta] = useState({
    pickup: { city: "", state: "", loading: false, message: "", tone: "muted" },
    delivery: { city: "", state: "", loading: false, message: "", tone: "muted" },
  });
  const [couriers, setCouriers] = usePersistentState(`${RATE_RESULT_STORAGE_KEY}-couriers`, []);
  const [calculating, setCalculating] = useState(false);
  const [calculatorError, setCalculatorError] = useState("");
  const [showEstimate, setShowEstimate] = usePersistentState(`${RATE_RESULT_STORAGE_KEY}-show`, false);

  const estimate = useMemo(
    () =>
      calculateShippingEstimate({
        weightInGrams: form.weight,
        length: form.length,
        width: form.width,
        height: form.height,
        pickupPincode: form.pickupPincode,
        deliveryPincode: form.deliveryPincode,
        paymentType: form.paymentType,
        shipmentValue: form.shipmentValue,
      }),
    [
      form.deliveryPincode,
      form.height,
      form.length,
      form.paymentType,
      form.pickupPincode,
      form.shipmentValue,
      form.weight,
      form.width,
    ]
  );

  const validationError = useMemo(() => {
    if (!isValidPincode(form.pickupPincode)) {
      return "Enter a valid 6-digit pickup pincode.";
    }

    if (!isValidPincode(form.deliveryPincode)) {
      return "Enter a valid 6-digit delivery pincode.";
    }

    if (estimate.chargeableWeightKg <= 0) {
      return "Enter a valid shipment weight or dimensions.";
    }

    if (form.paymentType === "COD" && !(Number(form.shipmentValue) > 0)) {
      return "Enter the shipment value for COD orders.";
    }

    return "";
  }, [
    estimate.chargeableWeightKg,
    form.deliveryPincode,
    form.paymentType,
    form.pickupPincode,
    form.shipmentValue,
  ]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextValue =
      name === "pickupPincode" || name === "deliveryPincode" ? value.replace(/\D/g, "").slice(0, 6) : value;

    setForm((current) => ({
      ...current,
      [name]: nextValue,
    }));
    setShowEstimate(false);
    setCouriers([]);
    setCalculatorError("");
  };

  const handleReset = () => {
    removeStoredValue(RATE_STORAGE_KEY);
    removeStoredValue(`${RATE_RESULT_STORAGE_KEY}-couriers`);
    removeStoredValue(`${RATE_RESULT_STORAGE_KEY}-show`);
    setForm(defaultValues);
    setCouriers([]);
    setCalculatorError("");
    setShowEstimate(false);
  };

  const lookupPincode = async (pincode) => {
    if (!pincode || pincode.length !== 6) {
      return { city: "", state: "", message: "", tone: "muted" };
    }

    try {
      const response = await fetch(`${PINCODE_API}/${pincode}`);
      const data = await response.json();
      const postOffice = data?.[0]?.PostOffice?.[0];

      if (data?.[0]?.Status === "Success" && postOffice) {
        return {
          city: postOffice.District || "",
          state: postOffice.State || "",
          message: "",
          tone: "muted",
        };
      }

      return { city: "", state: "", message: "Pincode details not found.", tone: "error" };
    } catch {
      return {
        city: "",
        state: "",
        message: "City/state lookup is unavailable right now.",
        tone: "muted",
      };
    }
  };

  useEffect(() => {
    if (form.pickupPincode.length !== 6) {
      setPincodeMeta((current) => ({
        ...current,
        pickup: { city: "", state: "", loading: false, message: "", tone: "muted" },
      }));
      return undefined;
    }

    let ignore = false;
    setPincodeMeta((current) => ({
      ...current,
      pickup: { ...current.pickup, loading: true, message: "", tone: "muted" },
    }));

    lookupPincode(form.pickupPincode).then((result) => {
      if (!ignore) {
        setPincodeMeta((current) => ({ ...current, pickup: { ...result, loading: false } }));
      }
    });

    return () => {
      ignore = true;
    };
  }, [form.pickupPincode]);

  useEffect(() => {
    if (form.deliveryPincode.length !== 6) {
      setPincodeMeta((current) => ({
        ...current,
        delivery: { city: "", state: "", loading: false, message: "", tone: "muted" },
      }));
      return undefined;
    }

    let ignore = false;
    setPincodeMeta((current) => ({
      ...current,
      delivery: { ...current.delivery, loading: true, message: "", tone: "muted" },
    }));

    lookupPincode(form.deliveryPincode).then((result) => {
      if (!ignore) {
        setPincodeMeta((current) => ({ ...current, delivery: { ...result, loading: false } }));
      }
    });

    return () => {
      ignore = true;
    };
  }, [form.deliveryPincode]);

  const handleCalculate = async () => {
    setShowEstimate(true);
    setCouriers([]);
    setCalculatorError("");

    if (validationError) {
      setCalculatorError(validationError);
      return;
    }

    setCalculating(true);

    try {
      const payload = {
        origin: form.pickupPincode,
        destination: form.deliveryPincode,
        payment_type: form.paymentType === "COD" ? "cod" : "prepaid",
        weight: Math.max(Math.round(estimate.chargeableWeightKg * 1000), Number(form.weight) || 0),
      };

      if (Number(form.length) > 0) {
        payload.length = form.length;
      }

      if (Number(form.width) > 0) {
        payload.breadth = form.width;
      }

      if (Number(form.height) > 0) {
        payload.height = form.height;
      }

      if (form.paymentType === "COD") {
        payload.order_amount = form.shipmentValue;
      }

      const response = await fetch(`${COURIER_CART_API}/couriers/available-to-guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        if (Array.isArray(data?.data) && data.data.length > 0) {
          setCouriers(data.data.slice(0, 5));
        } else {
          setCalculatorError("Live courier rates are unavailable for these details. Showing an indicative estimate below.");
        }
      } else {
        setCalculatorError(data?.error || "Live courier rates are unavailable right now. Showing an indicative estimate below.");
      }
    } catch (error) {
      console.error(error);
      setCalculatorError("Live courier rates are unavailable right now. Showing an indicative estimate below.");
    } finally {
      setCalculating(false);
    }
  };

  const renderPincodeMeta = (meta) => {
    if (meta.loading) {
      return <p className="ml-1.5 mt-1 text-sm text-slate-500">Loading...</p>;
    }

    if (meta.city) {
      return (
        <p className="ml-1.5 mt-1 text-sm text-slate-500">
          {meta.city}, {meta.state}
        </p>
      );
    }

    if (!meta.message) {
      return null;
    }

    const toneClass = meta.tone === "error" ? "text-red-500" : "text-slate-500";

    return <p className={`ml-1.5 mt-1 text-sm ${toneClass}`}>{meta.message}</p>;
  };

  const renderMode = (mode) => {
    if (!mode) {
      return "-";
    }

    const iconName = mode.toLowerCase() === "air" ? "rocket" : mode.toLowerCase() === "surface" ? "truck" : "route";

    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-slate-800">
        <Icon name={iconName} className="h-4 w-4 text-sky-700" />
        {mode}
      </span>
    );
  };

  return (
    <MotionArticle
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ duration: 0.25 }}
      className={`${className} h-full min-w-0`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Icon name="wallet" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-2xl text-slate-900">Rate Calculator</h3>
            <p className="mt-1 text-sm text-slate-500">
              Check available courier partners and live guest rates with pickup, delivery, weight, and dimensions.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-amber-200 hover:bg-amber-50 sm:w-auto"
        >
          Reset
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <Field
            label="Pick-up Area Pincode"
            name="pickupPincode"
            value={form.pickupPincode}
            onChange={handleChange}
            placeholder="Enter pickup pincode"
          />
          {renderPincodeMeta(pincodeMeta.pickup)}
        </div>
        <div>
          <Field
            label="Delivery Area Pincode"
            name="deliveryPincode"
            value={form.deliveryPincode}
            onChange={handleChange}
            placeholder="Enter delivery pincode"
          />
          {renderPincodeMeta(pincodeMeta.delivery)}
        </div>
        <Field
          label="Actual Weight"
          name="weight"
          type="number"
          value={form.weight}
          onChange={handleChange}
          placeholder="Enter actual weight"
          postfix="GM"
        />
        <Field label="Length" name="length" type="number" value={form.length} onChange={handleChange} placeholder="Enter length" postfix="CM" />
        <Field label="Width" name="width" type="number" value={form.width} onChange={handleChange} placeholder="Enter width" postfix="CM" />
        <Field label="Height" name="height" type="number" value={form.height} onChange={handleChange} placeholder="Enter height" postfix="CM" />
        <Field
          label="Shipment Value"
          name="shipmentValue"
          type="number"
          value={form.shipmentValue}
          onChange={handleChange}
          placeholder="Enter shipment value"
          postfix="Rs"
        />
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          <span>Payment Type</span>
          <select
            className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
            name="paymentType"
            value={form.paymentType}
            onChange={handleChange}
          >
            {paymentTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        disabled={calculating}
        onClick={handleCalculate}
        className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#8FD8FF_0%,#FFD8A8_100%)] px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {calculating ? "Calculating..." : "Calculate"}
      </button>

      {calculatorError ? <p className="mt-4 text-sm font-semibold text-red-500">{calculatorError}</p> : null}

      {showEstimate && estimate.chargeableWeightKg > 0 ? (
        <div className="mt-6 grid min-w-0 gap-4 border-t border-slate-200 pt-6 md:grid-cols-3">
          <div className="border-l-4 border-amber-300 pl-4 text-slate-900">
            <p className="text-sm text-slate-600">Indicative estimate</p>
            <p className="mt-3 break-words font-display text-3xl sm:text-4xl">{formatCurrency(estimate.estimatedCost)}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Built from chargeable weight, delivery zone, and payment type so the calculator still returns a rate
              when live courier quotes are unavailable.
            </p>
          </div>
          <div className="border-l-4 border-sky-300 pl-4 text-slate-900">
            <p className="text-sm text-slate-500">Billable weight</p>
            <p className="mt-3 font-display text-2xl sm:text-3xl">{estimate.chargeableWeightKg.toFixed(2)} kg</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Actual: {estimate.actualWeightKg.toFixed(2)} kg
              <br />
              Volumetric: {estimate.volumetricWeightKg.toFixed(2)} kg
            </p>
          </div>
          <div className="border-l-4 border-emerald-300 pl-4 text-slate-900">
            <p className="text-sm text-slate-500">Zone and ETA</p>
            <p className="mt-3 font-display text-2xl sm:text-3xl">{estimate.zoneLabel}</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">Estimated transit: {estimate.eta}</p>
          </div>
        </div>
      ) : null}

      {couriers.length > 0 ? (
        <div className="mt-6 max-w-full overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
          <table className="w-full min-w-[700px] table-auto text-left">
            <thead className="bg-sky-50 text-slate-900">
              <tr>
                <th className="px-4 py-3 font-semibold">Courier Partner</th>
                <th className="px-4 py-3 font-semibold">Mode</th>
                <th className="px-4 py-3 font-semibold">Chargeable Weight</th>
                <th className="px-4 py-3 font-semibold">Rate</th>
              </tr>
            </thead>
            <tbody>
              {couriers.map((courier, index) => {
                const rateDetails = getCourierRateDetails(courier);

                return (
                  <motion.tr
                    key={`${getCourierName(courier)}-${index}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * index }}
                    className="border-b border-slate-100 bg-white last:border-b-0"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-slate-900">
                      <span className="flex items-center gap-2">
                        <Icon name="package" className="h-4 w-4 text-sky-700" />
                        {getCourierName(courier)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{renderMode(rateDetails.mode)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {formatChargeableWeight(courier?.chargeable_weight)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-amber-700">
                      {formatCurrency(rateDetails.rate)}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          <button
            type="button"
            className="m-4 inline-flex items-center justify-center rounded-2xl border border-sky-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:bg-sky-50"
            onClick={() => window.open(CLIENT_RATE_CALCULATOR_URL, "_blank", "noopener,noreferrer")}
          >
            Get Full Rate Card
          </button>
        </div>
      ) : null}
    </MotionArticle>
  );
}

function ToolPreview({ title, description, icon, fields, buttonLabel, to, accentClass }) {
  return (
    <MotionArticle whileHover={{ y: -6, scale: 1.01 }} transition={{ duration: 0.25 }} className="surface-card h-full rounded-[2rem] p-6">
      <div className="flex items-start gap-4">
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accentClass}`}>
          <Icon name={icon} />
        </span>
        <div>
          <h3 className="font-display text-2xl text-slate-900">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>

      <div className="mt-6 rounded-[1.75rem] border border-stone-200 bg-[#fffdf7] p-4">
        <div className="grid gap-3">
          {fields.map((field) => (
            <div key={field} className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-slate-400">
              {field}
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
          <span className="text-sm font-medium text-slate-500">Open full tool</span>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f3d971] text-slate-900 shadow-[0_12px_24px_rgba(215,188,77,0.22)]">
            <Icon name="arrowUpRight" className="h-4.5 w-4.5" />
          </span>
        </div>
      </div>

      <Link
        to={to}
        className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 transition hover:text-slate-700"
      >
        <span className="border-b border-slate-900 pb-0.5">{buttonLabel}</span>
        <Icon name="arrowUpRight" className="h-4 w-4" />
      </Link>
    </MotionArticle>
  );
}

export function ShippingToolPlaceholders() {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Reveal delay={0.08}>
        <ToolPreview
          title="Weight Calculator"
          description="Work out volumetric and billable weight using carton dimensions and your preferred divisor."
          icon="calculator"
          accentClass="bg-sky-100 text-sky-700"
          fields={["Enter length", "Enter width", "Enter height", "Enter divisor"]}
          buttonLabel="Open Weight Calculator"
          to="/volumetric-weight-calculator"
        />
      </Reveal>
      <Reveal delay={0.14}>
        <ToolPreview
          title="Rate Calculator"
          description="Estimate shipping charges by zone, service level, weight, and optional COD handling."
          icon="wallet"
          accentClass="bg-amber-100 text-amber-700"
          fields={["Enter weight", "Select zone", "Select service level", "Select COD handling"]}
          buttonLabel="Open Rate Calculator"
          to="/rate-calculator"
        />
      </Reveal>
    </div>
  );
}

export function TrackingPanel() {
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const queryAwb = normalizeAwb(urlParams.get("awb"));
  const queryOrderId = normalizeAwb(urlParams.get("orderId") || urlParams.get("order_id") || urlParams.get("orderNumber"));
  const storedTracking = readStoredValue(TRACKING_STORAGE_KEY, {
    awb: "SRX-2048127",
    searched: "SRX-2048127",
    mode: "AWB",
  });
  const storedRecentSearches = readStoredValue(RECENT_TRACKING_STORAGE_KEY, []);
  const initialQuery = queryAwb || queryOrderId || location.state?.query || storedTracking.awb || "SRX-2048127";
  const initialMode = queryAwb ? "AWB" : queryOrderId ? "Order ID" : normalizeTrackingMode(location.state?.mode || storedTracking.mode);
  const [awb, setAwb] = useState(initialQuery);
  const [searched, setSearched] = useState(queryAwb || queryOrderId || location.state?.query || storedTracking.searched || initialQuery);
  const [mode, setMode] = useState(initialMode);
  const [trackingData, setTrackingData] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [recentSearches, setRecentSearches] = useState(() =>
    Array.isArray(storedRecentSearches) ? storedRecentSearches.slice(0, 5) : []
  );
  const previewTimeline = useMemo(
    () =>
      trackingStatuses.map((status, index) => ({
        ...status,
        complete: index < 3,
        active: index === 2,
      })),
    []
  );
  const timeline = useMemo(() => buildTrackingTimeline(trackingData, previewTimeline), [trackingData, previewTimeline]);
  const latestTimelineItem = timeline[0];
  const activeLookupType = trackingData ? getTrackingSearchType(searched, trackingData) : mode;
  const latestUpdateText = trackingData
    ? getTrackingLatestUpdate(trackingData, trackingError)
    : trackingLoading
      ? "Fetching live tracking details..."
      : trackingError || "Search with an AWB or Order ID to load the shipment journey.";
  const latestUpdateTime = trackingData?.history?.[0]?.event_time
    ? formatTrackingDateTime(trackingData.history[0].event_time)
    : "";

  const loadTracking = async (nextAwb, lookupMode = mode) => {
    const normalized = normalizeAwb(nextAwb);
    if (!normalized) return;
    const isOrderLookup = normalizeTrackingMode(lookupMode) === "Order ID" || looksLikeOrderIdentifier(normalized);
    const queryKey = isOrderLookup ? "orderId" : "awb";

    setTrackingLoading(true);
    setTrackingError("");
    setTrackingData(null);
    try {
      const response = await fetch(`${COURIER_CART_API}/public/tracking?${queryKey}=${encodeURIComponent(normalized)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success || !payload?.data) {
        throw new Error(payload?.message || `Tracking details are not available for this ${isOrderLookup ? "Order ID" : "AWB"} yet.`);
      }
      setTrackingData(payload.data);
      const nextSearched = payload.data.awb_number || payload.data.order_id || payload.data.order_number || normalized;
      const nextMode = getTrackingSearchType(normalized, payload.data);
      const nextRecent = {
        id: nextSearched,
        type: nextMode,
        awb: payload.data.awb_number || "",
        orderId: payload.data.order_id || payload.data.order_number || "",
        courier: payload.data.courier_name || "Courier",
        status: payload.data.status || "Status updated",
        latestUpdate: getTrackingLatestUpdate(payload.data),
        updatedAt: payload.data.history?.[0]?.event_time || new Date().toISOString(),
      };
      setSearched(nextSearched);
      setMode(nextMode);
      setRecentSearches((previous) => {
        const filtered = previous.filter(
          (item) => normalizeAwb(item.awb || item.id) !== normalizeAwb(nextRecent.awb || nextRecent.id)
        );
        return [nextRecent, ...filtered].slice(0, 5);
      });
    } catch (error) {
      setTrackingError(error?.message || "Tracking details are not available right now.");
      setSearched(normalized);
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    loadTracking(awb || "SRX-2048127", mode);
  };

  useEffect(() => {
    if (queryAwb) {
      setAwb(queryAwb);
      setMode("AWB");
      loadTracking(queryAwb, "AWB");
    } else if (queryOrderId) {
      setAwb(queryOrderId);
      setMode("Order ID");
      loadTracking(queryOrderId, "Order ID");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryAwb, queryOrderId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify({ awb, searched, mode }));
    } catch {
      // Tracking still works without local storage.
    }
  }, [awb, searched, mode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RECENT_TRACKING_STORAGE_KEY, JSON.stringify(recentSearches));
    } catch {
      // Tracking still works without local storage.
    }
  }, [recentSearches]);

  return (
    <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
      <Reveal delay={0.05}>
        <MotionForm
          transition={{ duration: 0.25 }}
          onSubmit={handleSubmit}
          className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_22px_70px_rgba(15,23,42,0.12)] sm:rounded-[2rem] sm:p-6"
        >
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#073b4c] text-white shadow-lg shadow-sky-900/20">
              <Icon name="route" />
            </span>
            <div>
              <h3 className="font-display text-2xl text-slate-900">Shipment tracking</h3>
              <p className="mt-1 text-sm font-medium text-slate-600">
                Search with an AWB or Order ID. Repeated scans are grouped so the latest movement is easier to read.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-3 gap-y-3 text-sm font-semibold text-slate-800">
            {["AWB", "Order ID"].map((option) => (
              <label
                key={option}
                className={[
                  "flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 transition",
                  mode === option ? "border-[#073b4c] bg-[#073b4c] text-white" : "border-slate-200 bg-slate-50 text-slate-700",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="trackingType"
                  className="h-4 w-4 accent-[#f47d21]"
                  checked={mode === option}
                  onChange={() => setMode(option)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field
              label={mode === "Order ID" ? "Order ID" : "AWB number"}
              name="awb"
              value={awb}
              onChange={(event) => setAwb(event.target.value)}
              placeholder={mode === "Order ID" ? "Enter order id" : "Enter AWB number"}
            />
            <button
              type="submit"
              className="mt-auto inline-flex h-[52px] items-center justify-center rounded-2xl bg-[#f47d21] px-6 text-sm font-extrabold text-white shadow-lg shadow-orange-500/25 transition hover:bg-[#df6610]"
            >
              Search
            </button>
          </div>

          <div className="mt-6 rounded-[1.75rem] border border-[#0f5063]/15 bg-[linear-gradient(135deg,#082f3f,#0f5063)] px-5 py-5 text-white shadow-xl shadow-slate-900/18">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white/78">Latest lookup</p>
                <p className="mt-2 break-all font-display text-2xl sm:text-3xl">{searched}</p>
                <p className="mt-1 text-xs font-extrabold uppercase tracking-[0.22em] text-[#ffd29f]">{activeLookupType}</p>
              </div>
              <span className="w-fit rounded-full bg-white/14 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.18em] text-white">
                {trackingData?.courier_name || "Courier"}
              </span>
            </div>
            <p className="mt-4 text-sm font-semibold leading-6 text-white">
              {trackingData ? `${trackingData.status || "Status updated"} — ${latestUpdateText}` : latestUpdateText}
            </p>
            {latestUpdateTime ? <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-white/65">Last update {latestUpdateTime}</p> : null}
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-700">Recent searches</p>
              <span className="rounded-full bg-white px-2.5 py-1 text-[0.68rem] font-bold text-slate-500">AWB / Order ID</span>
            </div>
            <div className="mt-3 grid gap-2">
              {recentSearches.length ? (
                recentSearches.map((item) => (
                  <button
                    type="button"
                    key={`${item.awb || item.id}-${item.updatedAt}`}
                    onClick={() => {
                      const nextMode = item.type || "AWB";
                      setAwb(item.awb || item.orderId || item.id);
                      setMode(nextMode);
                      loadTracking(item.awb || item.orderId || item.id, nextMode);
                    }}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-[#f47d21] hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="break-all text-sm font-extrabold text-slate-900">{item.awb || item.orderId || item.id}</p>
                      <span className="rounded-full bg-[#e8f6fa] px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-[#047b85]">
                        {item.type || "AWB"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs font-medium text-slate-600">
                      {item.status} • {item.latestUpdate}
                    </p>
                    <p className="mt-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">
                      {formatTrackingDateTime(item.updatedAt)}
                    </p>
                  </button>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-medium text-slate-500">
                  Your latest AWB or Order ID searches will appear here with their last update.
                </p>
              )}
            </div>
          </div>
        </MotionForm>
      </Reveal>

      <Reveal delay={0.12}>
        <MotionArticle
          transition={{ duration: 0.25 }}
          className="relative overflow-hidden rounded-[1.6rem] border border-[#073b4c]/15 bg-white p-5 shadow-[0_26px_80px_rgba(15,23,42,0.16)] sm:rounded-[2rem] sm:p-6"
        >
          <div className="absolute right-4 top-4 hidden rounded-full bg-[#fff4e8] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#c45508] shadow-sm sm:block">
            Look here for updates →
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-[#047b85]">Tracking timeline</p>
              <h3 className="mt-2 font-display text-2xl text-slate-900">
                {trackingData ? "Latest movement first" : "Delivery journey snapshot"}
              </h3>
              <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-600">
                The newest scan is highlighted below. Duplicate scans with the same status, place, and time are hidden.
              </p>
            </div>
            <span className="w-fit rounded-full bg-[#073b4c] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-white">
              {trackingData?.status || (trackingLoading ? "Loading" : "Preview")}
            </span>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-[#f47d21]/30 bg-[#fff8f1] p-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#b64b05]">Latest update</p>
            <p className="mt-2 text-base font-extrabold text-slate-950">{latestTimelineItem?.title || trackingData?.status || "No update yet"}</p>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-700">{latestTimelineItem?.detail || latestUpdateText}</p>
            {latestTimelineItem?.time ? (
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                {formatTrackingDateTime(latestTimelineItem.time)}
              </p>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4">
            {timeline.map((item, index) => (
              <div
                key={`${item.title}-${item.time || index}`}
                className={[
                  "flex gap-4 rounded-[1.5rem] border px-4 py-4 shadow-sm",
                  item.active
                    ? "border-[#f47d21]/45 bg-[#fff8f1] shadow-orange-100"
                    : "border-slate-200 bg-white",
                ].join(" ")}
              >
                <span
                  className={[
                    "mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                    item.active
                      ? "bg-[#f47d21] text-white"
                      : item.complete
                        ? "bg-[#e8f6fa] text-[#047b85]"
                        : "bg-slate-100 text-slate-500",
                  ].join(" ")}
                >
                  <Icon name={item.complete ? "shield" : "route"} className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    {item.active ? (
                      <span className="rounded-full bg-[#f47d21] px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-[0.2em] text-white">
                        Latest
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{item.detail}</p>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                    {item.time ? formatTrackingDateTime(item.time) : `Step 0${index + 1}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </MotionArticle>
      </Reveal>
    </div>
  );
}
