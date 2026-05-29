import { useEffect } from 'react'
import { company } from '../data/site'

function ensureMeta(selector, attributes) {
  let element = document.head.querySelector(selector)

  if (!element) {
    element = document.createElement('meta')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value)
  })

  return element
}

function ensureLink(selector, attributes) {
  let element = document.head.querySelector(selector)

  if (!element) {
    element = document.createElement('link')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value)
  })

  return element
}

export function Seo({
  title,
  description,
  path = '/',
  keywords = '',
  type = 'website',
  schema = null,
  robots = 'index, follow',
  image = '/favicon.png',
}) {
  useEffect(() => {
    const pageTitle = title ? `${title} | ${company.brand}` : `${company.brand} | Shipping Simplified`
    const canonicalUrl = new URL(path, company.website).toString()
    const imageUrl = new URL(image, company.website).toString()

    document.title = pageTitle

    ensureMeta('meta[name="description"]', {
      name: 'description',
      content: description,
    })

    ensureMeta('meta[name="keywords"]', {
      name: 'keywords',
      content: keywords,
    })

    ensureMeta('meta[name="robots"]', {
      name: 'robots',
      content: robots,
    })

    ensureMeta('meta[name="author"]', {
      name: 'author',
      content: company.brand,
    })

    ensureMeta('meta[property="og:title"]', {
      property: 'og:title',
      content: pageTitle,
    })

    ensureMeta('meta[property="og:description"]', {
      property: 'og:description',
      content: description,
    })

    ensureMeta('meta[property="og:type"]', {
      property: 'og:type',
      content: type,
    })

    ensureMeta('meta[property="og:url"]', {
      property: 'og:url',
      content: canonicalUrl,
    })

    ensureMeta('meta[property="og:site_name"]', {
      property: 'og:site_name',
      content: company.brand,
    })

    ensureMeta('meta[property="og:image"]', {
      property: 'og:image',
      content: imageUrl,
    })

    ensureMeta('meta[name="twitter:card"]', {
      name: 'twitter:card',
      content: 'summary_large_image',
    })

    ensureMeta('meta[name="twitter:title"]', {
      name: 'twitter:title',
      content: pageTitle,
    })

    ensureMeta('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: description,
    })

    ensureMeta('meta[name="twitter:image"]', {
      name: 'twitter:image',
      content: imageUrl,
    })

    ensureLink('link[rel="canonical"]', {
      rel: 'canonical',
      href: canonicalUrl,
    })

    let schemaElement = document.head.querySelector('script[data-shiplifi-seo-schema="true"]')
    if (!schemaElement) {
      schemaElement = document.createElement('script')
      schemaElement.setAttribute('type', 'application/ld+json')
      schemaElement.setAttribute('data-shiplifi-seo-schema', 'true')
      document.head.appendChild(schemaElement)
    }

    if (schema) {
      const schemaPayload = Array.isArray(schema) ? schema : [schema]
      schemaElement.textContent = JSON.stringify(schemaPayload)
    } else {
      schemaElement.textContent = ''
    }
  }, [description, image, keywords, path, robots, schema, title, type])

  return null
}
