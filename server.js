import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { randomBytes, scrypt as scryptCallback, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'

const scrypt = promisify(scryptCallback)
const projectRoot = import.meta.dirname
const databasePath = resolve(process.env.DATABASE_PATH || join(projectRoot, 'data', 'negolex.sqlite'))
const dataDirectory = dirname(databasePath)
const port = Number(process.env.API_PORT || 3001)
const host = process.env.API_HOST || '127.0.0.1'
const sessionCookieName = 'negolex_session'
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7
const sessionMaxAgeMs = sessionMaxAgeSeconds * 1000
const failedLoginWindowMs = 15 * 60 * 1000
const maxFailedLogins = 10
const loginFailures = new Map()
const servingStaticFiles = process.argv.includes('--serve-static')
const buildDirectory = resolve(projectRoot, 'dist')

if (process.versions.node.split('.').map(Number)[0] < 22) {
	throw new Error('NegoLex requires Node.js 22 or newer for its built-in SQLite database.')
}

mkdirSync(dataDirectory, { recursive: true })
const database = new Database(databasePath)
database.exec(`
	PRAGMA journal_mode = WAL;
	PRAGMA foreign_keys = ON;
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		email TEXT NOT NULL UNIQUE COLLATE NOCASE,
		company TEXT NOT NULL DEFAULT '',
		password_hash TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	CREATE TABLE IF NOT EXISTS sessions (
		token_hash TEXT PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		expires_at INTEGER NOT NULL,
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
	CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
`)
database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())

const findUserByEmail = database.prepare(
	'SELECT id, name, email, company, password_hash FROM users WHERE email = ? COLLATE NOCASE',
)
const findUserBySessionHash = database.prepare(`
	SELECT users.id, users.name, users.email, users.company
	FROM sessions JOIN users ON users.id = sessions.user_id
	WHERE sessions.token_hash = ? AND sessions.expires_at > ?
`)
const insertSession = database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
const deleteSession = database.prepare('DELETE FROM sessions WHERE token_hash = ?')

const fakeSalt = Buffer.alloc(16, 1)
const fakePasswordHash = scryptSync('invalid-login-timing-padding', fakeSalt, 64)

const sendJson = (response, status, body, headers = {}) => {
	response.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff',
		...headers,
	})
	response.end(JSON.stringify(body))
}

const getRequestCookie = (request) => {
	const cookies = request.headers.cookie?.split(';') || []
	const value = cookies.find(cookie => cookie.trim().startsWith(`${sessionCookieName}=`))
	return value?.trim().slice(sessionCookieName.length + 1) || ''
}

const hashSessionToken = (token) => createHash('sha256').update(token).digest('hex')

const setSessionCookie = (response, token) => {
	const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
	response.setHeader(
		'Set-Cookie',
		`${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionMaxAgeSeconds}${secure}`,
	)
}

const clearSessionCookie = (response) => {
	const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
	response.setHeader('Set-Cookie', `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`)
}

const createSession = (userId) => {
	const token = randomBytes(32).toString('base64url')
	insertSession.run(hashSessionToken(token), userId, Date.now() + sessionMaxAgeMs)
	return token
}

const getPublicUser = (user) => ({
	id: user.id,
	name: user.name,
	email: user.email,
	company: user.company,
})

const readJsonBody = async (request) => {
	const chunks = []
	let bytes = 0
	for await (const chunk of request) {
		bytes += chunk.length
		if (bytes > 16 * 1024) {
			const error = new Error('Request body is too large.')
			error.status = 413
			throw error
		}
		chunks.push(chunk)
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'))
	} catch {
		const error = new Error('Send a valid JSON request.')
		error.status = 400
		throw error
	}
}

const getLoginFailureKey = (request, email) => `${request.socket.remoteAddress || 'unknown'}:${email}`

const getLoginBlockTime = (request, email) => {
	const key = getLoginFailureKey(request, email)
	const record = loginFailures.get(key)
	if (!record) return 0
	if (Date.now() - record.startedAt >= failedLoginWindowMs) {
		loginFailures.delete(key)
		return 0
	}
	return record.count >= maxFailedLogins
		? failedLoginWindowMs - (Date.now() - record.startedAt)
		: 0
}

const recordFailedLogin = (request, email) => {
	const key = getLoginFailureKey(request, email)
	const record = loginFailures.get(key)
	if (!record || Date.now() - record.startedAt >= failedLoginWindowMs) {
		loginFailures.set(key, { startedAt: Date.now(), count: 1 })
		return
	}
	record.count += 1
}

const clearFailedLogins = (request, email) => {
	loginFailures.delete(getLoginFailureKey(request, email))
}

const handleAuthRequest = async (request, response, url) => {
	if (url.pathname === '/api/auth/session' && request.method === 'GET') {
		const token = getRequestCookie(request)
		const user = token ? findUserBySessionHash.get(hashSessionToken(token), Date.now()) : null
		if (!user && token) deleteSession.run(hashSessionToken(token))
		return sendJson(response, 200, { user: user ? getPublicUser(user) : null })
	}

	if (url.pathname === '/api/auth/register' && request.method === 'POST') {
		const body = await readJsonBody(request)
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return sendJson(response, 400, { error: 'Send account details as a JSON object.' })
		}
		const name = typeof body.name === 'string' ? body.name.trim() : ''
		const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
		const company = typeof body.company === 'string' ? body.company.trim() : ''
		const password = typeof body.password === 'string' ? body.password : ''

		if (name.length < 2 || name.length > 100) {
			return sendJson(response, 400, { error: 'Enter a name between 2 and 100 characters.' })
		}
		if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return sendJson(response, 400, { error: 'Enter a valid email address.' })
		}
		if (company.length > 120) {
			return sendJson(response, 400, { error: 'Company name must be 120 characters or fewer.' })
		}
		if (password.length < 8 || password.length > 128) {
			return sendJson(response, 400, { error: 'Password must be between 8 and 128 characters.' })
		}
		if (findUserByEmail.get(email)) {
			return sendJson(response, 409, { error: 'An account with this email already exists. Sign in instead.' })
		}

		const salt = randomBytes(16)
		const passwordHash = Buffer.from(await scrypt(password, salt, 64)).toString('base64url')
		const id = randomBytes(16).toString('hex')
		try {
			database.exec('BEGIN IMMEDIATE')
			database.prepare(`
				INSERT INTO users (id, name, email, company, password_hash)
				VALUES (?, ?, ?, ?, ?)
			`).run(id, name, email, company, `${salt.toString('base64url')}:${passwordHash}`)
			const token = createSession(id)
			database.exec('COMMIT')
			setSessionCookie(response, token)
		} catch (error) {
			database.exec('ROLLBACK')
			if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
				return sendJson(response, 409, { error: 'An account with this email already exists. Sign in instead.' })
			}
			throw error
		}

		return sendJson(response, 201, { user: { id, name, email, company } })
	}

	if (url.pathname === '/api/auth/login' && request.method === 'POST') {
		const body = await readJsonBody(request)
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return sendJson(response, 400, { error: 'Send sign-in details as a JSON object.' })
		}
		const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
		const password = typeof body.password === 'string' ? body.password : ''
		if (email.length > 254 || !email || password.length > 128) {
			return sendJson(response, 401, { error: 'Email or password is incorrect.' })
		}

		const retryAfterMs = getLoginBlockTime(request, email)
		if (retryAfterMs) {
			return sendJson(response, 429, { error: 'Too many sign-in attempts. Try again later.' }, {
				'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
			})
		}

		const user = findUserByEmail.get(email)
		const [saltValue, passwordHashValue] = user?.password_hash.split(':') || []
		const salt = saltValue ? Buffer.from(saltValue, 'base64url') : fakeSalt
		const expectedHash = passwordHashValue ? Buffer.from(passwordHashValue, 'base64url') : fakePasswordHash
		const suppliedHash = Buffer.from(await scrypt(password, salt, expectedHash.length))
		const validPassword = suppliedHash.length === expectedHash.length && timingSafeEqual(suppliedHash, expectedHash)

		if (!user || !validPassword) {
			recordFailedLogin(request, email)
			return sendJson(response, 401, { error: 'Email or password is incorrect.' })
		}

		clearFailedLogins(request, email)
		setSessionCookie(response, createSession(user.id))
		return sendJson(response, 200, { user: getPublicUser(user) })
	}

	if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
		const token = getRequestCookie(request)
		if (token) deleteSession.run(hashSessionToken(token))
		clearSessionCookie(response)
		return sendJson(response, 200, { user: null })
	}

	return false
}

const contentTypes = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.ico': 'image/x-icon',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain; charset=utf-8',
	'.wasm': 'application/wasm',
}

const serveBuiltApp = (request, response, url) => {
	if (!existsSync(buildDirectory)) {
		return sendJson(response, 503, { error: 'Production build not found. Run npm run build first.' })
	}
	let pathname
	try {
		pathname = decodeURIComponent(url.pathname)
	} catch {
		return sendJson(response, 400, { error: 'Invalid request path.' })
	}

	const requestedPath = resolve(buildDirectory, `.${pathname}`)
	const pathFromBuild = relative(buildDirectory, requestedPath)
	if (pathFromBuild === '..' || pathFromBuild.startsWith(`..${sep}`)) {
		return sendJson(response, 403, { error: 'Forbidden.' })
	}
	const filePath = existsSync(requestedPath) && statSync(requestedPath).isFile()
		? requestedPath
		: join(buildDirectory, 'index.html')
	response.writeHead(200, {
		'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
	})
	createReadStream(filePath).pipe(response)
}

const server = createServer(async (request, response) => {
	const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
	if (url.pathname.startsWith('/api/')) {
		try {
			const handled = await handleAuthRequest(request, response, url)
			if (handled !== false) return
			return sendJson(response, 404, { error: 'API endpoint not found.' })
		} catch (error) {
			console.error('Authentication request failed:', error)
			return sendJson(response, error.status || 500, {
				error: error.status ? error.message : 'The authentication service encountered an error.',
			})
		}
	}

	if (servingStaticFiles && request.method === 'GET' && !url.pathname.startsWith('/api/')) {
		return serveBuiltApp(request, response, url)
	}
	return sendJson(response, 404, { error: 'Not found.' })
})

server.listen(port, host, () => {
	console.log(`NegoLex ${servingStaticFiles ? 'app and API' : 'authentication API'} listening on http://${host}:${port}`)
	console.log(`Account database: ${databasePath}`)
})

const shutdown = () => {
	server.close(() => {
		database.close()
		process.exit(0)
	})
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
