import assert from 'node:assert/strict'
import http, { IncomingMessage, ServerResponse } from 'node:http'
import { AddressInfo } from 'node:net'

type CapturedRequest = {
  method: string
  url: string
  authorization?: string
  body: any
}

const FORWARD_AWB = 'SFXFW1234567890'
const WAREHOUSE_AWB = 'SFXWH1234567890'
const FALLBACK_AWB = 'SFXFB1234567890'
const REVERSE_REQUEST_ID = 'R-SFX1234567890'

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

const sendJson = (res: ServerResponse, statusCode: number, body: Record<string, any> | any[]) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const requireShadowfaxToken = (req: IncomingMessage) => {
  assert.equal(req.headers.authorization, 'Token mock-shadowfax-token')
}

const getQuery = (url: string) => new URL(url, 'http://127.0.0.1')

const startMockShadowfaxServer = async () => {
  const captured: CapturedRequest[] = []

  const server = http.createServer(async (req, res) => {
    try {
      const body = await readJsonBody(req)
      const url = req.url || ''
      const parsed = getQuery(url)
      captured.push({
        method: req.method || '',
        url,
        authorization: req.headers.authorization,
        body,
      })

      if (req.method !== 'GET' || parsed.pathname !== '/v1/clients/serviceability/') {
        requireShadowfaxToken(req)
      } else {
        requireShadowfaxToken(req)
        const service = parsed.searchParams.get('service')
        const pincodes = parsed.searchParams.get('pincodes')
        assert.equal(parsed.searchParams.get('page'), '1')
        assert.equal(parsed.searchParams.get('count'), '1')

        if (service === 'seller_pickup' && pincodes === '122001') {
          return sendJson(res, 200, {
            data: {
              pincodes: [{ code: '122001', services: ['seller_pickup'] }],
            },
          })
        }

        if (service === 'warehouse_pickup' && pincodes === '122001') {
          return sendJson(res, 200, {
            data: {
              pincodes: [{ code: '122001', services: ['warehouse_pickup'] }],
            },
          })
        }

        if (service === 'warehouse_pickup' && pincodes === '302012') {
          return sendJson(res, 200, {
            data: {
              pincodes: [{ code: '302012', services: ['dc_pickup', 'large_dc_pickup'] }],
            },
          })
        }

        if (service === 'warehouse_pickup' && pincodes === '560001') {
          return sendJson(res, 200, {
            data: {
              pincodes: [{ code: '560001', services: ['surface', 'warehouse_pickup'] }],
            },
          })
        }

        if (service === 'warehouse_pickup' && pincodes === '560002') {
          return sendJson(res, 200, {
            data: {
              pincodes: [{ code: '560002', available: true }],
            },
          })
        }

        if (service === 'customer_delivery' && pincodes === '400001') {
          return sendJson(res, 200, [
            {
              code: '400001',
              services: ['customer_delivery', 'cod'],
            },
          ])
        }

        if (service === 'customer_delivery' && pincodes === '305813') {
          return sendJson(res, 200, [
            {
              code: '305813',
              services: ['Large', 'Regular'],
            },
          ])
        }

        if (service === 'customer_delivery' && pincodes === '600001') {
          return sendJson(res, 200, [
            {
              code: '600001',
              services: ['surface', 'Regular'],
            },
          ])
        }

        if (service === 'seller_pickup' && pincodes === '560002') {
          return sendJson(res, 200, {
            data: {
              pincodes: [{ code: '560002', services: ['seller_pickup'] }],
            },
          })
        }

        if (service === 'customer_delivery' && pincodes === '560003') {
          return sendJson(res, 200, {
            data: {
              pincodes: [{ code: '560003', available: true }],
            },
          })
        }

        if (service === 'customer_pickup' && pincodes === '400001') {
          return sendJson(res, 200, {
            results: [
              {
                pincode: '400001',
                serviceable: true,
                service: 'customer_pickup',
              },
            ],
          })
        }

        if (service === 'warehouse_return' && pincodes === '122001') {
          return sendJson(res, 200, {
            '122001': {
              pincode: '122001',
              available: true,
              services: 'warehouse_return',
            },
          })
        }

        return sendJson(res, 200, [])
      }

      if (req.method === 'POST' && parsed.pathname === '/v3/clients/generate_marketplace_awb/') {
        assert.equal(body?.count, 1)
        return sendJson(res, 200, {
          success: true,
          data: {
            awb_numbers: ['SFXPREALLOCATEDFW'],
          },
        })
      }

      if (req.method === 'POST' && parsed.pathname === '/v3/clients/orders/generate_awb/') {
        assert.equal(body?.count, 1)
        return sendJson(res, 200, {
          success: true,
          data: {
            awb_numbers: ['SFXPREALLOCATEDREV'],
          },
        })
      }

      if (req.method === 'POST' && parsed.pathname === '/v3/clients/orders/') {
        assert(['marketplace', 'warehouse'].includes(body?.order_type))
        const clientOrderId = body?.order_details?.client_order_id
        assert(['SFX_TEST_ORDER', 'SFX_SURFACE_RETRY_ORDER'].includes(clientOrderId))

        if (clientOrderId === 'SFX_SURFACE_RETRY_ORDER') {
          assert.equal(body?.order_type, 'warehouse')
          assert.equal(body?.order_details?.payment_mode, 'Prepaid')
          assert.equal(body?.customer_details?.pincode, 600001)
          assert.equal(body?.pickup_details?.pincode, 560001)
          assert.equal(body?.rto_details?.pincode, 560001)

          if (body?.order_details?.order_service === 'surface') {
            return sendJson(res, 200, {
              message: 'Failure',
              errors: 'Invalid Pickup Pincode. Pickup pincode 560001 is not serviceable',
            })
          }

          assert.equal(body?.order_details?.order_service, 'regular')
          return sendJson(res, 200, {
            success: true,
            data: {
              id: 993,
              client_order_id: 'SFX_SURFACE_RETRY_ORDER',
              awb_number: FALLBACK_AWB,
              status: 'created',
              sort_code: 'BLR/REG',
            },
          })
        }

        assert.equal(body?.order_details?.payment_mode, 'COD')
        assert.equal(body?.customer_details?.pincode, 400001)
        assert.equal(body?.pickup_details?.pincode, 122001)
        assert.equal(body?.rto_details?.pincode, 122001)
        assert.equal(body?.product_details?.[0]?.sku_id, 'SKU-SFX-1')

        if (body?.order_type === 'warehouse') {
          assert.equal(body?.warehouse_details?.pincode, 122001)
          assert.equal(body?.origin_details?.pincode, 122001)
          return sendJson(res, 200, {
            success: true,
            data: {
              id: 992,
              client_order_id: 'SFX_TEST_ORDER',
              awb: WAREHOUSE_AWB,
              status: 'created',
              sort_code: 'BOM/WH',
            },
          })
        }

        return sendJson(res, 200, {
          success: true,
          data: {
            id: 991,
            client_order_id: 'SFX_TEST_ORDER',
            awb_number: FORWARD_AWB,
            status: 'created',
            sort_code: 'BOM/TEC',
          },
        })
      }

      if (req.method === 'POST' && parsed.pathname === '/v3/clients/requests') {
        assert.equal(body?.client_order_number, 'SFX_TEST_ORDER')
        assert.equal(body?.destination_pincode, 122001)
        assert.equal(body?.address_attributes?.pincode, 400001)
        assert.equal(body?.skus_attributes?.[0]?.client_sku_id, 'SKU-SFX-1')
        return sendJson(res, 200, {
          success: true,
          client_request_id: REVERSE_REQUEST_ID,
          awb_number: REVERSE_REQUEST_ID,
          status: 'created',
        })
      }

      if (req.method === 'GET' && parsed.pathname === `/v4/clients/orders/${FORWARD_AWB}/track/`) {
        return sendJson(res, 200, {
          success: true,
          data: {
            awb_number: FORWARD_AWB,
            current_status: 'in_transit',
            state_histories: [
              {
                status: 'created',
                comment: 'Order created',
                current_location: 'Gurgaon',
                created_at: '2026-05-17T10:00:00.000Z',
              },
              {
                status: 'in_transit',
                comment: 'Shipment picked up',
                current_location: 'Mumbai',
                created_at: '2026-05-17T18:00:00.000Z',
              },
            ],
          },
        })
      }

      if (req.method === 'POST' && parsed.pathname === '/v4/clients/bulk_track/') {
        assert.deepEqual(body?.awb_numbers, [FORWARD_AWB])
        return sendJson(res, 200, {
          success: true,
          data: [
            {
              awb_number: FORWARD_AWB,
              status: 'in_transit',
            },
          ],
        })
      }

      if (req.method === 'GET' && parsed.pathname === `/v4/clients/requests/${REVERSE_REQUEST_ID}`) {
        return sendJson(res, 200, {
          success: true,
          data: {
            client_request_id: REVERSE_REQUEST_ID,
            status: 'pickup_scheduled',
            pickup_request_state_histories: [
              {
                state: 'created',
                comment: 'Reverse pickup created',
                current_location: 'Mumbai',
                created_at: '2026-05-17T12:00:00.000Z',
              },
            ],
          },
        })
      }

      if (req.method === 'POST' && parsed.pathname === '/v4/clients/requests/bulk_query') {
        assert.deepEqual(body?.request_ids, [REVERSE_REQUEST_ID])
        return sendJson(res, 200, {
          success: true,
          data: [
            {
              client_request_id: REVERSE_REQUEST_ID,
              status: 'pickup_scheduled',
            },
          ],
        })
      }

      if (req.method === 'POST' && parsed.pathname === '/v3/clients/order_update/') {
        assert.equal(body?.awb_number, FORWARD_AWB)
        assert.equal(body?.action, 'RE-ATTEMPT')
        return sendJson(res, 200, {
          success: true,
          message: 'Order update accepted',
        })
      }

      if (req.method === 'POST' && parsed.pathname === '/v1/clients/order_update/') {
        assert.equal(body?.request_id, REVERSE_REQUEST_ID)
        return sendJson(res, 200, {
          success: true,
          message: 'Reverse order update accepted',
        })
      }

      if (req.method === 'PUT' && parsed.pathname === '/v2/clients/requests/update_qc/') {
        assert.equal(body?.awb_number, REVERSE_REQUEST_ID)
        assert.equal(body?.qc_flag, true)
        return sendJson(res, 200, {
          success: true,
          message: 'QC flag updated',
        })
      }

      if (req.method === 'POST' && parsed.pathname === '/v3/clients/orders/cancel/') {
        assert.equal(body?.awb_number, FORWARD_AWB)
        return sendJson(res, 200, {
          success: true,
          message: 'Order cancelled',
        })
      }

      if (req.method === 'POST' && parsed.pathname === '/v2/clients/requests/mark_cancel') {
        assert.equal(body?.request_id, REVERSE_REQUEST_ID)
        return sendJson(res, 200, {
          success: true,
          message: 'Request cancelled',
        })
      }

      if (req.method === 'POST' && parsed.pathname === '/v1/clients/support/issue/') {
        assert.equal(body?.awb_number, FORWARD_AWB)
        assert.equal(body?.issue_category, 1)
        return sendJson(res, 200, {
          success: true,
          issue_id: 'SFX-ISSUE-1',
        })
      }

      if (req.method === 'POST' && parsed.pathname === '/v1/clients/pod_details/') {
        assert.deepEqual(body?.awb_numbers || body?.request_ids, [FORWARD_AWB])
        return sendJson(res, 200, {
          success: true,
          data: [
            {
              awb_number: FORWARD_AWB,
              pod_url: 'https://shadowfax.example/pod.pdf',
            },
          ],
        })
      }

      if (req.method === 'POST' && parsed.pathname === '/v2/clients/qr_code/generate/') {
        assert.equal(body?.client_order_id, 'SFX_TEST_ORDER')
        return sendJson(res, 200, {
          success: true,
          data: {
            qr_code: 'https://shadowfax.example/qr.png',
          },
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
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  }
}

const assertJsonResponse = (label: string, value: any) => {
  assert(value !== null && value !== undefined, `${label} returned empty response`)
  assert(
    Array.isArray(value) || typeof value === 'object',
    `${label} did not return a JSON object/array`,
  )
}

const buildShipmentPayload = (overrides: Record<string, any> = {}) => {
  const base = {
    order_number: 'SFX_TEST_ORDER',
    payment_type: 'cod',
    order_amount: 499,
    package_weight: 500,
    package_length: 10,
    package_breadth: 10,
    package_height: 10,
    pickup_location_id: 'NCR-WH',
    pickup: {
      warehouse_name: 'NCR Warehouse',
      name: 'Ops User',
      address: 'MG Road',
      address_2: '',
      city: 'Gurgaon',
      state: 'Haryana',
      pincode: '122001',
      phone: '9876543210',
    },
    rto: {
      warehouse_name: 'NCR Warehouse',
      name: 'Ops User',
      address: 'MG Road',
      address_2: '',
      city: 'Gurgaon',
      state: 'Haryana',
      pincode: '122001',
      phone: '9876543210',
    },
    consignee: {
      name: 'Test Buyer',
      address: 'Fort',
      address_2: '',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      phone: '9876543210',
      email: 'buyer@example.com',
    },
    company: {
      name: 'Shiplifi Test',
      gst: '27ABCDE1234F1Z5',
    },
    order_items: [
      {
        name: 'Test Product',
        sku: 'SKU-SFX-1',
        qty: 1,
        price: 499,
        hsn: '1234',
        tax_rate: 0,
      },
    ],
    invoice_number: 'INV-SFX-1',
  }

  return {
    ...base,
    ...overrides,
    pickup: { ...base.pickup, ...(overrides.pickup || {}) },
    rto: { ...base.rto, ...(overrides.rto || {}) },
    consignee: { ...base.consignee, ...(overrides.consignee || {}) },
    company: { ...base.company, ...(overrides.company || {}) },
    order_items: overrides.order_items || base.order_items,
  }
}

const main = async () => {
  const mock = await startMockShadowfaxServer()

  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres'
  process.env.SHADOWFAX_API_BASE = mock.baseUrl
  process.env.SHADOWFAX_QR_BASE = mock.baseUrl
  process.env.SHADOWFAX_API_TOKEN = 'mock-shadowfax-token'
  process.env.SHADOWFAX_CLIENT_NAME = 'Shiplifi Test'

  try {
    const { ShadowfaxService } = await import('../models/services/couriers/shadowfax.service')
    ;(ShadowfaxService as any).cachedConfig = null

    const shadowfax = new ShadowfaxService()
    const serviceability = await shadowfax.checkForwardServiceability({
      origin: '122001',
      destination: '400001',
      paymentType: 'cod',
      mode: 'marketplace',
    })
    assert.equal(serviceability.serviceable, true)
    assert.equal(serviceability.mode, 'marketplace')
    assert(serviceability.services.includes('customer_delivery'))

    const shadowfax360Serviceability = await shadowfax.checkForwardServiceability({
      origin: '122001',
      destination: '400001',
      paymentType: 'prepaid',
      mode: '360',
    })
    assert.equal(shadowfax360Serviceability.serviceable, true)
    assert.equal(shadowfax360Serviceability.mode, 'marketplace')

    const warehouseServiceability = await shadowfax.checkForwardServiceability({
      origin: '122001',
      destination: '400001',
      paymentType: 'prepaid',
      mode: 'warehouse',
    })
    assert.equal(warehouseServiceability.serviceable, true)
    assert.equal(warehouseServiceability.mode, 'warehouse')

    const surfaceServiceability = await shadowfax.checkForwardServiceability({
      origin: '302012',
      destination: '305813',
      paymentType: 'prepaid',
      mode: 'warehouse',
      service: 'surface',
    })
    assert.equal(surfaceServiceability.serviceable, true)
    assert.equal(surfaceServiceability.mode, 'warehouse')
    assert.equal(surfaceServiceability.service, 'surface')

    const relaxedServiceability = await shadowfax.checkForwardServiceability({
      origin: '560002',
      destination: '560003',
      paymentType: 'prepaid',
      mode: 'warehouse',
      service: 'surface',
    })
    assert.equal(relaxedServiceability.serviceable, true)
    assert.equal(relaxedServiceability.mode, 'warehouse')
    assert.equal(relaxedServiceability.service, 'surface')

    const reverseServiceability = await shadowfax.checkReverseServiceability({
      origin: '400001',
      destination: '122001',
    })
    assert.equal(reverseServiceability.serviceable, true)

    const forwardAwb = await shadowfax.generateForwardAwb(1)
    assertJsonResponse('generateForwardAwb', forwardAwb)
    assert.equal(forwardAwb?.data?.awb_numbers?.[0], 'SFXPREALLOCATEDFW')

    const reverseAwb = await shadowfax.generateReverseAwb(1)
    assertJsonResponse('generateReverseAwb', reverseAwb)
    assert.equal(reverseAwb?.data?.awb_numbers?.[0], 'SFXPREALLOCATEDREV')

    const forwardShipment = await shadowfax.createForwardShipment(buildShipmentPayload(), {
      mode: serviceability.mode || 'marketplace',
      service: 'surface',
    })
    assertJsonResponse('createForwardShipment', forwardShipment)
    assert.equal(forwardShipment?.data?.awb_number, FORWARD_AWB)

    const warehouseShipment = await shadowfax.createForwardShipment(buildShipmentPayload(), {
      mode: warehouseServiceability.mode || 'warehouse',
      service: 'surface',
    })
    assertJsonResponse('createForwardShipment warehouse', warehouseShipment)
    assert.equal(warehouseShipment?.data?.awb_number, WAREHOUSE_AWB)

    const fallbackShipment = await shadowfax.createForwardShipmentWithFallback(
      buildShipmentPayload({
        order_number: 'SFX_SURFACE_RETRY_ORDER',
        payment_type: 'prepaid',
        order_amount: 799,
        pickup_location_id: 'BLR-WH',
        pickup: {
          warehouse_name: 'BLR Warehouse',
          address: 'Indiranagar',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560001',
        },
        rto: {
          warehouse_name: 'BLR Warehouse',
          address: 'Indiranagar',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560001',
        },
        consignee: {
          city: 'Chennai',
          state: 'Tamil Nadu',
          pincode: '600001',
        },
      }),
      {
        mode: 'warehouse',
        service: 'surface',
        origin: '560001',
        destination: '600001',
        paymentType: 'prepaid',
      },
    )
    assertJsonResponse('createForwardShipmentWithFallback', fallbackShipment.shipment)
    assert.equal(fallbackShipment.mode, 'warehouse')
    assert.equal(fallbackShipment.service, 'regular')
    assert.equal(fallbackShipment.shipment?.data?.awb_number, FALLBACK_AWB)
    assert(
      fallbackShipment.attempts.some((attempt) =>
        String(attempt.error || '').includes('Invalid Pickup Pincode'),
      ),
      'expected provider pincode rejection to be captured before fallback',
    )

    const reverseShipment = await shadowfax.createReverseShipment(buildShipmentPayload())
    assertJsonResponse('createReverseShipment', reverseShipment)
    assert.equal(reverseShipment?.client_request_id, REVERSE_REQUEST_ID)

    const tracking = await shadowfax.trackShipment(FORWARD_AWB)
    assertJsonResponse('trackShipment', tracking)
    assert.equal(tracking?.data?.awb_number, FORWARD_AWB)

    const bulkTracking = await shadowfax.bulkTrackShipments([FORWARD_AWB])
    assertJsonResponse('bulkTrackShipments', bulkTracking)
    assert.equal(bulkTracking?.data?.[0]?.awb_number, FORWARD_AWB)

    const reverseTracking = await shadowfax.trackReverseShipment(REVERSE_REQUEST_ID)
    assertJsonResponse('trackReverseShipment', reverseTracking)
    assert.equal(reverseTracking?.data?.client_request_id, REVERSE_REQUEST_ID)

    const bulkReverseTracking = await shadowfax.bulkTrackReverseShipments([REVERSE_REQUEST_ID])
    assertJsonResponse('bulkTrackReverseShipments', bulkReverseTracking)
    assert.equal(bulkReverseTracking?.data?.[0]?.client_request_id, REVERSE_REQUEST_ID)

    const forwardUpdate = await shadowfax.updateForwardOrder({
      awb_number: FORWARD_AWB,
      client_order_id: 'SFX_TEST_ORDER',
      action: 'RE-ATTEMPT',
      request_type: 're-attempt',
      next_attempt_date: '2026-05-18',
    })
    assertJsonResponse('updateForwardOrder', forwardUpdate)
    assert.equal(forwardUpdate?.success, true)

    const reverseUpdate = await shadowfax.updateReverseOrder({
      request_id: REVERSE_REQUEST_ID,
      action: 'EDIT_DETAILS',
    })
    assertJsonResponse('updateReverseOrder', reverseUpdate)
    assert.equal(reverseUpdate?.success, true)

    const qcUpdate = await shadowfax.updateReverseQcFlag({
      awb_number: REVERSE_REQUEST_ID,
      qc_flag: true,
    })
    assertJsonResponse('updateReverseQcFlag', qcUpdate)
    assert.equal(qcUpdate?.success, true)

    const forwardCancel = await shadowfax.cancelShipment(FORWARD_AWB)
    assertJsonResponse('cancelShipment forward', forwardCancel)
    assert.equal(forwardCancel?.success, true)

    const reverseCancel = await shadowfax.cancelShipment(REVERSE_REQUEST_ID)
    assertJsonResponse('cancelShipment reverse', reverseCancel)
    assert.equal(reverseCancel?.success, true)

    const escalation = await shadowfax.createEscalation({
      awb_number: FORWARD_AWB,
      issue_category: 1,
    })
    assertJsonResponse('createEscalation', escalation)
    assert.equal(escalation?.issue_id, 'SFX-ISSUE-1')

    const pod = await shadowfax.getPodDetails([FORWARD_AWB])
    assertJsonResponse('getPodDetails', pod)
    assert.equal(pod?.data?.[0]?.awb_number, FORWARD_AWB)

    const qr = await shadowfax.generateQrCode({
      client_order_id: 'SFX_TEST_ORDER',
      amount: 499,
    })
    assertJsonResponse('generateQrCode', qr)
    assert.equal(qr?.data?.qr_code, 'https://shadowfax.example/qr.png')

    const summary = {
      serviceabilityCalls: mock.captured.filter((req) =>
        req.url.startsWith('/v1/clients/serviceability/'),
      ).length,
      forwardAwbCalls: mock.captured.filter(
        (req) => req.url === '/v3/clients/generate_marketplace_awb/',
      ).length,
      reverseAwbCalls: mock.captured.filter(
        (req) => req.url === '/v3/clients/orders/generate_awb/',
      ).length,
      forwardShipmentCalls: mock.captured.filter((req) => req.url === '/v3/clients/orders/')
        .length,
      reverseShipmentCalls: mock.captured.filter((req) => req.url === '/v3/clients/requests')
        .length,
      trackingCalls: mock.captured.filter((req) => req.url.includes('/track/')).length,
      updateCalls: mock.captured.filter((req) => req.url.includes('/order_update/')).length,
      cancelCalls: mock.captured.filter(
        (req) =>
          req.url === '/v3/clients/orders/cancel/' ||
          req.url === '/v2/clients/requests/mark_cancel',
      ).length,
      podCalls: mock.captured.filter((req) => req.url === '/v1/clients/pod_details/').length,
      qrCalls: mock.captured.filter((req) => req.url === '/v2/clients/qr_code/generate/').length,
      serviceable: serviceability.serviceable,
      warehouseServiceable: warehouseServiceability.serviceable,
      reverseServiceable: reverseServiceability.serviceable,
      forwardAwb: forwardShipment.data?.awb_number,
      warehouseAwb: warehouseShipment.data?.awb_number,
      fallbackAwb: fallbackShipment.shipment?.data?.awb_number,
      reverseRequestId: reverseShipment.client_request_id,
    }

    console.log('Shadowfax integration mock checks passed')
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await mock.close()
  }
}

main().catch((error) => {
  console.error('Shadowfax integration mock checks failed')
  console.error(error)
  process.exit(1)
})
