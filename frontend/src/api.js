// One helper for every call to our backend.
//
// The presenter's login cookie is sent automatically: the browser attaches
// cookies to requests going back to the same website.
// Pages will call e.g.  apiFetch('/rooms', { method: 'POST' })
// instead of repeating fetch boilerplate everywhere.

// Someone (the AuthProvider) can ask to be told when the server says
// "log in first", so the app can show the login form again.
let loginRequiredHandler = null

export function onLoginRequired(handler) {
  loginRequiredHandler = handler
  return () => {
    if (loginRequiredHandler === handler) loginRequiredHandler = null
  }
}

export function notifyLoginRequired() {
  loginRequiredHandler?.()
}

export async function apiFetch(path, { method = 'GET', token, body } = {}) {
  // "/api/..." is a RELATIVE URL: it goes to the same server that served the
  // page (Vite on 5173), and Vite's proxy forwards it to Express on 3000.
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        // Only add headers when we need them.
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    // fetch() only throws when the request never got an answer: Wi-Fi down,
    // server stopped… The browser's message ("Failed to fetch") means nothing
    // to a guest, so say it in plain words.
    throw new Error("Can't reach the server. Check your connection and try again.")
  }

  // Our backend always answers with JSON, but if the server is down the
  // proxy may send back something else. Fall back to an empty object.
  const data = await res.json().catch(() => ({}))

  // fetch() does NOT throw on 400/404/500. It only throws if the network fails.
  // So we check res.ok ourselves and turn error responses into real errors,
  // using the friendly message our backend put in { error: "..." }.
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`)
    error.status = res.status // lets callers react to e.g. 401 differently
    error.code = data.code
    // The presenter's login has ended (or never existed): show the login form.
    if (res.status === 401 && data.code === 'LOGIN_REQUIRED') notifyLoginRequired()
    throw error
  }
  return data
}
