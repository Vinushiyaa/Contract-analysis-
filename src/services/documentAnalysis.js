import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const riskRules = [
  {
    title: 'Unilateral termination',
    category: 'Termination',
    severity: 'High',
    score: 25,
    pattern: /(?:terminate|termination|cancel|cancellation).{0,140}(?:sole discretion|without cause|for convenience|at any time|upon notice)|(?:sole discretion|without cause|for convenience|at any time).{0,140}(?:terminate|termination|cancel|cancellation)/i,
    rationale: 'One party may be able to end the agreement without a clearly stated cause or balanced notice period.',
    recommendation: 'Confirm both parties have comparable termination rights, reasonable notice, and a clear transition process.',
  },
  {
    title: 'Automatic renewal',
    category: 'Renewal',
    severity: 'Medium',
    score: 15,
    pattern: /(?:automatically renew|auto(?:matic)?ally extend|automatic renewal|successive renewal terms|renewal term)/i,
    rationale: 'The agreement appears to renew automatically, which can extend the commitment if a cancellation deadline is missed.',
    recommendation: 'Check the renewal length, notice deadline, and method for opting out; request a reminder or a shorter renewal period.',
  },
  {
    title: 'Broad indemnity',
    category: 'Indemnification',
    severity: 'High',
    score: 25,
    pattern: /indemnif\w*.{0,180}(?:any and all|all claims|regardless of|including negligence|arising from any act)|(?:any and all|all claims|including negligence).{0,180}indemnif\w*/i,
    rationale: 'The indemnity wording may cover a wide range of claims or losses without a clear fault-based limit.',
    recommendation: 'Limit indemnity to defined third-party claims caused by the indemnifying party and exclude the other party’s negligence or misconduct.',
  },
  {
    title: 'Uncapped or excluded liability',
    category: 'Liability',
    severity: 'High',
    score: 25,
    pattern: /(?:unlimited liability|without limitation of liability|no limit on liability|shall have no liability cap|liable without limitation|exclude.{0,100}(?:all|any).{0,30}liability)/i,
    rationale: 'The text appears to leave some liability uncapped or broadly excluded from the liability limit.',
    recommendation: 'Set a reasonable aggregate liability cap and define narrow, mutual exceptions for specific risks.',
  },
  {
    title: 'Late payment charges',
    category: 'Payment',
    severity: 'Medium',
    score: 15,
    pattern: /(?:late fee|late charge|overdue amount|past due).{0,100}(?:interest|fee|penalty|per month|per annum)|(?:interest|penalty).{0,100}(?:overdue|past due|late payment)/i,
    rationale: 'Late payment language may create additional charges if an invoice is disputed or delayed.',
    recommendation: 'Check the rate, grace period, dispute process, and whether charges are capped.',
  },
  {
    title: 'Mandatory arbitration or class-action waiver',
    category: 'Disputes',
    severity: 'Medium',
    score: 15,
    pattern: /(?:binding arbitration|mandatory arbitration|waive.{0,50}(?:jury trial|class action)|class action waiver)/i,
    rationale: 'The dispute clause may restrict court access or the ability to bring or join a class action.',
    recommendation: 'Review the arbitration venue, costs, rules, available remedies, and any opt-out period.',
  },
  {
    title: 'One-sided contract changes',
    category: 'Changes',
    severity: 'High',
    score: 25,
    pattern: /(?:may|can|reserves the right to).{0,100}(?:modify|change|amend|update).{0,100}(?:terms|agreement|conditions) without (?:notice|consent)/i,
    rationale: 'One party may be able to change contract terms without the other party’s consent or notice.',
    recommendation: 'Require written agreement for material changes and advance notice with a termination option.',
  },
  {
    title: 'Broad intellectual-property transfer',
    category: 'Intellectual Property',
    severity: 'Medium',
    score: 15,
    pattern: /(?:assign|transfer|owns?|ownership).{0,140}(?:all right|all work product|all intellectual property|all inventions|all materials)/i,
    rationale: 'The intellectual-property wording may transfer more work product or pre-existing material than intended.',
    recommendation: 'Separate pre-existing materials from project deliverables and define the exact rights or license granted.',
  },
]

const paragraphForMatch = (text, index) => {
  const start = Math.max(text.lastIndexOf('\n', index), text.lastIndexOf('.', index), text.lastIndexOf(';', index)) + 1
  const ends = ['\n', '.', ';'].map(separator => {
    const end = text.indexOf(separator, index)
    return end < 0 ? text.length : end + (separator === '\n' ? 0 : 1)
  })
  const end = Math.min(...ends)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

export const extractDocumentText = async (file) => {
  if (/\.docx$/i.test(file.name)) {
    const mammothModule = await import('mammoth/mammoth.browser')
    const mammoth = mammothModule.default || mammothModule
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return result.value.trim()
  }

  const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push(content.items.map(item => item.str).join(' '))
  }
  return pages.join('\n').replace(/\s+/g, ' ').trim()
}

export const reviewContractText = (text) => {
  const findings = []
  if (text.trim()) {
    for (const rule of riskRules) {
      const match = rule.pattern.exec(text)
      if (!match) continue
      const quote = paragraphForMatch(text, match.index).slice(0, 500)
      findings.push({
        id: rule.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: rule.title,
        category: rule.category,
        severity: rule.severity,
        riskScore: rule.score,
        risk: rule.severity,
        priority: rule.severity,
        quote: quote || match[0],
        rationale: rule.rationale,
        recommendation: rule.recommendation,
      })
    }
  }

  const overallRiskScore = findings.length
    ? Math.min(100, findings.reduce((score, finding) => score + finding.riskScore, 0))
    : text.trim() ? 0 : null
  const riskLevel = overallRiskScore == null
    ? 'Unable to assess'
    : overallRiskScore >= 60 ? 'High' : overallRiskScore >= 25 ? 'Medium' : 'Low'
  const summary = !text.trim()
    ? 'No readable text was extracted. This may be a scanned PDF; run OCR or upload a text-based PDF or DOCX to assess its terms.'
    : findings.length
      ? `A local text scan found ${findings.length} clause pattern${findings.length === 1 ? '' : 's'} for review. The score reflects only the matched wording and is not a legal opinion.`
      : 'The scan found no matches for its limited review rules. This does not establish that the contract is risk-free.'

  return {
    overallRiskScore,
    riskLevel,
    riskDistribution: overallRiskScore == null ? [] : [
      { name: 'High', value: findings.filter(finding => finding.severity === 'High').length },
      { name: 'Medium', value: findings.filter(finding => finding.severity === 'Medium').length },
      { name: 'Low', value: findings.filter(finding => finding.severity === 'Low').length },
    ].filter(item => item.value > 0),
    summary,
    findings,
    clauses: findings,
    clauseCount: findings.length,
    readableText: Boolean(text.trim()),
  }
}

const stopWords = new Set([
  'about', 'after', 'again', 'against', 'also', 'and', 'are', 'any', 'can', 'could',
  'does', 'for', 'from', 'have', 'how', 'into', 'its', 'may', 'might', 'more',
  'most', 'not', 'our', 'please', 'should', 'some', 'such', 'than', 'that', 'the',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'what',
  'when', 'where', 'which', 'who', 'will', 'with', 'would', 'you', 'your',
  'agreement', 'contract', 'term', 'terms',
])

const normalizeQueryTerm = (term) => term
  .replace(/ies$/i, 'y')
  .replace(/(?:ingly|edly|ing|ed|ly|al|s)$/i, '')
  .replace(/(?:ment|al|s)$/i, '')

export const answerContractQuestion = (text, question, findings = []) => {
  const queryTerms = [...new Set(
    (question.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || [])
      .filter(term => term.length > 1 && !stopWords.has(term))
      .map(normalizeQueryTerm)
      .filter(term => term.length > 1),
  )]
  const relevantFindings = findings.filter(finding => {
    if (/\b(risk|risks|flag|flags|issue|issues|recommend|recommendation)\b/i.test(question)) return true
    const findingText = `${finding.title} ${finding.category} ${finding.quote} ${finding.rationale}`.toLowerCase()
    return queryTerms.some(term => findingText.includes(term))
  }).slice(0, 4)

  const sections = text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map(section => section.replace(/\s+/g, ' ').trim())
    .filter(section => section.length >= 20)
  const matches = sections
    .map(section => {
      const sectionTerms = new Set(
        (section.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || []).map(normalizeQueryTerm),
      )
      const score = queryTerms.reduce((total, term) => total + (sectionTerms.has(term) ? 1 : 0), 0)
      return { section, score }
    })
    .filter(match => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)

  return {
    excerpts: matches.map(match => match.section.slice(0, 700)),
    findings: relevantFindings,
    matched: matches.length > 0 || relevantFindings.length > 0,
  }
}

export const analyzeContractFile = async (file) => {
  const text = await extractDocumentText(file)
  return reviewContractText(text)
}
