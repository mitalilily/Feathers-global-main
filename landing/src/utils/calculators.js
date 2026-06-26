export function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function calculateVolumetricWeight({
  length,
  width,
  height,
  divisor = 5000,
}) {
  const numericLength = Number(length) || 0
  const numericWidth = Number(width) || 0
  const numericHeight = Number(height) || 0
  const numericDivisor = Number(divisor) || 5000

  if (
    numericLength <= 0 ||
    numericWidth <= 0 ||
    numericHeight <= 0 ||
    numericDivisor <= 0
  ) {
    return 0
  }

  return roundTo((numericLength * numericWidth * numericHeight) / numericDivisor)
}

export function calculateBillableWeight(actualWeight, volumetricWeight) {
  return roundTo(Math.max(Number(actualWeight) || 0, Number(volumetricWeight) || 0))
}

const baseRateByZone = {
  local: 55,
  regional: 75,
  national: 110,
  remote: 160,
}

const multiplierByService = {
  standard: 1,
  express: 1.35,
  priority: 1.75,
}

const perKgByZone = {
  local: 24,
  regional: 30,
  national: 42,
  remote: 58,
}

export function calculateRateEstimate({
  zone,
  service,
  billableWeight,
  codEnabled,
}) {
  const selectedZone = zone in baseRateByZone ? zone : 'national'
  const selectedService = service in multiplierByService ? service : 'standard'
  const weight = Math.max(Number(billableWeight) || 0, 0.5)

  const baseRate =
    baseRateByZone[selectedZone] * multiplierByService[selectedService]
  const weightCharge =
    Math.max(weight - 0.5, 0) * perKgByZone[selectedZone] * multiplierByService[selectedService]
  const subtotal = baseRate + weightCharge
  const fuelSurcharge = subtotal * 0.08
  const codCharge = codEnabled ? 35 : 0
  const total = subtotal + fuelSurcharge + codCharge

  return {
    baseRate: roundTo(baseRate),
    weightCharge: roundTo(weightCharge),
    fuelSurcharge: roundTo(fuelSurcharge),
    codCharge: roundTo(codCharge),
    total: roundTo(total),
  }
}
