const INDIA_TIMEZONE_OFFSET = '+05:30'
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const assertValidDateOnly = (value: string) => {
  const match = value.match(DATE_ONLY_PATTERN)
  if (!match) throw new Error(`Invalid order date: ${value}`)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = new Date(Date.UTC(year, month - 1, day))

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error(`Invalid order date: ${value}`)
  }
}

export const toIndiaOrderDateBoundary = (value: string, boundary: 'start' | 'end') => {
  const normalized = String(value || '').trim()
  assertValidDateOnly(normalized)

  const time = boundary === 'start' ? '00:00:00.000' : '23:59:59.999'
  return new Date(`${normalized}T${time}${INDIA_TIMEZONE_OFFSET}`)
}

export const validateIndiaOrderDateRange = (fromDate?: string, toDate?: string) => {
  const from = fromDate ? toIndiaOrderDateBoundary(fromDate, 'start') : null
  const to = toDate ? toIndiaOrderDateBoundary(toDate, 'end') : null

  if (from && to && from.getTime() > to.getTime()) {
    throw new Error('From Date cannot be after To Date')
  }

  return { from, to }
}
