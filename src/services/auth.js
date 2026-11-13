const request = async (path, body) => {
	let response
	try {
		response = await fetch(`/api/auth${path}`, {
			method: body === undefined ? 'GET' : 'POST',
			credentials: 'same-origin',
			headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
		})
	} catch {
		throw new Error('The account service is unavailable. Start the app with npm run dev and try again.')
	}

	let result
	try {
		result = await response.json()
	} catch {
		throw new Error('The account service returned an invalid response.')
	}
	if (!response.ok) throw new Error(result.error || 'The account request could not be completed.')
	return result
}

export const getCurrentUser = async () => (await request('/session')).user
export const registerAccount = async (account) => (await request('/register', account)).user
export const signIn = async (credentials) => (await request('/login', credentials)).user
export const signOut = async () => request('/logout', {})
