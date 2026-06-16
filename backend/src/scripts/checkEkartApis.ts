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

const sendBinary = (res: ServerResponse, statusCode: number, contentType: string, body: Buffer) => {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': body.length,
  })
  res.end(body)
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

      if (req.method === 'GET' && url === '/api/v2/serviceability/560008') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        return sendJson(res, 200, {
          status: true,
          pincode: 560008,
          remark: 'Pincode is serviceable',
          details: {
            cod: true,
            max_cod_amount: 49999,
            forward_pickup: true,
            forward_drop: true,
            reverse_pickup: true,
            reverse_drop: true,
            city: 'Bangalore',
            state: 'Karnataka',
          },
        })
      }

      if (req.method === 'GET' && url.startsWith('/data/serviceability/bulk/')) {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        const parsed = new URL(url, 'http://127.0.0.1')
        const type = parsed.pathname.split('/').pop()
        const format = String(parsed.searchParams.get('format') || 'JSON').toUpperCase()
        assert.ok(type === 'NON_LARGE' || type === 'LARGE')
        if (format === 'EXCEL') {
          return sendJson(res, 200, {
            url: `https://mock-ekart.local/bulk/${type.toLowerCase()}.xlsx`,
            type,
            format,
          })
        }
        return sendJson(res, 200, {
          serviceability: [
            { pincode: 560103, fm: true, lmCod: true, lmPrepaid: true, rvp: true },
            { pincode: 110001, fm: true, lmCod: true, lmPrepaid: true, rvp: true },
          ],
        })
      }

      if (req.method === 'PUT' && url === '/api/v1/package/create') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        assert.equal(body?.pickup_location?.name, 'BLR Warehouse')
        assert.equal(body?.pickup?.pincode, 560103)
        assert.equal(body?.drop?.pincode, 110001)
        assert.equal(body?.weight, 0.5)
        if (body?.order_number === 'EKART_TEST_REVERSE_ORDER') {
          assert.equal(body?.payment_mode, 'Pickup')
          assert.equal(body?.return_reason, 'Wrong product sent')
          return sendJson(res, 200, {
            status: true,
            tracking_id: 'EKARTMOCKREV123',
            shipment_id: 'SHIPMOCKREV123',
            manifest: 'MANIFESTMOCKREV123',
          })
        }
        if (body?.order_number === 'EKART_TEST_TEMPLATE_ORDER') {
          assert.equal(body?.templateName, 'Template #1')
          assert.equal(body?.length, undefined)
          assert.equal(body?.breadth, undefined)
          assert.equal(body?.height, undefined)
          return sendJson(res, 200, {
            status: true,
            tracking_id: 'EKARTMOCKTPL123',
            shipment_id: 'SHIPMOCKTPL123',
            manifest: 'MANIFESTMOCKTPL123',
          })
        }
        return sendJson(res, 200, {
          status: true,
          tracking_id: 'EKARTMOCK123',
          shipment_id: 'SHIPMOCK123',
          manifest: 'MANIFESTMOCK123',
        })
      }

      if (req.method === 'POST' && url === '/data/shipment/dispatch-date') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        assert.deepEqual(body?.ids, ['EKARTMOCK123'])
        assert.equal(body?.dispatchDate, '2026-01-30')
        return sendJson(res, 200, {
          data: [{}],
        })
      }

      if (req.method === 'POST' && url === '/data/shipment/ewbn') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        assert.equal(body?.id, 'EKARTMOCK123')
        assert.equal(body?.ewbn, '412345678901')
        return sendJson(res, 200, {
          status: true,
          remark: 'EWBN updated',
          tracking_id: 'EKARTMOCK123',
          ewbn: '412345678901',
        })
      }

      if (req.method === 'POST' && url === '/data/pricing/estimate') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        assert.equal(body?.pickupPincode, 560103)
        assert.equal(body?.dropPincode, 110001)
        assert.equal(body?.serviceType, 'SURFACE')
        assert.equal(body?.shippingDirection, 'FORWARD')
        return sendJson(res, 200, {
          type: 'WEIGHT_BASED',
          zone: 'C',
          volumetricWeight: '200.00',
          billingWeight: '200.00',
          shippingCharge: '70.00',
          rtoCharge: '0.00',
          fuelSurcharge: '0.00',
          codCharge: '0.00',
          qcCharge: '0.00',
          taxes: '12.60',
          total: '82.60',
          rid: 'RID-MOCK-123',
          rSnapshotId: 'RSNAPSHOT-MOCK-123',
        })
      }

      if (req.method === 'GET' && url === '/data/v1/elite/track/EKARTMOCK123') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        return sendJson(res, 200, {
          EKARTMOCK123: {
            shipment_type: 'COD',
            cod_amount: '1999.0',
            shipment_id: 'EKARTMOCK123',
            shipment_value: '1999.0',
            order_id: '5180823923081454',
            external_tracking_id: 'EKARTMOCK123',
            delivery_type: 'small',
            weight: '0.0',
            delivered: true,
            merchant_name: 'ABC',
            history: [],
            receiver: {},
            current_hub: {},
            assigned_hub: {},
            sender: {},
            customer: {},
            items: [],
            vendor: 'E-Kart Logistics',
            mh_inscanned: true,
            rto_detail: null,
            slotted_delivery: true,
            expected_delivery_slot: {},
            expected_delivery_date: '2018-08-30 23:59:59',
            rto: false,
            shipment_notes: [],
            shipment_tickets: null,
          },
        })
      }

      if (req.method === 'GET' && url === '/api/v1/track/EKARTMOCK123') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        return sendJson(res, 200, {
          _id: 'TRACK-MOCK-123',
          track: {
            status: 'Order Placed',
            ctime: 1710000000,
            pickupTime: 1710003600,
            desc: 'Mock tracking response',
            location: 'Bengaluru',
            ndrStatus: 'Unknown Exception',
            attempts: 0,
            ndrActions: [],
            details: [],
          },
          edd: 1710086400,
          order_number: 'EKARTMOCK123',
        })
      }

      if (req.method === 'POST' && url === '/api/v1/package/label?json_only=true') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        assert.deepEqual(body?.ids, ['EKARTMOCK123'])
        return sendJson(res, 200, {
          statusCode: 0,
          code: 'LABEL_JSON_MOCK',
          message: 'labels fetched',
          description: 'json label payload',
          severity: 'INFO',
          data: [{ id: 'EKARTMOCK123', label: 'mock-label' }],
        })
      }

      if (req.method === 'POST' && url === '/api/v1/package/label?json_only=false') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        assert.deepEqual(body?.ids, ['EKARTMOCK123'])
        return sendBinary(res, 200, 'application/pdf', Buffer.from('%PDF-1.4\n%mock-ekart-label\n', 'utf8'))
      }

      if (req.method === 'POST' && url === '/data/v2/generate/manifest') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        assert.deepEqual(body?.ids, ['EKARTMOCK123'])
        return sendJson(res, 200, {
          ctime: 1710000000,
          manifestNumber: 987654321,
          manifestDownloadUrl: 'https://mock-ekart.local/manifest/mock.pdf',
        })
      }

      if (req.method === 'POST' && url === '/api/v2/address') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        assert.equal(body?.phone, 9876543210)
        assert.equal(body?.address_line1, 'Embassy Tech Village')
        assert.equal(body?.pincode, 560103)
        assert.equal(body?.city, 'Bengaluru')
        assert.equal(body?.state, 'Karnataka')
        assert.equal(body?.country, 'India')
        assert.ok(['BLR Warehouse', 'Codex Test Address 20260616'].includes(body?.alias))
        return sendJson(res, 200, {
          status: true,
          alias: body?.alias,
          remark: 'Successful operation on Address QodyZI5rq8_fam3noxnb',
          name: body?.alias,
        })
      }

      if (req.method === 'GET' && url === '/api/v2/addresses') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        return sendJson(res, 200, [
          {
            phone: 9033228852,
            country: 'India',
            state: 'Gujarat',
            city: 'Surat',
            address_line1: 'A-8, FIRST FLOOR, KHODIYAR NAGAR SOCIETY, IN FRONT OF TAKSHSHILA COMPLEX, VARACHHA ROAD',
            pincode: 395006,
            alias: 'FEATHER GLOBAL',
          },
          {
            geo: { lat: 12.8456, lon: 77.6631 },
            phone: 9876543210,
            country: 'India',
            state: 'Karnataka',
            city: 'Bangalore',
            address_line1: 'Embassy Tech Village',
            address_line2: 'Bengaluru',
            pincode: 560103,
            alias: 'Codex Test Address 20260616',
          },
        ] as any)
      }

      if (req.method === 'POST' && url === '/api/v2/package/ndr') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        assert.equal(body?.wbn, 'EKARTMOCK123')
        assert.ok(['Re-Attempt', 'RTO'].includes(body?.action))
        if (body?.action === 'Re-Attempt') {
          assert.equal(typeof body?.date, 'number')
        }
        return sendJson(res, 200, {
          status: true,
          remark: body?.action === 'RTO' ? 'RTO submitted' : 'Re-attempt submitted',
          tracking_id: 'EKARTMOCK123',
        })
      }

      if (req.method === 'DELETE' && url === '/api/v1/package/cancel?tracking_id=EKARTMOCK123') {
        assert.equal(req.headers.authorization, 'Bearer mock-access-token')
        return sendJson(res, 200, {
          status: true,
          remark: 'Shipment cancelled',
          tracking_id: 'EKARTMOCK123',
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

    const { checkEkartPairServiceabilityController } = await import('../controllers/externalApi/ekart.controller')
    const pairServiceabilityRes: any = {
      statusCode: 0,
      jsonBody: null,
      status(code: number) {
        this.statusCode = code
        return this
      },
      json(payload: any) {
        this.jsonBody = payload
        return this
      },
    }

    await checkEkartPairServiceabilityController(
      {
        body: {
          pickupPincode: '560103',
          dropPincode: '110001',
          length: '10',
          height: '10',
          width: '10',
          weight: '500',
          paymentType: 'COD',
          serviceType: 'SURFACE',
          codAmount: '499',
          invoiceAmount: '499',
        },
      },
      pairServiceabilityRes,
    )
    assert.equal(pairServiceabilityRes.statusCode, 200)
    assert.equal(pairServiceabilityRes.jsonBody.success, true)
    assert.equal(pairServiceabilityRes.jsonBody.data.serviceable, true)

    const bulkServiceabilityJsonRes: any = {
      statusCode: 0,
      jsonBody: null,
      status(code: number) {
        this.statusCode = code
        return this
      },
      json(payload: any) {
        this.jsonBody = payload
        return this
      },
    }
    await ekart.getBulkServiceability('NON_LARGE', 'JSON')
    const { getEkartBulkServiceabilityController } = await import('../controllers/externalApi/ekart.controller')
    await getEkartBulkServiceabilityController(
      {
        params: { type: 'NON_LARGE' },
        query: { format: 'JSON' },
      },
      bulkServiceabilityJsonRes,
    )
    assert.equal(bulkServiceabilityJsonRes.statusCode, 200)
    assert.equal(bulkServiceabilityJsonRes.jsonBody.success, true)
    assert.ok(Array.isArray(bulkServiceabilityJsonRes.jsonBody.data.serviceability))
    assert.equal(bulkServiceabilityJsonRes.jsonBody.data.serviceability.length, 2)

    const bulkServiceabilityExcelRes: any = {
      statusCode: 0,
      jsonBody: null,
      status(code: number) {
        this.statusCode = code
        return this
      },
      json(payload: any) {
        this.jsonBody = payload
        return this
      },
    }
    await ekart.getBulkServiceability('LARGE', 'EXCEL')
    await getEkartBulkServiceabilityController(
      {
        params: { type: 'LARGE' },
        query: { format: 'EXCEL' },
      },
      bulkServiceabilityExcelRes,
    )
    assert.equal(bulkServiceabilityExcelRes.statusCode, 200)
    assert.equal(bulkServiceabilityExcelRes.jsonBody.success, true)
    assert.equal(typeof bulkServiceabilityExcelRes.jsonBody.data.url, 'string')

    const pincodeServiceability = await ekart.checkPincodeServiceability(560008)
    assert.equal(pincodeServiceability.status, true)
    assert.equal(pincodeServiceability.pincode, 560008)

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

    const reverseShipment = await ekart.createShipment({
      order_number: 'EKART_TEST_REVERSE_ORDER',
      payment_type: 'reverse',
      return_reason: 'Wrong product sent',
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

    assert.equal(reverseShipment.tracking_id, 'EKARTMOCKREV123')

    const templateShipment = await ekart.createShipment({
      order_number: 'EKART_TEST_TEMPLATE_ORDER',
      payment_type: 'prepaid',
      templateName: 'Template #1',
      order_amount: 499,
      package_weight: 500,
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

    assert.equal(templateShipment.tracking_id, 'EKARTMOCKTPL123')

    const dispatchDateUpdate = await ekart.updateDispatchDate(['EKARTMOCK123'], '2026-01-30')
    assert.deepEqual(dispatchDateUpdate, { data: [{}] })

    const ewbnUpdate = await ekart.updateEwbn('EKARTMOCK123', '412345678901')
    assert.equal(ewbnUpdate?.status, true)
    assert.equal(ewbnUpdate?.ewbn, '412345678901')

    const pricingEstimate = await ekart.estimateShippingRates({
      pickupPincode: 560103,
      dropPincode: 110001,
      invoiceAmount: 499,
      weight: 1,
      length: 10,
      height: 10,
      width: 10,
      serviceType: 'SURFACE',
      shippingDirection: 'FORWARD',
      codAmount: 499,
    })
    assert.equal(pricingEstimate.total, '82.60')

    const rawTrack = await ekart.trackWbn('EKARTMOCK123')
    assert.equal(rawTrack?.EKARTMOCK123?.delivered, true)

    const legacyTrack = await ekart.track('EKARTMOCK123')
    assert.equal(legacyTrack?.track?.status, 'Order Placed')

    const labelJson = await ekart.downloadLabels(['EKARTMOCK123'], true)
    assert.equal(labelJson?.statusCode, 0)
    assert.equal(labelJson?.data?.[0]?.id, 'EKARTMOCK123')

    const labelPdf = await ekart.downloadLabels(['EKARTMOCK123'], false)
    assert.ok(Buffer.isBuffer(labelPdf))
    assert.ok(labelPdf.toString('utf8').startsWith('%PDF-1.4'))

    const manifest = await ekart.generateManifest(['EKARTMOCK123'])
    assert.equal(manifest?.manifestNumber, 987654321)
    assert.equal(manifest?.manifestDownloadUrl, 'https://mock-ekart.local/manifest/mock.pdf')

    const address = await ekart.addAddress({
      alias: 'Codex Test Address 20260616',
      phone: 9876543210,
      address_line1: 'Embassy Tech Village',
      address_line2: 'Bengaluru',
      pincode: 560103,
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      geo: { lat: 12.8456, lon: 77.6631 },
    })
    assert.equal(address?.status, true)
    assert.equal(address?.alias, 'Codex Test Address 20260616')

    const addresses = await ekart.listAddresses()
    assert.ok(Array.isArray(addresses))
    assert.equal(addresses.length, 2)

    const ndrReattempt = await ekart.submitNdrAction({
      action: 'Re-Attempt',
      wbn: 'EKARTMOCK123',
      date: Date.now() + 24 * 60 * 60 * 1000,
      phone: '9876543210',
      address: 'Embassy Tech Village, Bengaluru',
      instructions: 'Please reattempt delivery tomorrow',
    })
    assert.equal(ndrReattempt?.status, true)
    assert.equal(ndrReattempt?.tracking_id, 'EKARTMOCK123')

    const ndrRto = await ekart.submitNdrAction({
      action: 'RTO',
      wbn: 'EKARTMOCK123',
      phone: '9876543210',
      address: 'Embassy Tech Village, Bengaluru',
      instructions: 'Return shipment to seller',
    })
    assert.equal(ndrRto?.status, true)
    assert.equal(ndrRto?.tracking_id, 'EKARTMOCK123')

    const cancelShipment = await ekart.cancelShipment('EKARTMOCK123')
    assert.equal(cancelShipment?.status, true)
    assert.equal(cancelShipment?.tracking_id, 'EKARTMOCK123')

    const summary = {
      authCalls: mock.captured.filter((req) => req.url.includes('/auth/token')).length,
      serviceabilityCalls: mock.captured.filter((req) => req.url === '/data/v3/serviceability').length,
      bulkServiceabilityCalls: mock.captured.filter((req) => req.url.startsWith('/data/serviceability/bulk/')).length,
      pincodeServiceabilityCalls: mock.captured.filter((req) => req.url === '/api/v2/serviceability/560008').length,
      shipmentCalls: mock.captured.filter((req) => req.url === '/api/v1/package/create').length,
      dispatchDateCalls: mock.captured.filter((req) => req.url === '/data/shipment/dispatch-date').length,
      ewbnCalls: mock.captured.filter((req) => req.url === '/data/shipment/ewbn').length,
      pricingEstimateCalls: mock.captured.filter((req) => req.url === '/data/pricing/estimate').length,
      rawTrackCalls: mock.captured.filter((req) => req.url === '/data/v1/elite/track/EKARTMOCK123').length,
      legacyTrackCalls: mock.captured.filter((req) => req.url === '/api/v1/track/EKARTMOCK123').length,
      labelJsonCalls: mock.captured.filter((req) => req.url === '/api/v1/package/label?json_only=true').length,
      labelPdfCalls: mock.captured.filter((req) => req.url === '/api/v1/package/label?json_only=false').length,
      manifestCalls: mock.captured.filter((req) => req.url === '/data/v2/generate/manifest').length,
      addressCalls: mock.captured.filter((req) => req.url === '/api/v2/address').length,
      addressesCalls: mock.captured.filter((req) => req.url === '/api/v2/addresses').length,
      ndrCalls: mock.captured.filter((req) => req.url === '/api/v2/package/ndr').length,
      cancelCalls: mock.captured.filter((req) => req.url === '/api/v1/package/cancel?tracking_id=EKARTMOCK123').length,
      serviceable: serviceability.serviceable,
      pincodeServiceable: pincodeServiceability.status,
      pincodeServiceabilityRemark: pincodeServiceability.remark,
      trackingId: shipment.tracking_id,
      reverseTrackingId: reverseShipment.tracking_id,
      templateTrackingId: templateShipment.tracking_id,
      pricingEstimateTotal: pricingEstimate.total,
      rawTrackDelivered: rawTrack?.EKARTMOCK123?.delivered,
      legacyTrackStatus: legacyTrack?.track?.status,
      dispatchDate: '2026-01-30',
      ewbn: '412345678901',
      labelJsonStatusCode: labelJson?.statusCode,
      labelPdfBytes: labelPdf.length,
      manifestNumber: manifest?.manifestNumber,
      addressAlias: address?.alias,
      addressesCount: Array.isArray(addresses) ? addresses.length : 0,
      ndrReattemptStatus: ndrReattempt?.status,
      ndrRtoStatus: ndrRto?.status,
      cancelTrackingId: 'EKARTMOCK123',
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
