import { analyzeContractFile, extractDocumentText } from './documentAnalysis.js'

let storageUserId = null

export const setStorageUserId = (userId) => {
	storageUserId = userId
}

const userScopedStorageKey = (key) => {
	if (!storageUserId) throw new Error('Sign in is required to access account data.')
	return `negolex.user.${encodeURIComponent(storageUserId)}.${key}`
}

const request = async (path, fallback) => {
	try {
		const response = await fetch(`/api${path}`)
		if (!response.ok) return fallback
		return await response.json()
	} catch {
		return fallback
	}
}

const readStoredItems = (key) => {
	const value = localStorage.getItem(userScopedStorageKey(key))
	if (!value) return []
	const items = JSON.parse(value)
	return Array.isArray(items) ? items : []
}

const writeStoredItem = (key, item) => {
	const items = readStoredItems(key)
	localStorage.setItem(userScopedStorageKey(key), JSON.stringify([item, ...items.filter(existing => existing.id !== item.id)]))
}

const userScopedFileId = (id) => `${storageUserId}:${id}`

const openLocalDatabase = () => new Promise((resolve, reject) => {
	const request = indexedDB.open('negolex-contracts', 1)
	request.onupgradeneeded = () => {
		if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files')
	}
	request.onerror = () => reject(request.error || new Error('Could not open local contract storage.'))
	request.onsuccess = () => resolve(request.result)
})

const storeLocalContract = async (id, file, analysis) => {
	const database = await openLocalDatabase()
	return new Promise((resolve, reject) => {
		const transaction = database.transaction('files', 'readwrite')
		transaction.objectStore('files').put({ file, analysis }, userScopedFileId(id))
		transaction.oncomplete = () => {
			database.close()
			resolve()
		}
		transaction.onerror = () => {
			const error = transaction.error
			database.close()
			reject(error || new Error('Could not save the contract in local storage.'))
		}
	})
}

const loadLocalContract = async (id) => {
	const database = await openLocalDatabase()
	return new Promise((resolve, reject) => {
		const transaction = database.transaction('files', 'readonly')
		const request = transaction.objectStore('files').get(userScopedFileId(id))
		request.onsuccess = () => {
			database.close()
			const record = request.result
			resolve(record instanceof Blob ? { file: record, analysis: null } : record || null)
		}
		request.onerror = () => {
			const error = request.error
			database.close()
			reject(error || new Error('Could not load the saved contract.'))
		}
	})
}

export const getContractDocumentText = async (contractId) => {
	const record = await loadLocalContract(contractId)
	if (!record?.file) return ''
	return extractDocumentText(record.file)
}

export const uploadContract = async (formData) => {
	try {
		const response = await fetch('/api/contracts', { method: 'POST', body: formData })
		if (!response.ok) return null
		return await response.json()
	} catch {
		return null
	}
}

export const getContracts = async () => {
	const contracts = await request('/contracts', [])
	const localContracts = readStoredItems('negolex.contracts')
	const merged = new Map(localContracts.map(contract => [String(contract.id), contract]))
	if (Array.isArray(contracts)) {
		contracts.forEach(contract => merged.set(String(contract.id), { ...merged.get(String(contract.id)), ...contract }))
	}
	return Array.from(merged.values())
}
export const saveContract = async (formData, metadata, file, analysis) => {
	const remote = await uploadContract(formData)
	const savedContract = {
		...metadata,
		...(remote?.contract || remote || {}),
		id: (remote?.contract || remote)?.id || metadata.id,
		name: (remote?.contract || remote)?.name || metadata.name,
	}
	await storeLocalContract(savedContract.id, file, analysis)
	writeStoredItem('negolex.contracts', savedContract)
	return { ...savedContract, remote: Boolean(remote) }
}
export const getContract = async (id) => {
	const remote = await request(`/contracts/${encodeURIComponent(id)}`, null)
	const local = readStoredItems('negolex.contracts').find(contract => String(contract.id) === String(id))
	return remote ? { ...local, ...remote } : local || null
}
export const getClauses = async (contractId) => {
	const clauses = await request(`/contracts/${encodeURIComponent(contractId)}/clauses`, [])
	if (Array.isArray(clauses) && clauses.length) return clauses
	const analysis = await getContractAnalysis(contractId)
	return analysis?.clauses || []
}
export const analyzeContract = async (contractId) => request(`/contracts/${encodeURIComponent(contractId)}/analysis`, null)

export const getContractAnalysis = async (contractId) => {
	const remote = await request(`/contracts/${encodeURIComponent(contractId)}/risk`, null)
	if (remote) return remote
	const record = await loadLocalContract(contractId)
	if (!record) return null
	if (record.analysis) return { ...record.analysis, clauses: (record.analysis.clauses || []).map(clause => ({ ...clause, contractId })) }
	if (!record.file) return null
	const analysis = await analyzeContractFile(record.file)
	await storeLocalContract(contractId, record.file, analysis)
	return { ...analysis, clauses: analysis.clauses.map(clause => ({ ...clause, contractId })) }
}

export const getRiskAnalysis = async (contractId) => {
	if (contractId) return getContractAnalysis(contractId)
	const remote = await request('/risk-analysis', null)
	if (remote) return remote

	const contracts = readStoredItems('negolex.contracts')
	const analyses = await Promise.all(contracts.map(async contract => ({
		contract,
		analysis: await getContractAnalysis(contract.id),
	})))
	const reviewed = analyses.filter(item => item.analysis)
	const clauses = reviewed.flatMap(({ contract, analysis }) =>
		(analysis.clauses || []).map(clause => ({
			...clause,
			contractId: contract.id,
			contractName: contract.name,
		})),
	)
	const scores = reviewed.map(({ analysis }) => analysis.overallRiskScore).filter(Number.isFinite)
	const overallRiskScore = scores.length
		? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
		: null
	return {
		overallRiskScore,
		riskDistribution: [
			{ name: 'High', value: clauses.filter(clause => clause.severity === 'High').length },
			{ name: 'Medium', value: clauses.filter(clause => clause.severity === 'Medium').length },
			{ name: 'Low', value: clauses.filter(clause => clause.severity === 'Low').length },
		].filter(item => item.value > 0),
		summary: reviewed.length
			? `${reviewed.length} local contract${reviewed.length === 1 ? '' : 's'} scanned. Findings are heuristic indicators for review, not legal advice.`
			: 'Upload a text-based PDF or DOCX contract to run a local risk scan.',
		clauses,
	}
}

/*
 * Keep reports list and review data in the browser when the optional API is
 * unavailable; source documents and extracted findings remain in IndexedDB.
 */
export const saveReport = (report) => writeStoredItem('negolex.reports', report)
export const getReports = async () => {
	const reports = await request('/reports', [])
	const localReports = readStoredItems('negolex.reports')
	const merged = new Map(localReports.map(report => [String(report.id), report]))
	if (Array.isArray(reports)) {
		reports.forEach(report => merged.set(String(report.id), { ...merged.get(String(report.id)), ...report }))
	}
	return Array.from(merged.values())
}
export const getNegotiationRecommendations = async (contractId) => {
	const remote = await request(`/contracts/${encodeURIComponent(contractId)}/negotiation`, null)
	if (remote) return remote

	const analysis = await getContractAnalysis(contractId)
	if (!analysis) return null
	const findings = analysis.findings || analysis.clauses || []
	return {
		goals: [
			'Prioritize the contract wording flagged below for discussion.',
			'Confirm any proposed changes with a qualified contract professional.',
		],
		priorities: findings.map(finding => ({
			clause: finding.title,
			level: finding.severity || finding.risk,
		})),
		recommendations: findings.map(finding => ({
			clause: finding.title,
			risk: finding.severity || finding.risk,
			objective: finding.recommendation,
			strategy: finding.rationale,
			quote: finding.quote,
			questions: [
				`Can the ${finding.category.toLowerCase()} language be made mutual and more narrowly defined?`,
				'Can the parties agree on a clear notice, exception, or limit for this term?',
			],
			wording: finding.recommendation,
		})),
	}
}
export const sendChatMessage = async (message, contractId) => {
	try {
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message, contractId }),
		})
		if (!response.ok) return null
		return await response.json()
	} catch {
		return null
	}
}
