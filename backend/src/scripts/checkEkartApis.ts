import assert from 'node:assert/strict'
import http, { IncomingMessage, ServerResponse } from 'node:http'
import { AddressInfo } from 'node:net'

type CapturedRequest = {
  method: string
  url: string
  authorization?: string
  body: any
}

const readJsonBody = async (req: IncomingMessage) =>
  new Promise<any>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('error', reject)
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve(null)
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
  })

const sendJson = (res: ServerResponse, statusCode: number, body: Record<string, any>) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const startMockEkartServer = async () => {
  const captured: CapturedRequest[] = []

  const server = http.createServer(async (req, res) => {
    try {
      const body = await readJsonBody(req)
      const url = req.url || ''
      captured.push({
        method: req.method || '',
        url,
        authorization: req.headers.authorization,
        body,
      })

      if (req.method === 'POST' && url === '/integrations/v2/auth/token/mock-client') {
        assert.equal(body?.username, 'mock-user')
        assert.equal(body?.password, 'mock-pass')
        return sendJson(res, 200, {
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        })
      }

      if (req.method === 'POST' && url === '/data/v3/serviceability') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        assert.equal(body?.pickupPincode, '560103')
        assert.equal(body?.dropPincode, '110001')
        assert.equal(body?.paymentType, 'COD')
        assert.equal(body?.invoiceAmount, '499')
        return sendJson(res, 200, {
          status: 'success',
          data: {
            serviceability: {
              forward: { pickup: true, drop: true },
              payment_modes: { cod: true, prepaid: true },
              tat: { min: 2, max: 4 },
              forwardDeliveredCharges: 55,
            },
          },
        })
      }

      if (req.method === 'PUT' && url === '/api/v1/package/create') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        assert.equal(body?.pickup_location?.name, 'BLR Warehouse')
        assert.equal(body?.pickup?.pincode, 560103)
        assert.equal(body?.drop?.pincode, 110001)
        assert.equal(body?.weight, 0.5)
        return sendJson(res, 200, {
          status: true,
          tracking_id: 'EKARTMOCK123',
          shipment_id: 'SHIPMOCK123',
          manifest: 'MANIFESTMOCK123',
        })
      }

      return sendJson(res, 404, { message: `Unhandled mock endpoint ${req.method} ${url}` })
    } catch (error: any) {
      return sendJson(res, 500, { message: error?.message || String(error) })
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    captured,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  }
}

const main = async () => {
  const mock = await startMockEkartServer()

  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres'
  process.env.EKART_BASE_API = mock.baseUrl
  process.env.EKART_BASE_AUTH = mock.baseUrl
  process.env.EKART_CLIENT_ID = 'mock-client'
  process.env.EKART_USERNAME = 'mock-user'
  process.env.EKART_PASSWORD = 'mock-pass'
  process.env.EKART_SERVICEABILITY_BASE_API = mock.baseUrl
  process.env.EKART_SERVICEABILITY_ENDPOINTS = '/data/v3/serviceability'
  process.env.EKART_ADDRESS_BASE_API = mock.baseUrl

  try {
    const { EkartService } = await import('../models/services/couriers/ekart.service')
    ;(EkartService as any).cachedConfig = null

    const ekart = new EkartService()
    const serviceability = await ekart.checkServiceability({
      pickupPincode: '560103',
      dropPincode: '110001',
      length: '10',
      height: '10',
      width: '10',
      weight: '0.5',
      paymentType: 'COD',
      invoiceAmount: '499',
      codAmount: '499',
    })

    assert.equal(serviceability.serviceable, true)
    assert.equal(serviceability.codAvailable, true)
    assert.equal(serviceability.prepaidAvailable, true)
    assert.equal(serviceability.tat, 2)

    const shipment = await ekart.createShipment({
      order_number: 'EKART_TEST_ORDER',
      payment_type: 'cod',
      order_amount: 499,
      package_weight: 500,
      package_length: 10,
      package_breadth: 10,
      package_height: 10,
      pickup_location_alias: 'BLR Warehouse',
      company: { name: 'Shiplifi Test', gst: '' },
      consignee: {
        name: 'Test Buyer',
        address: 'Connaught Place',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110001',
        phone: '9876543210',
        email: 'buyer@example.com',
      },
      pickup: {
        warehouse_name: 'BLR Warehouse',
        name: 'Ops User',
        address: 'Embassy Tech Village',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560103',
        phone: '9876543210',
      },
      rto: {
        warehouse_name: 'BLR Warehouse',
        name: 'Ops User',
        address: 'Embassy Tech Village',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560103',
        phone: '9876543210',
      },
      order_items: [
        {
          name: 'Test Product',
          sku: 'SKU-1',
          qty: 1,
          price: 499,
          hsn: '1234',
          discount: 0,
          tax_rate: 0,
        },
      ],
    })

    assert.equal(shipment.tracking_id, 'EKARTMOCK123')

    const summary = {
      authCalls: mock.captured.filter((req) => req.url.includes('/auth/token')).length,
      serviceabilityCalls: mock.captured.filter((req) => req.url === '/data/v3/serviceability').length,
      shipmentCalls: mock.captured.filter((req) => req.url === '/api/v1/package/create').length,
      serviceable: serviceability.serviceable,
      trackingId: shipment.tracking_id,
    }

    console.log('Ekart integration mock checks passed')
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await mock.close()
  }
}

main().catch((error) => {
  console.error('Ekart integration mock checks failed')
  console.error(error)
  process.exit(1)
})
