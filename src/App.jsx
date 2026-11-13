import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, Link, NavLink, useParams, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, FileText, Upload, ShieldAlert, Bot, BarChart3, Search, FileIcon, X, UploadCloud, GanttChart, LogOut } from 'lucide-react'
import { analyzeContractFile, answerContractQuestion } from './services/documentAnalysis.js'
import { getContracts, getContract, getClauses, getRiskAnalysis, getContractAnalysis, getContractDocumentText, getNegotiationRecommendations, getReports, saveContract, saveReport, setStorageUserId } from './services/api.js'
import { getCurrentUser, registerAccount, signIn, signOut } from './services/auth.js'

export default function App() {
  const [user, setUser] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState('')

  useEffect(() => {
    getCurrentUser()
      .then(currentUser => {
        setUser(currentUser)
        setStorageUserId(currentUser?.id || null)
      })
      .catch(error => setSessionError(error.message))
      .finally(() => setSessionLoading(false))
  }, [])

  const handleLogin = (currentUser) => {
    setUser(currentUser)
    setStorageUserId(currentUser.id)
    setSessionError('')
  }

  const handleLogout = async () => {
    await signOut()
    setStorageUserId(null)
    setUser(null)
  }

  if (sessionLoading) {
    return <div className="auth-loading" role="status">Checking your account…</div>
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={handleLogin} serviceError={sessionError} />} />
      <Route path="/signup" element={user ? <Navigate to="/dashboard" replace /> : <SignupPage onRegister={handleLogin} serviceError={sessionError} />} />
      <Route path="/*" element={<AuthenticatedApp user={user} onLogout={handleLogout} />} />
    </Routes>
  )
}

function AuthenticatedApp({ user, onLogout }) {
  const location = useLocation()
  return user
    ? <MainLayout user={user} onLogout={onLogout} />
    : <Navigate to="/login" state={{ from: location }} replace />
}

function MainLayout({ user, onLogout }) {
  return (
    <div className="app-shell">
      <Sidebar user={user} />
      <main className="main">
        <Topbar user={user} onLogout={onLogout} />
        <div className="content">
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/contracts/:id" element={<ContractDetailsPage />} />
            <Route path="/contracts/:id/clauses" element={<ClauseViewerPage />} />
            <Route path="/contracts/:id/risk" element={<RiskAnalysisPage />} />
            <Route path="/contracts/:id/negotiation" element={<NegotiationPage />} />
            <Route path="/negotiation" element={<NegotiationContractsPage />} />
            <Route path="/upload" element={<UploadContractPage />} />
            <Route path="/risk-analysis" element={<DedicatedRiskPage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="*" element={<DashboardPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

function Sidebar({ user }) {
  const nav = [
    { label: 'Dashboard', to: '/dashboard', icon: <LayoutDashboard /> },
    { label: 'Contracts', to: '/contracts', icon: <FileText /> },
    { label: 'Upload Contract', to: '/upload', icon: <Upload /> },
    { label: 'Risk Analysis', to: '/risk-analysis', icon: <ShieldAlert /> },
    { label: 'Negotiation', to: '/negotiation', icon: <GanttChart /> },
    { label: 'AI Assistant', to: '/assistant', icon: <Bot /> },
    { label: 'Reports', to: '/reports', icon: <BarChart3 /> },
  ]

  return (
    <aside className="sidebar">
      <div className="logo-wrap">
        <div className="logo-icon">N</div>
        <div>
          <div className="logo-title">NegoLex AI</div>
        </div>
      </div>

      <nav className="nav-list">
        {nav.map((n) => (
          <NavLink className="nav-link" key={n.label} to={n.to}>
            {n.icon}<span>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-profile">
        <div className="avatar">{user.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</div>
        <div>
          <div className="sidebar-name">{user.name}</div>
          <div className="sidebar-role">{user.company || user.email}</div>
        </div>
      </div>
    </aside>
  )
}

function Topbar({ user, onLogout }) {
  const [error, setError] = useState('')

  const handleLogout = async () => {
    setError('')
    try {
      await onLogout()
    } catch (logoutError) {
      setError(logoutError.message)
    }
  }

  return (
    <div className="topbar">
      <div className="page-title">Contract Intelligence</div>
      <div className="topbar-right">
        <div className="topbar-account">{user.name}</div>
        <button className="icon-btn" type="button" aria-label="Sign out" title="Sign out" onClick={handleLogout}><LogOut size={16} /></button>
      </div>
      {error && <div className="auth-inline-error" role="alert">{error}</div>}
    </div>
  )
}

function LoginPage({ onLogin, serviceError }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(serviceError)
  const [submitting, setSubmitting] = useState(false)
  const redirectTo = location.state?.from?.pathname || '/dashboard'

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      onLogin(await signIn({ email, password }))
      navigate(redirectTo, { replace: true })
    } catch (loginError) {
      setError(loginError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <header className="login-header">
          <div className="login-brand-wrap">
            <div className="logo-icon">N</div>
            <div>
              <div className="logo-title">NegoLex AI</div>
            </div>
          </div>
        </header>

        <section className="login-center">
          <section className="login-card">
            <div className="login-card-top">
              <div className="login-title-wrap">
                <div className="login-title">Welcome back</div>
                <div className="login-subtitle">Sign in to continue</div>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <label className="form-label" htmlFor="login-email">Email</label>
              <input className="form-input" id="login-email" type="email" autoComplete="email" placeholder="Enter your email" value={email} onChange={event => setEmail(event.target.value)} required />

              <label className="form-label" htmlFor="login-password">Password</label>
              <input className="form-input" id="login-password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={event => setPassword(event.target.value)} required />

              {error && <div className="auth-error" role="alert">{error}</div>}
              <div className="login-actions">
                <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign In'}</button>
              </div>
            </form>

            <div className="login-signup">
              <span>Don't have an account?</span>
              <Link className="muted-link" to="/signup">Sign up</Link>
            </div>
          </section>
        </section>
      </div>
    </div>
  )
}

function SignupPage({ onRegister, serviceError }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(serviceError)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      onRegister(await registerAccount({ name, email, password }))
      navigate('/dashboard', { replace: true })
    } catch (registrationError) {
      setError(registrationError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <header className="login-header">
          <div className="login-brand-wrap">
            <div className="logo-icon">N</div>
            <div>
              <div className="logo-title">NegoLex AI</div>
            </div>
          </div>
        </header>

        <section className="login-center">
          <section className="login-card signup-card">
            <div className="login-card-top signup-card-top">
              <div className="login-title-wrap">
                <div className="login-title">Create account</div>
                <div className="login-subtitle">Start your contract intelligence workspace</div>
              </div>
            </div>

            <form className="signup-form" onSubmit={handleSubmit}>
              <label className="form-label" htmlFor="signup-name">Full name</label>
              <input className="form-input" id="signup-name" autoComplete="name" placeholder="Enter your full name" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={100} required />

              <label className="form-label" htmlFor="signup-email">Email</label>
              <input className="form-input" id="signup-email" type="email" autoComplete="email" placeholder="name@company.com" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required />

              <label className="form-label" htmlFor="signup-password">Password</label>
              <input className="form-input" id="signup-password" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={event => setPassword(event.target.value)} minLength={8} maxLength={128} required />

              {error && <div className="auth-error" role="alert">{error}</div>}
              <div className="login-actions">
                <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? 'Creating account…' : 'Create Account'}</button>
                <Link className="btn google-button" to="/login">Back to Sign In</Link>
              </div>

              <div className="login-signup">
                <span>Already have an account?</span>
                <Link className="muted-link" to="/login">Sign in</Link>
              </div>
            </form>
          </section>
        </section>
      </div>
    </div>
  )
}

function DashboardPage() {
  const [contracts, setContracts] = useState([])
  const [riskAnalysis, setRiskAnalysis] = useState(null)

  useEffect(() => {
    getContracts().then(setContracts)
    getRiskAnalysis().then(setRiskAnalysis)
  }, [])

  return (
    <>
      <section className="dashboard-header">
        <div className="dashboard-header-copy">
          <div className="dashboard-title-brand">NegoLex AI</div>
          <div className="dashboard-title-subtitle">Intelligent Contract Negotiation Assistant</div>
        </div>
        <div className="dashboard-header-actions">
          <div className="dashboard-welcome">Welcome</div>
          <Link className="btn btn-primary" to="/upload">+ Upload Contract</Link>
        </div>
      </section>

      <section style={{ marginTop: 30 }}>
        <div className="section-title">Risk Overview</div>
        <div className="risk-grid">
          <div className="chart-card">
            <RiskPieChart analysis={riskAnalysis} />
          </div>
          <div className="chart-card">
            <RecentContracts contracts={contracts} />
          </div>
        </div>
      </section>
    </>
  )
}

function RiskPieChart({ analysis }) {
  const distribution = analysis?.riskDistribution || []

  if (distribution.length) {
    return <div className="empty-risk-card">
      <div className="empty-risk-title">Risk Overview</div>
      {distribution.map(item => <div key={item.name}>{item.name}: {item.value}</div>)}
    </div>
  }

  return (
    <div className="empty-risk-card">
      <div className="empty-risk-title">No risk data available</div>
      <div className="empty-risk-text">Risk analysis will appear here after contracts are analyzed.</div>
    </div>
  )
}

function RecentContracts({ contracts }) {
  return (
    <div>
      <div className="section-title" style={{ marginTop: 0, fontSize: 18 }}>Recent Contracts</div>
      <div className="table-wrap recent-contracts-table">
        <table>
          <thead>
            <tr><th>Contract Name</th><th>Type</th><th>Status</th><th>Risk Level</th><th>Action</th></tr>
          </thead>
          <tbody>
            {contracts.slice(0, 5).map(contract => <tr key={contract.id}>
              <td title={contract.name}>{contract.name}</td><td>{contract.type || '—'}</td><td>{contract.status || '—'}</td><td>{contract.riskLevel || '—'}</td><td><Link className="table-action" to={`/contracts/${contract.id}`}>View</Link></td>
            </tr>)}
            {contracts.length === 0 && <tr>
              <td colSpan="5">
                <div className="empty-recent">
                  <div className="empty-recent-title">No contracts uploaded yet</div>
                  <div className="empty-recent-text">Upload a contract to get started.</div>
                  <Link className="btn btn-primary empty-upload-btn" to="/upload">Upload Contract</Link>
                </div>
              </td>
            </tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ContractsPage() {
  const [contracts, setContracts] = useState([])

  useEffect(() => {
    getContracts().then(setContracts)
  }, [])

  return (
    <>
      <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="section-title" style={{ marginTop: 0 }}>Contracts</div>
          <div className="logo-subtitle">Manage and analyze your uploaded contracts.</div>
        </div>
        <Link className="btn btn-primary" to="/upload">+ Upload Contract</Link>
      </section>
      <section className="chart-card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="search-wrap" style={{ width: '280px' }}><Search size={14} /><input placeholder="Search contracts..." /></div>
        </div>
        <div className="table-wrap contract-list-table" style={{ marginTop: 20 }}>
          <div className="table-scroll-hint">Scroll horizontally to see all contract columns.</div>
          <table>
            <thead>
              <tr><th>Contract Name</th><th>Type</th><th>Upload Date</th><th>Clauses</th><th>Risk Score</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {contracts.map(c => <tr key={c.id}><td><FileIcon size={16} /> {c.name}</td><td>{c.type}</td><td>{c.uploadedDate}</td><td>{c.clauses}</td><td>{c.riskScore}</td><td><span className={`badge ${(c.status || '').toLowerCase().replace(/\s/g, '-')}`}>{c.status}</span></td><td><Link className="table-action" to={`/contracts/${c.id}`}>View</Link></td></tr>)}
              {contracts.length === 0 && <tr><td colSpan="7" className="empty-recent-text">No contracts available.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function UploadContractPage() {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [uploadedContract, setUploadedContract] = useState(null)

  const uploadFile = async (file) => {
    setError('')
    setMessage('')
    setUploadedContract(null)
    if (!file) return
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setError('Choose a PDF or DOCX file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('The file is larger than the 10 MB limit.')
      return
    }

    setUploading(true)
    try {
      const analysis = await analyzeContractFile(file)
      const metadata = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        type: file.name.split('.').pop().toUpperCase(),
        fileType: file.type || file.name.split('.').pop().toUpperCase(),
        uploadedDate: new Date().toLocaleDateString(),
        clauses: analysis.clauseCount,
        riskScore: analysis.overallRiskScore,
        riskLevel: analysis.riskLevel,
        summary: analysis.summary,
        status: analysis.readableText ? 'Analyzed' : 'Needs Review',
      }
      const formData = new FormData()
      formData.append('file', file)
      const saved = await saveContract(formData, metadata, file, analysis)
      setUploadedContract({ ...saved, analysis })
      setMessage(saved.remote ? `${file.name} uploaded successfully.` : `${file.name} is saved in this browser. The contract API is unavailable, so it has not been shared with your team.`)
    } catch (uploadError) {
      setError(uploadError.message || 'The contract could not be uploaded.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    uploadFile(event.dataTransfer.files[0])
  }

  return (
    <>
      <section>
        <div className="section-title" style={{ marginTop: 0 }}>Upload Contract</div>
        <div className="logo-subtitle">Upload a contract to extract clauses and perform AI-powered risk analysis.</div>
      </section>
      <section className="chart-card" style={{ marginTop: 20 }}>
        <div
          className={`upload-zone${dragging ? ' is-dragging' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Choose or drop a PDF or DOCX contract to upload"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
          }}
          onDrop={handleDrop}
          aria-disabled={uploading}
        >
          <UploadCloud size={54} />
          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 12 }}>{uploading ? 'Uploading contract…' : 'Drag & drop your contract here'}</div>
          <div className="logo-subtitle">or click to browse your device</div>
          <div className="logo-subtitle" style={{ marginTop: 16 }}>Supported formats: PDF, DOCX · Maximum file size: 10 MB</div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            onChange={(event) => uploadFile(event.target.files[0])}
          />
        </div>
        {message && <div className="upload-message" role="status">{message}</div>}
        {error && <div className="upload-error" role="alert">{error}</div>}
      </section>
      {uploadedContract && <section className="chart-card upload-analysis-card">
        <div className="report-preview-header">
          <div>
            <div className="section-title" style={{ marginTop: 0 }}>{uploadedContract.name}</div>
            <div className="logo-subtitle">{uploadedContract.type} · Uploaded {uploadedContract.uploadedDate}</div>
          </div>
          <span className={`badge ${(uploadedContract.riskLevel || '').toLowerCase().replace(/\s/g, '-')}`}>
            {uploadedContract.riskScore == null ? 'Risk not assessed' : `${uploadedContract.riskLevel} risk · ${uploadedContract.riskScore}/100`}
          </span>
        </div>
        <p>{uploadedContract.analysis.summary}</p>
        <div className="table-wrap contract-findings-table">
          <table>
            <thead><tr><th>Finding</th><th>Severity</th><th>Contract wording</th><th>Suggested review</th></tr></thead>
            <tbody>
              {uploadedContract.analysis.findings.map(finding => <tr key={finding.id}>
                <td>{finding.title}</td>
                <td><span className={`badge ${finding.severity.toLowerCase()}`}>{finding.severity}</span></td>
                <td>{finding.quote}</td>
                <td>{finding.recommendation}</td>
              </tr>)}
              {!uploadedContract.analysis.findings.length && <tr><td colSpan="4" className="empty-recent-text">
                {uploadedContract.analysis.readableText ? 'No supported risk patterns matched. This does not mean the contract is risk-free.' : 'No readable text was found. Scanned PDFs require OCR before their content can be reviewed.'}
              </td></tr>}
            </tbody>
          </table>
        </div>
        <div className="analysis-disclaimer">Automated text-pattern review only; not legal advice and not a substitute for review by a qualified lawyer.</div>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn btn-primary" to={`/contracts/${uploadedContract.id}/risk`}>Open Risk Analysis</Link>
          <Link className="btn btn-secondary" to="/reports">View Reports</Link>
        </div>
      </section>}
    </>
  )
}

function ContractDetailsPage() {
  const { id } = useParams()
  const [contract, setContract] = useState(null)

  useEffect(() => {
    getContract(id).then(setContract)
  }, [id])

  return (
    <>
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="section-title" style={{ marginTop: 0 }}>{contract?.name || 'Contract Details'}</div>
          {contract && <div className="logo-subtitle">File Type: {contract.fileType || '—'} · Upload Date: {contract.uploadedDate || '—'} · Pages: {contract.pages ?? '—'} · Clauses: {contract.clauses ?? '—'} · Risk Score: {contract.riskScore ?? '—'}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary">Analyze Contract</button>
          <button className="btn btn-secondary">Download</button>
          <button className="btn btn-primary">Export Report</button>
        </div>
      </section>
      <section className="detail-layout" style={{ marginTop: 20 }}>
        <aside className="detail-nav">
          <NavLink className="nav-link" to={`/contracts/${id}`}>Overview</NavLink>
          <NavLink className="nav-link" to={`/contracts/${id}/clauses`}>Clauses</NavLink>
          <NavLink className="nav-link" to={`/contracts/${id}/risk`}>Risk Analysis</NavLink>
          <NavLink className="nav-link" to={`/contracts/${id}/negotiation`}>Negotiation</NavLink>
          <NavLink className="nav-link" to="/assistant">Assistant</NavLink>
        </aside>
        <section className="chart-card">
          <div className="section-title" style={{ marginTop: 0 }}>Contract Overview</div>
          {contract ? <div className="analysis-grid">
            <div className="original-box">
              <div className="logo-subtitle">File Information</div>
              {contract.riskScore != null && <div className="badge high">Risk Score {contract.riskScore}</div>}
              <div style={{ marginTop: 12 }}><strong>Status:</strong> {contract.status || '—'}</div>
            </div>
            <div className="analysis-box">
              <div className="logo-subtitle">AI Summary</div>
              <p>{contract.summary || 'No analysis available.'}</p>
            </div>
          </div> : <div className="empty-risk-text">No contract data available.</div>}
        </section>
      </section>
    </>
  )
}

function ClauseViewerPage() {
  const { id } = useParams()
  const [clauses, setClauses] = useState([])

  useEffect(() => {
    getClauses(id).then(setClauses)
  }, [id])
  return (
    <>
      <section>
        <div className="section-title" style={{ marginTop: 0 }}>Clause Viewer</div>
      </section>
      <section className="clause-view-layout">
        <aside className="clause-list">
          <div className="clause-list-title">Clause List</div>
          {clauses.map((clause, i) => (
            <div className="clause-item" key={clause.id}>
              <div className="clause-content">
                <span>{clause.number} <br /> <strong>{clause.title}</strong></span>
                <span className={`badge ${clause.risk.toLowerCase()}`}>{clause.risk}</span>
              </div>
            </div>
          ))}
          {clauses.length === 0 && <div className="empty-risk-text">No clauses available.</div>}
        </aside>
        <section className="clause-text-panel">
          {clauses.length > 0 ? <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="section-title" style={{ marginTop: 0 }}>{clauses[0].number} — {clauses[0].title}</div>
              {clauses[0].risk && <span className={`badge ${clauses[0].risk.toLowerCase()}`}>{clauses[0].risk}</span>}
            </div>
            <div className="analysis-grid">
              <section className="original-box"><div className="section-title" style={{ marginTop: 0, fontSize: 16 }}>Original Contract Text</div><p>{clauses[0].originalText || 'No clause text available.'}</p></section>
              <section className="analysis-box"><div className="section-title" style={{ marginTop: 0, fontSize: 16 }}>AI Analysis</div><p>{clauses[0].analysis || clauses[0].summary || 'No analysis available.'}</p></section>
            </div>
          </> : <div className="empty-risk-text">No clause details available.</div>}
        </section>
      </section>
    </>
  )
}

function RiskAnalysisPage() {
  const { id } = useParams()
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    getRiskAnalysis(id)
      .then(setAnalysis)
      .catch(() => setError('The contract risk scan could not be loaded.'))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <>
      <section>
        <div className="section-title" style={{ marginTop: 0 }}>Risk Analysis</div>
        <div className="logo-subtitle">Findings are based on text extracted from this contract.</div>
      </section>
      <section className="chart-card">
        {loading ? <div className="empty-risk-text">Loading contract risk review…</div>
          : error ? <div className="upload-error" role="alert">{error}</div>
            : analysis ? <>
              <div className="analysis-grid">
                <div className="original-box">
                  <div className="section-title" style={{ marginTop: 0, fontSize: 16 }}>Overall Risk Score</div>
                  <div className="risk-score-value">{analysis.overallRiskScore == null ? '—' : `${analysis.overallRiskScore}/100`}</div>
                  <span className={`badge ${(analysis.riskLevel || 'low').toLowerCase().replace(/\s/g, '-')}`}>{analysis.riskLevel || 'Reviewed'}</span>
                </div>
                <div className="analysis-box">
                  <div className="section-title" style={{ marginTop: 0, fontSize: 16 }}>Review summary</div>
                  <p>{analysis.summary}</p>
                </div>
              </div>
              <RiskFindingsTable findings={analysis.findings || analysis.clauses || []} />
              <div className="analysis-disclaimer">Automated text-pattern review only; not legal advice and not a substitute for review by a qualified lawyer.</div>
            </> : <div className="empty-risk-text">No contract was found for this risk review.</div>}
      </section>
    </>
  )
}

function NegotiationPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)

  useEffect(() => {
    getNegotiationRecommendations(id).then(setData)
  }, [id])
  return (
    <>
      <section>
        <div className="section-title" style={{ marginTop: 0 }}>Negotiation Workspace</div>
        <div className="logo-subtitle">Negotiation recommendations</div>
      </section>
      <section className="chart-card">
        {data ? <>
        <div style={{ marginBottom: 14 }}>
          <div className="section-title" style={{ marginTop: 0 }}>User Goals</div>
          <ul>
            {data.goals.map((x, index) => <li key={`${index}-${x}`}>{x}</li>)}
          </ul>
        </div>
        <div className="section-title" style={{ fontSize: 16 }}>Priority Clauses</div>
        <div className="table-wrap">
          <table>
            <tbody>
              {data.priorities.map((p, i) => <tr key={i}><td><strong>{i+1}. {p.clause}</strong></td><td><span className="badge high">{p.level}</span></td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="section-title" style={{ fontSize: 16, marginTop: 18 }}>AI-generated suggestions requiring human review.</div>
        {data.recommendations.map((r, i) => <div className="analysis-grid" key={r.clause} style={{ marginTop: 16 }}>
          <div className="original-box">
            <div style={{ fontWeight: 800 }}>{r.clause}</div>
            <div className="logo-subtitle">Current Clause</div>
            <p>{r.quote || 'Review the original contract wording for this clause.'}</p>
            <div><strong>Risk:</strong> {r.risk}</div>
            <div><strong>Negotiation Objective:</strong> {r.objective}</div>
            <div><strong>Suggested Strategy:</strong> {r.strategy}</div>
          </div>
          <div className="analysis-box">
            <div><strong>Suggested Questions:</strong></div>
            <ul>{r.questions.map((q, index) => <li key={`${index}-${q}`}>{q}</li>)}</ul>
            <div><strong>Suggested Approach:</strong> {r.wording || r.objective}</div>
          </div>
        </div>)}
        </> : <div className="empty-risk-text">No negotiation data available.</div>}
      </section>
    </>
  )
}

function NegotiationContractsPage() {
  const [contracts, setContracts] = useState([])

  useEffect(() => {
    getContracts().then(setContracts)
  }, [])

  return (
    <>
      <section>
        <div className="section-title" style={{ marginTop: 0 }}>Negotiation</div>
        <div className="logo-subtitle">Review uploaded contracts and open their negotiation workspace.</div>
      </section>
      <section className="chart-card" style={{ marginTop: 20 }}>
        <div className="table-wrap contract-list-table">
          <div className="table-scroll-hint">Scroll horizontally to see all contract columns.</div>
          <table>
            <thead>
              <tr><th>Contract Name</th><th>Type</th><th>Upload Date</th><th>Clauses</th><th>Risk Score</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {contracts.map(contract => (
                <tr key={contract.id}>
                  <td><FileIcon size={16} /> {contract.name}</td>
                  <td>{contract.type || contract.fileType || '—'}</td>
                  <td>{contract.uploadedDate || '—'}</td>
                  <td>{contract.clauses ?? '—'}</td>
                  <td>{contract.riskScore ?? '—'}</td>
                  <td><span className={`badge ${(contract.status || '').toLowerCase().replace(/\s/g, '-')}`}>{contract.status || 'Uploaded'}</span></td>
                  <td><Link className="table-action" to={`/contracts/${contract.id}/negotiation`}>Open</Link></td>
                </tr>
              ))}
              {contracts.length === 0 && <tr><td colSpan="7" className="empty-recent-text">No contracts uploaded yet. <Link to="/upload">Upload a contract</Link> to get started.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function AssistantPage() {
  const [contracts, setContracts] = useState([])
  const [selectedContractId, setSelectedContractId] = useState('')
  const [contractText, setContractText] = useState('')
  const [findings, setFindings] = useState([])
  const [loadingContracts, setLoadingContracts] = useState(true)
  const [loadingContract, setLoadingContract] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const messagesEndRef = useRef(null)

  useEffect(() => {
    let active = true
    getContracts()
      .then(items => {
        if (!active) return
        setContracts(items)
        if (items.length) setSelectedContractId(String(items[0].id))
      })
      .catch(loadError => {
        if (active) setError(loadError.message || 'Could not load your contracts.')
      })
      .finally(() => {
        if (active) setLoadingContracts(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    setContractText('')
    setFindings([])
    setMessages([])
    setError('')
    if (!selectedContractId) return () => { active = false }

    setLoadingContract(true)
    Promise.all([
      getContractDocumentText(selectedContractId),
      getContractAnalysis(selectedContractId),
    ])
      .then(([text, analysis]) => {
        if (!active) return
        setContractText(text)
        setFindings(analysis?.findings || analysis?.clauses || [])
      })
      .catch(loadError => {
        if (active) setError(loadError.message || 'Could not read this contract.')
      })
      .finally(() => {
        if (active) setLoadingContract(false)
      })
    return () => { active = false }
  }, [selectedContractId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, sending])

  const selectedContract = contracts.find(contract => String(contract.id) === selectedContractId)

  const sendQuestion = async (event) => {
    event.preventDefault()
    const submittedQuestion = question.trim()
    if (!submittedQuestion || sending) return
    if (!selectedContract) {
      setError('Upload a contract before asking a question.')
      return
    }
    if (loadingContract) return
    setQuestion('')
    setError('')
    setSending(true)
    setMessages(current => [...current, {
      id: `${Date.now()}-question`,
      role: 'user',
      text: submittedQuestion,
    }])

    try {
      if (!contractText.trim()) {
        setMessages(current => [...current, {
          id: `${Date.now()}-answer`,
          role: 'assistant',
          text: 'I could not extract readable text from this file. It may be a scanned PDF; OCR is needed before I can answer questions about it.',
        }])
        return
      }
      const result = answerContractQuestion(contractText, submittedQuestion, findings)
      const parts = []
      if (result.excerpts.length) {
        parts.push(`Relevant wording from ${selectedContract.name}:\n${result.excerpts.map(excerpt => `• “${excerpt}”`).join('\n')}`)
      }
      if (result.findings.length) {
        parts.push(`Related review flags:\n${result.findings.map(finding => `• ${finding.title} (${finding.severity || finding.risk}): ${finding.recommendation || finding.rationale}`).join('\n')}`)
      }
      if (!result.matched) {
        parts.push(`I couldn't find wording in ${selectedContract.name} that directly matches your question. Try terms from the contract or ask about a specific topic such as termination, renewal, liability, or indemnity.`)
      }
      parts.push('Answers are based on text matches in this document, not legal advice.')
      setMessages(current => [...current, {
        id: `${Date.now()}-answer`,
        role: 'assistant',
        text: parts.join('\n\n'),
      }])
    } catch (answerError) {
      setError(answerError.message || 'Could not search this contract.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <section>
        <div className="section-title" style={{ marginTop: 0 }}>NegoLex Contract Assistant</div>
        <div className="logo-subtitle">Ask questions and get answers grounded in the wording of your uploaded contract.</div>
      </section>
      <section className="chat-layout">
        <section className="chat-panel">
          <label className="form-label" htmlFor="assistant-contract">Contract</label>
          <select
            className="form-input assistant-contract-select"
            id="assistant-contract"
            value={selectedContractId}
            disabled={loadingContracts || contracts.length === 0}
            onChange={event => setSelectedContractId(event.target.value)}
          >
            {loadingContracts && <option value="">Loading contracts…</option>}
            {!loadingContracts && contracts.length === 0 && <option value="">No uploaded contracts</option>}
            {contracts.map(contract => <option key={contract.id} value={contract.id}>{contract.name}</option>)}
          </select>
          {error && <div className="auth-error" role="alert">{error}</div>}
          {!loadingContracts && !contracts.length ? <div className="assistant-empty">
            <p>Upload a PDF or DOCX contract to start asking questions about its terms.</p>
            <Link className="btn btn-primary" to="/upload">Upload Contract</Link>
          </div> : <>
            <div className="assistant-messages" aria-live="polite">
              {!messages.length && <div className="assistant-empty">
                {loadingContract ? 'Reading the selected contract…' : contractText
                  ? `Ask a question about ${selectedContract?.name}. Answers use matching contract text and identified review flags.`
                  : 'No readable contract text is available yet.'}
              </div>}
              {messages.map(message => <div className={`chat-message ${message.role}`} key={message.id}>
                <div className="chat-message-role">{message.role === 'user' ? 'You' : 'Contract Assistant'}</div>
                <div className="chat-message-text">{message.text}</div>
              </div>)}
              {sending && <div className="chat-message assistant" role="status">Searching the contract…</div>}
              <div ref={messagesEndRef} />
            </div>
            <form className="chat-input-row" onSubmit={sendQuestion}>
              <textarea
                aria-label="Ask a question about this contract"
                placeholder="Ask about termination, payment, liability…"
                value={question}
                onChange={event => setQuestion(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form.requestSubmit()
                  }
                }}
                maxLength={1000}
                disabled={loadingContract || !contractText || sending}
              />
              <button className="btn btn-primary" type="submit" disabled={loadingContract || !contractText || !question.trim() || sending}>
                {sending ? 'Searching…' : 'Send'}
              </button>
            </form>
          </>}
        </section>
        <aside className="chat-panel">
          <div className="section-title" style={{ marginTop: 0, fontSize: 18 }}>Contract Context</div>
          {loadingContract ? <div className="empty-risk-text">Loading contract details…</div>
            : selectedContract ? <>
              <div className="assistant-context-name">{selectedContract.name}</div>
              <div className="empty-risk-text">{contractText ? `${contractText.length.toLocaleString()} characters of contract text loaded.` : 'This document has no readable text.'}</div>
              {findings.length > 0 && <div className="assistant-context-flags">
                <strong>Flagged for review</strong>
                {findings.slice(0, 5).map(finding => <div className="assistant-flag" key={finding.id}>
                  <span className={`badge ${(finding.severity || finding.risk || 'low').toLowerCase()}`}>{finding.severity || finding.risk}</span>
                  <span>{finding.title}</span>
                </div>)}
              </div>}
            </> : <div className="empty-risk-text">No contract selected.</div>}
          <div className="analysis-disclaimer">Document text is searched in this browser and is not sent to an AI provider.</div>
        </aside>
      </section>
    </>
  )
}

function DedicatedRiskPage() {
  const [analysis, setAnalysis] = useState(null)

  useEffect(() => {
    getRiskAnalysis().then(setAnalysis)
  }, [])

  return (
    <>
      <section>
        <div className="section-title" style={{ marginTop: 0 }}>Risk Analysis</div>
        <div className="logo-subtitle">Identify and understand potentially unfavorable contract clauses.</div>
      </section>
      {analysis && <section className="dashboard-grid">
        <div className="summary-card"><div className="label">Average Contract Risk Score</div><div className="value">{analysis.overallRiskScore == null ? '—' : `${analysis.overallRiskScore}/100`}</div><div className="trend">{analysis.summary}</div></div>
      </section>}
      <section className="risk-grid" style={{ marginTop: 20 }}>
        <div className="chart-card"><RiskPieChart analysis={analysis} /></div>
        <div className="chart-card">
          <div className="section-title" style={{ marginTop: 0 }}>Review by severity</div>
          {analysis?.riskDistribution?.length ? analysis.riskDistribution.map(item => <div className="risk-breakdown-row" key={item.name}><span className={`badge ${item.name.toLowerCase()}`}>{item.name}</span><strong>{item.value} finding{item.value === 1 ? '' : 's'}</strong></div>) : <div className="empty-risk-text">No matching risk patterns in the reviewed contracts.</div>}
        </div>
      </section>
      <section className="chart-card" style={{ marginTop: 20 }}>
        <div className="section-title" style={{ marginTop: 0, fontSize: 20 }}>Clause Risk Table</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Clause</th><th>Category</th><th>Risk Score</th><th>Risk Level</th><th>Priority</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {analysis?.clauses?.map(clause => <tr key={`${clause.contractId}-${clause.id}`}><td>{clause.title}<div className="table-secondary">{clause.contractName}</div></td><td>{clause.category}</td><td>{clause.riskScore}</td><td><span className={`badge ${(clause.severity || clause.risk || 'low').toLowerCase()}`}>{clause.severity || clause.risk || '—'}</span></td><td>{clause.priority || clause.severity}</td><td>{clause.contractName ? 'Needs review' : 'Reviewed'}</td><td><Link className="table-action" to={`/contracts/${clause.contractId}/risk`}>View</Link></td></tr>)}
              {!analysis?.clauses?.length && <tr><td colSpan="7" className="empty-recent-text">No clause risk data available.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function RiskFindingsTable({ findings }) {
  return <div className="table-wrap contract-findings-table" style={{ marginTop: 20 }}>
    <table>
      <thead><tr><th>Finding</th><th>Category</th><th>Severity</th><th>Contract wording</th><th>Suggested review</th></tr></thead>
      <tbody>
        {findings.map(finding => <tr key={finding.id}>
          <td>{finding.title}</td>
          <td>{finding.category}</td>
          <td><span className={`badge ${(finding.severity || finding.risk || 'low').toLowerCase()}`}>{finding.severity || finding.risk}</span></td>
          <td>{finding.quote || 'Finding returned by contract analysis.'}</td>
          <td>{finding.recommendation || finding.rationale || 'Review this wording with a qualified contract professional.'}</td>
        </tr>)}
        {!findings.length && <tr><td colSpan="5" className="empty-recent-text">No supported risk patterns matched. This does not mean the contract is risk-free.</td></tr>}
      </tbody>
    </table>
  </div>
}

function ReportsPage() {
  const [reports, setReports] = useState([])
  const [contracts, setContracts] = useState([])
  const [reviews, setReviews] = useState({})
  const [selectedReport, setSelectedReport] = useState(null)
  const [reviewError, setReviewError] = useState('')
  const [reviewsLoading, setReviewsLoading] = useState(true)

  useEffect(() => {
    getReports().then(setReports)
    getContracts().then(async items => {
      setContracts(items)
      const results = await Promise.all(items.map(async contract => {
        try {
          return [contract.id, await getContractAnalysis(contract.id)]
        } catch (error) {
          return [contract.id, { error: error.message || 'Could not analyze this contract.' }]
        }
      }))
      setReviews(Object.fromEntries(results))
      setReviewsLoading(false)
    }).catch(error => {
      setReviewError(error.message || 'Could not load uploaded contracts.')
      setReviewsLoading(false)
    })
  }, [])

  const reportTypes = [
    'Contract Risk Report',
    'Negotiation Preparation Report',
    'Clause Analysis Report',
  ]

  const generateReport = (type) => {
    const createdAt = new Date().toLocaleString()
    const lines = [
      'NEGOLEX CONTRACT REVIEW',
      type,
      `Generated: ${createdAt}`,
      `Contracts included: ${contracts.length}`,
      'Method: Local text extraction and rule-based pattern review.',
      'Important: Automated screening only; not legal advice and not a complete legal review.',
      '',
      ...contracts.flatMap((contract, index) => {
        const review = reviews[contract.id]
        const section = [
          `${index + 1}. ${contract.name}`,
          `   Type: ${contract.type || contract.fileType || '—'}`,
          `   Upload date: ${contract.uploadedDate || '—'}`,
        ]
        if (!review || review.error) return [
          ...section,
          `   Review unavailable: ${review?.error || 'No readable document analysis is available.'}`,
          '',
        ]
        section.push(
          `   Risk score: ${review.overallRiskScore == null ? 'Unable to assess' : `${review.overallRiskScore}/100 (${review.riskLevel})`}`,
          `   Summary: ${review.summary}`,
          `   Flagged clauses: ${(review.findings || []).length}`,
        )
        if (type === 'Negotiation Preparation Report') {
          section.push('   Negotiation priorities:')
          if (review.findings?.length) {
            review.findings.forEach((finding, findingIndex) => {
              section.push(
                `     ${findingIndex + 1}. ${finding.title} (${finding.severity})`,
                `        Proposed review: ${finding.recommendation}`,
                `        Text: "${finding.quote}"`,
              )
            })
          } else {
            section.push('     No supported risk patterns matched; review the agreement as a whole.')
          }
        } else if (type === 'Clause Analysis Report') {
          section.push('   Matched clause patterns:')
          if (review.findings?.length) {
            review.findings.forEach(finding => section.push(
              `     ${finding.title} | ${finding.category} | ${finding.severity}`,
              `        Why flagged: ${finding.rationale}`,
              `        Contract text: "${finding.quote}"`,
              `        Suggested review: ${finding.recommendation}`,
            ))
          } else {
            section.push('     No supported risk patterns were found in the extracted text.')
          }
        } else {
          section.push('   Risk findings:')
          if (review.findings?.length) {
            review.findings.forEach(finding => section.push(
              `     ${finding.severity}: ${finding.title} (${finding.category})`,
              `        Contract text: "${finding.quote}"`,
              `        Suggested review: ${finding.recommendation}`,
            ))
          } else {
            section.push('     No supported risk patterns were found in the extracted text.')
          }
        }
        section.push('')
        return section
      }),
      ...(contracts.length ? [] : ['No contracts have been uploaded yet.']),
    ]
    const report = {
      id: `report-${Date.now()}`,
      name: type,
      type,
      createdAt,
      status: 'Ready',
      owner: 'You',
      content: lines.join('\n'),
    }
    saveReport(report)
    setReports(current => [report, ...current.filter(item => item.id !== report.id)])
    setSelectedReport(report)
  }

  const downloadReport = (report) => {
    const blob = new Blob([report.content || `${report.name}\nGenerated: ${report.createdAt}`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${report.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const latestReport = (type) => reports.find(report => report.type === type || report.name === type)

  return (
    <>
      <section>
        <div className="section-title" style={{ marginTop: 0 }}>Reports</div>
        <div className="logo-subtitle">Generate downloadable reviews from extracted contract text and clause findings.</div>
      </section>
      {reviewError && <div className="upload-error" role="alert">{reviewError}</div>}
      <section className="report-grid">
        {reportTypes.map(type => {
          const report = latestReport(type)
          return <div className="summary-card" key={type}>
            <div className="label">{type}</div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" disabled={!report} onClick={() => setSelectedReport(report)}>View</button>
              <button className="btn btn-primary" disabled={reviewsLoading} onClick={() => generateReport(type)}>{reviewsLoading ? 'Preparing…' : 'Generate'}</button>
              <button className="btn btn-secondary" disabled={!report} onClick={() => downloadReport(report)}>Download</button>
            </div>
          </div>
        })}
      </section>
      {selectedReport && <section className="chart-card report-preview" style={{ marginTop: 20 }}>
        <div className="report-preview-header">
          <div>
            <div className="section-title" style={{ marginTop: 0, fontSize: 18 }}>{selectedReport.name}</div>
            <div className="logo-subtitle">Generated {selectedReport.createdAt}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => downloadReport(selectedReport)}>Download</button>
            <button className="icon-btn" aria-label="Close report preview" onClick={() => setSelectedReport(null)}><X size={16} /></button>
          </div>
        </div>
        <pre className="report-content">{selectedReport.content || `${selectedReport.name}\nGenerated: ${selectedReport.createdAt}`}</pre>
      </section>}
      <section className="chart-card" style={{ marginTop: 20 }}>
        <div className="section-title" style={{ marginTop: 0, fontSize: 20 }}>Recent Reports</div>
        <div className="table-wrap">
          <table className="reportTable">
            <thead><tr><th>Report</th><th>Type</th><th>Created</th><th>Status</th><th>Owner</th></tr></thead>
            <tbody>
              {reports.map(r => <tr key={r.id}><td>{r.name}</td><td>{r.type}</td><td>{r.createdAt}</td><td><span className="badge analyzed">{r.status || 'Ready'}</span></td><td>{r.owner || 'You'}</td></tr>)}
              {reports.length === 0 && <tr><td colSpan="5" className="empty-recent-text">No reports available.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
