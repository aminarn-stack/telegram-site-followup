import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, authenticate, type SessionUser } from './api';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

type SiteStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';
interface SiteListItem {
  id: string;
  status: SiteStatus;
  site: {
    publicId: string;
    siteIdText: string;
    siteType: string;
    sectorAddition: string;
    region: { code: string };
    assignedUsers: { user: { id: string; firstName: string; lastName?: string } }[];
  };
  template: { code: string };
  progress: { completed: number; total: number };
}

function useApiQuery<T>(key: unknown[], path: string) {
  return useQuery<T>({ queryKey: key, queryFn: () => api<T>(path) });
}

function Status({ value }: { value: string }) {
  return (
    <span className={`status status-${value.toLowerCase().replaceAll('_', '-')}`}>
      {value.replaceAll('_', ' ')}
    </span>
  );
}

function Shell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const links: [string, string][] = [
    ['/', 'Dashboard'],
    ['/sites', 'Sites'],
    ...(user.role === 'ADMIN'
      ? ([
          ['/imports', 'Imports'],
          ['/admin', 'Admin'],
          ['/audit', 'Audit'],
        ] as [string, string][])
      : []),
  ];
  return (
    <div className="shell">
      <header>
        <div>
          <strong>Site Follow Up</strong>
          <small>
            {user.firstName} · {user.role}
          </small>
        </div>
      </header>
      <main>{children}</main>
      <nav aria-label="Primary">
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Dashboard() {
  const { data, isLoading, error } = useApiQuery<{
    total: number;
    counts: Record<string, number>;
    latestBatch?: { reportingWeek: string; acceptedRows: number };
    blocked: {
      site: { publicId: string; siteIdText: string; region: { code: string } };
      steps: { templateStep: { label: string } }[];
    }[];
    sitesByStatus: Record<
      SiteStatus,
      {
        publicId: string;
        siteIdText: string;
        region: string;
        actionableSteps: string[];
      }[]
    >;
  }>(['dashboard'], '/api/dashboard');
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorView error={error} />;
  const cards = [
    ['Total', data.total],
    ['Not Started', data.counts.NOT_STARTED ?? 0],
    ['In Progress', data.counts.IN_PROGRESS ?? 0],
    ['Blocked', data.counts.BLOCKED ?? 0],
    ['Completed', data.counts.COMPLETED ?? 0],
  ];
  const statusSections: { key: SiteStatus; label: string }[] = [
    { key: 'NOT_STARTED', label: 'Not Started' },
    { key: 'IN_PROGRESS', label: 'In Progress' },
    { key: 'BLOCKED', label: 'Blocked' },
    { key: 'COMPLETED', label: 'Completed' },
  ];
  return (
    <section>
      <div className="page-title">
        <div>
          <h1>Weekly overview</h1>
          <p>
            {data.latestBatch
              ? `Latest import ${new Date(data.latestBatch.reportingWeek).toLocaleDateString()}`
              : 'No committed import yet'}
          </p>
        </div>
        <Link className="button" to="/sites">
          Open sites
        </Link>
      </div>
      <div className="metric-grid">
        {cards.map(([label, value]) => (
          <article className="metric" key={String(label)}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>
      <h2>Sites by status</h2>
      <div className="status-groups">
        {statusSections.map(({ key, label }) => {
          const sites = data.sitesByStatus[key] ?? [];
          return (
            <details
              className="status-group"
              key={key}
              open={sites.length > 0 && (key === 'IN_PROGRESS' || key === 'BLOCKED')}
            >
              <summary>
                <Status value={key} />
                <strong>{sites.length}</strong>
              </summary>
              {sites.length ? (
                <div className="site-id-grid">
                  {sites.map((site) => (
                    <Link to={`/sites/${site.publicId}`} key={site.publicId}>
                      <strong>{site.siteIdText}</strong>
                      <small>
                        {site.region}
                        {site.actionableSteps[0] ? ` · Next: ${site.actionableSteps[0]}` : ''}
                      </small>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty text={`No ${label.toLowerCase()} sites.`} />
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}

function Sites() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const { data, isLoading, error } = useApiQuery<{ items: SiteListItem[]; total: number }>(
    ['sites', query],
    `/api/sites?${query}`,
  );
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  return (
    <section>
      <div className="page-title">
        <div>
          <h1>Sites</h1>
          <p>{data?.total ?? 0} matching sites</p>
        </div>
      </div>
      <div className="filters">
        <input
          aria-label="Search site ID"
          placeholder="Search Site ID"
          value={params.get('search') ?? ''}
          onChange={(event) => update('search', event.target.value)}
        />
        <select
          aria-label="Status filter"
          value={params.get('status') ?? ''}
          onChange={(event) => update('status', event.target.value)}
        >
          <option value="">All statuses</option>
          {['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <input
          aria-label="Region filter"
          placeholder="Region"
          value={params.get('region') ?? ''}
          onChange={(event) => update('region', event.target.value)}
        />
        <input
          aria-label="Import week filter"
          type="date"
          value={params.get('week') ?? ''}
          onChange={(event) => update('week', event.target.value)}
        />
        <select
          aria-label="Site type filter"
          value={params.get('siteType') ?? ''}
          onChange={(event) => update('siteType', event.target.value)}
        >
          <option value="">All site types</option>
          <option value="NORMAL">Normal</option>
          <option value="SHARED">Shared</option>
        </select>
        <select
          aria-label="Sector addition filter"
          value={params.get('sectorAddition') ?? ''}
          onChange={(event) => update('sectorAddition', event.target.value)}
        >
          <option value="">All sector settings</option>
          <option value="YES">Included</option>
          <option value="NO">Not included</option>
        </select>
        <input
          aria-label="Assigned user filter"
          placeholder="Assigned user UUID"
          value={params.get('assignedUser') ?? ''}
          onChange={(event) => update('assignedUser', event.target.value)}
        />
      </div>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorView error={error} />
      ) : (
        <div className="card-list">
          {data?.items.map((item) => (
            <Link className="site-card" to={`/sites/${item.site.publicId}`} key={item.id}>
              <div className="site-row">
                <div>
                  <strong>{item.site.siteIdText}</strong>
                  <small>
                    {item.site.region.code} · {item.site.siteType} · Sector{' '}
                    {item.site.sectorAddition}
                  </small>
                </div>
                <Status value={item.status} />
              </div>
              <div className="progress">
                <span
                  style={{ width: `${(item.progress.completed / item.progress.total) * 100}%` }}
                />
              </div>
              <small>
                {item.progress.completed} of {item.progress.total} steps complete
              </small>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

interface SiteDetailData {
  siteIdText: string;
  siteType: string;
  sectorAddition: string;
  region: { code: string };
  workflow: { status: SiteStatus; template: { code: string; version: number }; steps: StepData[] };
  audit: {
    id: string;
    action: string;
    createdAt: string;
    actor?: { firstName: string; lastName?: string };
    reason?: string;
  }[];
}
interface StepData {
  id: string;
  answer?: string;
  state: string;
  comment?: string;
  version: number;
  updatedAt: string;
  templateStep: {
    code: string;
    label: string;
    prerequisiteCode?: string;
    allowedAnswers: string[];
  };
  evidence: { id: string; originalFilename: string }[];
  escalation?: { reason: string; resolvedAt?: string };
}

function SiteDetail({ user }: { user: SessionUser }) {
  const { publicId } = useParams();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useApiQuery<SiteDetailData>(
    ['site', publicId],
    `/api/sites/${publicId}`,
  );
  const [editing, setEditing] = useState<StepData | null>(null);
  const [answer, setAnswer] = useState('');
  const [comment, setComment] = useState('');
  const [evidence, setEvidence] = useState<File>();
  const mutation = useMutation({
    mutationFn: async () => {
      await api(`/api/site-steps/${editing!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ answer, comment, version: editing!.version }),
      });
      if (evidence) {
        const form = new FormData();
        form.append('file', evidence);
        await api(`/api/site-steps/${editing!.id}/evidence`, { method: 'POST', body: form });
      }
    },
    onSuccess: async () => {
      window.Telegram?.WebApp.HapticFeedback?.notificationOccurred('success');
      setEditing(null);
      setEvidence(undefined);
      await queryClient.invalidateQueries({ queryKey: ['site', publicId] });
    },
    onError: () => window.Telegram?.WebApp.HapticFeedback?.notificationOccurred('error'),
  });
  const reopen = useMutation({
    mutationFn: ({ stepId, reason }: { stepId: string; reason: string }) =>
      api(`/api/site-steps/${stepId}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site', publicId] }),
  });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorView error={error} />;
  return (
    <section>
      <Link className="back" to="/sites">
        ← Sites
      </Link>
      <div className="page-title">
        <div>
          <h1>{data.siteIdText}</h1>
          <p>
            {data.region.code} · {data.siteType} · Sector {data.sectorAddition}
          </p>
        </div>
        <Status value={data.workflow.status} />
      </div>
      <div className="timeline">
        {data.workflow.steps.map((step, index) => (
          <article
            className={`step step-${step.state.toLowerCase().replaceAll('_', '-')}`}
            key={step.id}
          >
            <div className="step-number">{index + 1}</div>
            <div className="step-body">
              <div className="site-row">
                <div>
                  <strong>{step.templateStep.label}</strong>
                  <small>
                    {step.templateStep.code === 'SITE_IMPLEMENTATION'
                      ? 'Requires all previous steps'
                      : step.templateStep.prerequisiteCode
                        ? `Requires ${step.templateStep.prerequisiteCode.replaceAll('_', ' ')}`
                        : 'No prerequisite'}
                  </small>
                </div>
                <Status value={step.state} />
              </div>
              {step.answer && (
                <p>
                  <b>Answer:</b> {step.answer}
                </p>
              )}
              {step.comment && (
                <p>
                  <b>Comment:</b> {step.comment}
                </p>
              )}
              {step.escalation && !step.escalation.resolvedAt && (
                <p className="danger">
                  <b>Blocked:</b> {step.escalation.reason}
                </p>
              )}
              {step.evidence.map((file) => (
                <a key={file.id} href={`/api/evidence/${file.id}`} className="file">
                  {file.originalFilename}
                </a>
              ))}
              {['ADMIN', 'CONTRIBUTOR'].includes(user.role) &&
                step.state !== 'LOCKED' &&
                step.state !== 'NEEDS_REVIEW' && (
                  <button
                    className="secondary"
                    onClick={() => {
                      setEditing(step);
                      setAnswer(step.answer ?? '');
                      setComment(step.comment ?? '');
                      setEvidence(undefined);
                    }}
                  >
                    Update step
                  </button>
                )}
              {user.role === 'ADMIN' && step.answer && (
                <button
                  className="secondary"
                  onClick={() => {
                    const reason = window.prompt('Reason for reopening this branch');
                    if (reason?.trim()) reopen.mutate({ stepId: step.id, reason });
                  }}
                >
                  Reopen branch
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <h2>History</h2>
      <div className="history">
        {data.audit.map((item) => (
          <div key={item.id}>
            <strong>{item.action.replaceAll('_', ' ')}</strong>
            <span>
              {item.actor?.firstName ?? 'System'} · {new Date(item.createdAt).toLocaleString()}
            </span>
            {item.reason && <p>{item.reason}</p>}
          </div>
        ))}
      </div>
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <form
            className="modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (
                confirm(
                  `Save ${answer} for ${editing.templateStep.label} on Site ${data.siteIdText}?`,
                )
              )
                mutation.mutate();
            }}
          >
            <h2>Update {editing.templateStep.label}</h2>
            <label>
              Answer
              <select required value={answer} onChange={(event) => setAnswer(event.target.value)}>
                <option value="">Select an answer</option>
                {editing.templateStep.allowedAnswers.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Comment
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Required for negative outcomes"
              />
            </label>
            <label>
              Evidence document or image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => setEvidence(event.target.files?.[0])}
              />
            </label>
            {mutation.error && <p className="danger">{mutation.error.message}</p>}
            <div className="actions">
              <button type="button" className="secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button disabled={mutation.isPending}>Confirm and save</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function Imports() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File>();
  const [week, setWeek] = useState(new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<{
    id: string;
    acceptedRows: number;
    rejectedRows: number;
    rows: {
      id: string;
      rowNumber: number;
      siteIdText?: string;
      valid: boolean;
      errors: string[];
    }[];
  }>();
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Select a file.');
      const form = new FormData();
      form.append('file', file);
      return api<typeof preview>(`/api/imports?reportingWeek=${week}`, {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: (data) => setPreview(data),
  });
  const commit = useMutation({
    mutationFn: () => api(`/api/imports/${preview!.id}/commit`, { method: 'POST' }),
    onSuccess: () => navigate('/'),
  });
  return (
    <section>
      <div className="page-title">
        <div>
          <h1>Weekly import</h1>
          <p>Upload 1–40 sites, validate, then commit.</p>
        </div>
        <Link className="secondary button" to="/batches">
          Batch history
        </Link>
      </div>
      <div className="panel form-grid">
        <label>
          Reporting week
          <input type="date" value={week} onChange={(event) => setWeek(event.target.value)} />
        </label>
        <label>
          Excel or CSV
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        </label>
        <button onClick={() => upload.mutate()} disabled={upload.isPending}>
          Validate file
        </button>
        {upload.error && <p className="danger">{upload.error.message}</p>}
      </div>
      {preview && (
        <div className="panel">
          <h2>Validation preview</h2>
          <div className="metric-grid compact">
            <article className="metric">
              <strong>{preview.acceptedRows}</strong>
              <span>Valid</span>
            </article>
            <article className="metric">
              <strong>{preview.rejectedRows}</strong>
              <span>Rejected</span>
            </article>
          </div>
          <div className="preview-table">
            {preview.rows.map((row) => (
              <div key={row.id}>
                <span>Row {row.rowNumber}</span>
                <strong>{row.siteIdText || 'Missing Site ID'}</strong>
                <span className={row.valid ? 'success' : 'danger'}>
                  {row.valid ? 'Valid' : row.errors.join(' ')}
                </span>
              </div>
            ))}
          </div>
          <button
            disabled={preview.rejectedRows > 0 || commit.isPending}
            onClick={() => commit.mutate()}
          >
            Commit batch
          </button>
          {preview.rejectedRows > 0 && (
            <p className="danger">Correct every rejected row and upload again before commit.</p>
          )}
        </div>
      )}
    </section>
  );
}

function Batches() {
  const { data, isLoading, error } = useApiQuery<
    {
      id: string;
      reportingWeek: string;
      sourceFilename: string;
      status: string;
      acceptedRows: number;
      rejectedRows: number;
      createdAt: string;
    }[]
  >(['batches'], '/api/imports');
  if (isLoading) return <Loading />;
  if (error) return <ErrorView error={error} />;
  return (
    <section>
      <Link className="back" to="/imports">
        ← Import
      </Link>
      <h1>Batch history</h1>
      <div className="card-list">
        {data?.map((batch) => (
          <article className="card" key={batch.id}>
            <div>
              <strong>{new Date(batch.reportingWeek).toLocaleDateString()}</strong>
              <small>
                {batch.sourceFilename} · {batch.acceptedRows} accepted
              </small>
            </div>
            <Status value={batch.status} />
          </article>
        ))}
      </div>
    </section>
  );
}

function Admin() {
  const queryClient = useQueryClient();
  const [archiveResult, setArchiveResult] = useState<string>();
  const { data: users } = useApiQuery<
    {
      id: string;
      telegramUserId: string;
      firstName: string;
      role: string;
      active: boolean;
      regions: { region: { code: string } }[];
    }[]
  >(['users'], '/api/admin/users');
  const { data: chats } = useApiQuery<
    {
      id: string;
      telegramChatId: string;
      groupName?: string;
      timezone: string;
      reminderSchedule: string;
    }[]
  >(['chats'], '/api/admin/chats');
  const { data: templates } = useApiQuery<
    { id: string; code: string; version: number; steps: unknown[] }[]
  >(['templates'], '/api/admin/templates');
  const saveUser = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
  const saveChat = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/api/admin/chats', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chats'] }),
  });
  const saveRegion = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/api/admin/regions', { method: 'POST', body: JSON.stringify(body) }),
  });
  const cloneTemplate = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/api/admin/templates/${id}/clone`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });
  const archivePlan = useMutation({
    mutationFn: (reason: string) =>
      api<{ archivedSites: number; archivedWorkflows: number }>('/api/admin/plans/archive', {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: async (result) => {
      setArchiveResult(
        `${result.archivedSites} sites archived. You can now import the next weekly plan.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['sites'] }),
      ]);
    },
  });
  return (
    <section>
      <h1>Administration</h1>
      <h2>Weekly plan</h2>
      <div className="panel archive-panel">
        <div>
          <strong>Archive the current plan</strong>
          <p>
            Preserves its workflows and audit history, then removes its site IDs from the active
            dashboard. Only sites in the next import will become active again.
          </p>
        </div>
        <button
          className="destructive"
          disabled={archivePlan.isPending}
          onClick={() => {
            const reason = window.prompt('Reason for archiving this weekly plan');
            if (!reason?.trim()) return;
            if (
              window.confirm(
                'Archive all active site workflows? This clears the current dashboard for the next weekly import.',
              )
            )
              archivePlan.mutate(reason.trim());
          }}
        >
          {archivePlan.isPending ? 'Archiving…' : 'Archive current plan'}
        </button>
        {archiveResult && <p className="success-message">{archiveResult}</p>}
        {archivePlan.error && <p className="danger">{archivePlan.error.message}</p>}
      </div>
      <h2>Users and region access</h2>
      <form
        className="panel form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          saveUser.mutate({
            telegramUserId: form.get('telegramUserId'),
            firstName: form.get('firstName'),
            role: form.get('role'),
            active: true,
            regions: String(form.get('regions') ?? '')
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
          });
        }}
      >
        <label>
          Telegram user ID
          <input name="telegramUserId" inputMode="numeric" required />
        </label>
        <label>
          Display name
          <input name="firstName" required />
        </label>
        <label>
          Role
          <select name="role" defaultValue="CONTRIBUTOR">
            <option>ADMIN</option>
            <option>CONTRIBUTOR</option>
            <option>VIEWER</option>
          </select>
        </label>
        <label>
          Regions
          <input name="regions" placeholder="North, South" />
        </label>
        <button disabled={saveUser.isPending}>Add or update user</button>
        {saveUser.error && <p className="danger">{saveUser.error.message}</p>}
      </form>
      <div className="card-list">
        {users?.map((user) => (
          <article className="card" key={user.id}>
            <div>
              <strong>{user.firstName}</strong>
              <small>
                {user.telegramUserId} ·{' '}
                {user.regions.map((item) => item.region.code).join(', ') || 'All/none configured'}
              </small>
            </div>
            <Status value={user.active ? user.role : 'INACTIVE'} />
          </article>
        ))}
      </div>
      <h2>Regions</h2>
      <form
        className="panel form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          saveRegion.mutate({ code: form.get('code'), name: form.get('name'), active: true });
        }}
      >
        <label>
          Region code
          <input name="code" required />
        </label>
        <label>
          Region name
          <input name="name" required />
        </label>
        <button disabled={saveRegion.isPending}>Add or update region</button>
        {saveRegion.error && <p className="danger">{saveRegion.error.message}</p>}
      </form>
      <h2>Telegram groups and reminders</h2>
      <form
        className="panel form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          saveChat.mutate({
            telegramChatId: form.get('telegramChatId'),
            groupName: form.get('groupName'),
            chatType: 'group',
            active: true,
            importSummaries: true,
            reminders: true,
            escalations: true,
            timezone: form.get('timezone'),
            reminderSchedule: form.get('reminderSchedule'),
          });
        }}
      >
        <label>
          Telegram chat ID
          <input name="telegramChatId" required />
        </label>
        <label>
          Group name
          <input name="groupName" required />
        </label>
        <label>
          Timezone
          <input name="timezone" defaultValue="Asia/Tehran" required />
        </label>
        <label>
          Reminder schedule
          <input name="reminderSchedule" defaultValue="0 9 * * 1,3" required />
        </label>
        <button disabled={saveChat.isPending}>Save group settings</button>
        {saveChat.error && <p className="danger">{saveChat.error.message}</p>}
      </form>
      <div className="card-list">
        {chats?.map((chat) => (
          <article className="card" key={chat.id}>
            <div>
              <strong>{chat.groupName || chat.telegramChatId}</strong>
              <small>
                {chat.timezone} · {chat.reminderSchedule}
              </small>
            </div>
          </article>
        ))}
      </div>
      <h2>Workflow template versions</h2>
      <div className="card-list">
        {templates?.map((template) => (
          <article className="card" key={template.id}>
            <div>
              <strong>{template.code}</strong>
              <small>
                Version {template.version} · {template.steps.length} steps
              </small>
            </div>
            <button
              className="secondary"
              onClick={() => {
                const reason = window.prompt('Reason for creating the next template version');
                if (reason?.trim()) cloneTemplate.mutate({ id: template.id, reason });
              }}
            >
              Create next version
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Audit() {
  const { data, isLoading, error } = useApiQuery<{
    items: {
      id: string;
      action: string;
      entityType: string;
      createdAt: string;
      reason?: string;
      requestId: string;
      actor?: { firstName: string };
    }[];
  }>(['audit'], '/api/audit');
  if (isLoading) return <Loading />;
  if (error) return <ErrorView error={error} />;
  return (
    <section>
      <h1>Audit history</h1>
      <div className="history">
        {data?.items.map((item) => (
          <div key={item.id}>
            <strong>{item.action.replaceAll('_', ' ')}</strong>
            <span>
              {item.entityType} · {item.actor?.firstName ?? 'System'} ·{' '}
              {new Date(item.createdAt).toLocaleString()}
            </span>
            {item.reason && <p>{item.reason}</p>}
            <small>Request {item.requestId}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function Loading() {
  return <div className="loading">Loading…</div>;
}
function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
function ErrorView({ error }: { error: unknown }) {
  return (
    <div className="error-view">
      <h2>Something went wrong</h2>
      <p>{error instanceof Error ? error.message : 'Please try again.'}</p>
    </div>
  );
}

function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState<SessionUser>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    authenticate().then(setUser).catch(setError);
  }, []);
  useEffect(() => {
    if (!user) return;
    const token =
      window.Telegram?.WebApp.initDataUnsafe?.start_param ??
      new URLSearchParams(window.location.search).get('startapp');
    if (!token) return;
    api<{ kind: string; publicId?: string; status?: string }>(`/api/deep-links/${token}`)
      .then((target) => {
        if (target.kind === 'site' && target.publicId) navigate(`/sites/${target.publicId}`);
        else if (target.kind === 'filters')
          navigate(`/sites${target.status ? `?status=${target.status}` : ''}`);
      })
      .catch(setError);
  }, [navigate, user]);
  const theme = useMemo(() => window.Telegram?.WebApp.themeParams ?? {}, []);
  useEffect(() => {
    Object.entries(theme).forEach(([key, value]) =>
      document.documentElement.style.setProperty(`--tg-${key.replaceAll('_', '-')}`, value),
    );
  }, [theme]);
  if (error) return <ErrorView error={error} />;
  if (!user) return <Loading />;
  return (
    <Shell user={user}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sites" element={<Sites />} />
        <Route path="/sites/:publicId" element={<SiteDetail user={user} />} />
        {user.role === 'ADMIN' && (
          <>
            <Route path="/imports" element={<Imports />} />
            <Route path="/batches" element={<Batches />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/audit" element={<Audit />} />
          </>
        )}
        <Route path="*" element={<ErrorView error={new Error('Page not found.')} />} />
      </Routes>
    </Shell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
