const BASE_URL = '/api'

async function parseResponsePayload(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`
  const config = {
    credentials: 'same-origin',
    ...options
  }

  const response = await fetch(url, config)
  const payload = await parseResponsePayload(response)

  if (!response.ok) {
    throw new Error(payload?.error || `API Error: ${response.status}`)
  }

  return payload
}

export async function apiJsonRequest(endpoint, { method = 'GET', body, headers = {}, ...rest } = {}) {
  const finalHeaders = {
    'Content-Type': 'application/json',
    ...headers
  }

  return apiRequest(endpoint, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest
  })
}

export async function apiFormRequest(endpoint, { method = 'POST', formData, headers = {}, ...rest } = {}) {
  return apiRequest(endpoint, {
    method,
    headers,
    body: formData,
    ...rest
  })
}
