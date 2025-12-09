import { useEffect, useMemo, useState, useCallback } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { TicketPriority, type Ticket, type TicketStatus } from '@onfire/shared';
import {
  listTickets,
  getTicket,
  replyTicket,
  reassignTicket,
  escalateTicket,
  updateTicketStatus,
  updateTicketPriority,
  fetchSummary,
  bulkAssign,
  bulkUpdateStatus,
  listTeams,
  listProducts
} from './api';
import { AppShell, Button, Topbar, Input, Badge } from '@onfire/ui';
import { Search, RefreshCw, ArrowUpRight, LayoutDashboard, ListChecks, Shield, KeyRound } from 'lucide-react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { usePagination } from './hooks/usePagination';
import { useAuth } from './hooks/useAuth';
import { TicketsPanel } from './components/TicketsPanel';
import { TicketDetailPanel } from './components/TicketDetailPanel';
import { BulkActions } from './components/BulkActions';
import { LoginPage } from './components/LoginPage';
import { Dashboard } from './components/Dashboard';
import { Management } from './components/Management';
import { InstallPage } from './components/InstallPage';
import { Account } from './components/Account';

export default function App() {
  return (
    <AppRoutes />
  );
}

const AppRoutes = () => {
  const navigate = useNavigate();
  const { authStatus, authUser, setAuthStatus, setAuthUser, ensureSession, signOut, hasPermission } = useAuth();
  const sidebar = useMemo(() => {
    const base = [
      { key: 'dashboard', label: 'Dashboard', path: '/', icon: <LayoutDashboard className="h-4 w-4" /> },
      { key: 'tickets', label: '工单列表', path: '/tickets', icon: <ListChecks className="h-4 w-4" /> },
      { key: 'account', label: '账户', path: '/account', icon: <KeyRound className="h-4 w-4" /> }
    ];
    if (hasPermission('tenant.manage') || hasPermission('product.manage') || hasPermission('team.manage') || hasPermission('template.write') || hasPermission('user.manage')) {
      base.push({ key: 'admin', label: '管理', path: '/admin', icon: <Shield className="h-4 w-4" /> });
    }
    return base;
  }, [hasPermission]);
  const [summary, setSummary] = useState({
    tenants: 0,
    products: 0,
    pendingTickets: 0,
    escalated: 0,
    overdue: 0,
    topPending: [] as Ticket[],
    topOverdue: [] as Ticket[],
    topEscalated: [] as Ticket[],
    scope: ''
  });
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [teamOptions, setTeamOptions] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<string[]>([]);
  const [filters, setFilters] = useState<{ status?: TicketStatus; priority?: TicketPriority; keyword?: string; team?: string; product?: string; overdue?: boolean }>({});
  const [sortBy, setSortBy] = useState<'priority' | 'recent' | 'overdue'>('priority');
  const [replyText, setReplyText] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [escalateReason, setEscalateReason] = useState('');
  const [priorityReason, setPriorityReason] = useState('');
  const [priorityDraft, setPriorityDraft] = useState<TicketPriority>(TicketPriority.Medium);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkAssignee, setBulkAssignee] = useState('');
  const pagination = usePagination<Ticket>(tickets, 10);
  const canAssign = hasPermission('ticket.assign');
  const canClose = hasPermission('ticket.close');
  const canEscalate = hasPermission('ticket.escalate');
  const canWrite = hasPermission('ticket.write');
  const canManageTenant = hasPermission('tenant.manage');
  const canManageProduct = hasPermission('product.manage');
  const canManageTeam = hasPermission('team.manage');
  const canManageTemplate = hasPermission('template.write');
  const canManageUser = hasPermission('user.manage');
  const canManageAny = canManageTenant || canManageProduct || canManageTeam || canManageTemplate || canManageUser;

  const handleAuthError = useCallback(
    (err: unknown) => {
      if ((err as any)?.status === 401 || (err as Error)?.message === 'unauthorized') {
        signOut();
        return true;
      }
      return false;
    },
    [signOut]
  );

  const loadSummary = useCallback(() => {
    fetchSummary()
      .then((data) => setSummary(data))
      .catch(() => undefined);
  }, []);

  const sortTickets = useCallback(
    (data: Ticket[]) => {
      if (sortBy === 'priority') {
        const weight: Record<TicketPriority, number> = { high: 0, medium: 1, low: 2 };
        return [...data].sort((a, b) => weight[a.priority] - weight[b.priority]);
      }
      if (sortBy === 'overdue') {
        return [...data].sort((a, b) => {
          const aOver = Number(Boolean(a.sla?.acceptBreached || a.sla?.replyBreached));
          const bOver = Number(Boolean(b.sla?.acceptBreached || b.sla?.replyBreached));
          if (aOver !== bOver) return bOver - aOver;
          return (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);
        });
      }
      return [...data].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
    },
    [sortBy]
  );

  const fetchList = useCallback(() => {
    if (authStatus !== 'authed') return;
    listTickets({
      status: filters.status,
      priority: filters.priority,
      teamId: filters.team,
      productId: filters.product,
      overdue: filters.overdue,
      pageSize: 100
    })
      .then((res) => {
        const list = sortTickets(res.data).filter((t) =>
          (filters.keyword ? t.subject.toLowerCase().includes(filters.keyword.toLowerCase()) : true) &&
          (filters.team ? t.teamId === filters.team : true) &&
          (filters.product ? t.productId === filters.product : true) &&
          (filters.overdue ? Boolean(t.sla?.acceptBreached || t.sla?.replyBreached) : true)
        );
        setTickets(list);
        pagination.goto(1);
        setSelectedIds(new Set());
      })
      .catch((err) => {
        if (!handleAuthError(err)) setAuthStatus('unauth');
      });
  }, [authStatus, filters.keyword, filters.priority, filters.status, filters.team, filters.product, filters.overdue, sortBy, sortTickets, pagination, handleAuthError, setAuthStatus]);

  useEffect(() => {
    if (authStatus !== 'authed') return;
    listTeams()
      .then((res) => setTeamOptions(res.data.map((t) => t.id)))
      .catch((err) => {
        if (!handleAuthError(err)) setAuthStatus('unauth');
      });
    listProducts()
      .then((res) => setProductOptions(res.data.map((p) => p.id)))
      .catch((err) => {
        if (!handleAuthError(err)) setAuthStatus('unauth');
      });
  }, [authStatus, handleAuthError, setAuthStatus]);

  const openTicket = useCallback(
    (id: string) => {
      navigate(`/tickets/${id}`);
      getTicket(id)
        .then((res) => {
          setSelected(res);
          setPriorityDraft(res.ticket.priority);
          setPriorityReason('');
          setCloseReason('');
          setEscalateReason('');
        })
        .catch(() => setSelected(null));
    },
    [navigate]
  );

  useEffect(() => {
    ensureSession();
  }, [ensureSession]);

  useEffect(() => {
    if (authStatus !== 'authed') return;
    fetchList();
    loadSummary();
  }, [authStatus, fetchList, loadSummary]);

  const submitReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    try {
      await replyTicket(selected.ticket.id, { content: replyText });
      setReplyText('');
      openTicket(selected.ticket.id);
      fetchList();
    } finally {
      setLoading(false);
    }
  };

  const submitAssign = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await reassignTicket(selected.ticket.id, { assigneeId: assignTo });
      openTicket(selected.ticket.id);
      fetchList();
    } finally {
      setLoading(false);
    }
  };

  const escalate = async () => {
    if (!selected) return;
    if (!escalateReason) return;
    setLoading(true);
    try {
      await escalateTicket(selected.ticket.id, { reason: escalateReason });
      openTicket(selected.ticket.id);
      fetchList();
      setEscalateReason('');
    } finally {
      setLoading(false);
    }
  };

  const closeTicket = async () => {
    if (!selected) return;
    if (!closeReason) return;
    setLoading(true);
    try {
      await updateTicketStatus(selected.ticket.id, { status: 'closed' as TicketStatus, reason: closeReason });
      openTicket(selected.ticket.id);
      fetchList();
      setCloseReason('');
    } finally {
      setLoading(false);
    }
  };

  const changePriority = async () => {
    if (!selected || !priorityDraft || !priorityReason) return;
    setLoading(true);
    try {
      await updateTicketPriority(selected.ticket.id, { priority: priorityDraft, reason: priorityReason });
      openTicket(selected.ticket.id);
      fetchList();
      setPriorityReason('');
    } finally {
      setLoading(false);
    }
  };

  if (authStatus === 'loading') {
    return <div className="flex h-screen items-center justify-center text-sm text-zinc-600">正在检查登录...</div>;
  }

  if (authStatus === 'setup') {
    return (
      <Routes>
        <Route path="/install" element={<InstallPage onFinished={ensureSession} />} />
        <Route path="*" element={<Navigate to="/install" replace />} />
      </Routes>
    );
  }

  if (authStatus === 'unauth') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onSuccess={ensureSession} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <AppShell
      sidebar={sidebar}
      topbarSlot={
        <Topbar
          title="OnFire 客服工作台"
          actions={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-zinc-400" />
                <Input
                  className="h-9 w-48 pl-8"
                  placeholder="搜索主题/ID"
                  value={filters.keyword ?? ''}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
                />
              </div>
              <Button size="sm" variant="outline" onClick={fetchList}>
                <RefreshCw className="mr-2 h-4 w-4" />
                刷新
              </Button>
              <Badge variant="info">待处理 {summary.pendingTickets}</Badge>
              <Badge variant="warning">超时 {summary.overdue ?? 0}</Badge>
              {authUser?.email && (
                <span className="rounded-md bg-zinc-100 px-3 py-1 text-xs text-zinc-700">已登录 {authUser.email}</span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  localStorage.removeItem('onfire.session');
                  setAuthStatus('unauth');
                  setAuthUser(null);
                  navigate('/login');
                }}
              >
                退出
              </Button>
            </div>
          }
        />
      }
      footerSlot={<span className="text-xs text-zinc-500">Cloudflare Worker · Elysia · D1 · Better Auth</span>}
    >
      <Routes>
        <Route
          path="/"
          element={<Dashboard summary={summary} tickets={tickets.slice(0, 6)} onOpen={openTicket} selectedId={selected?.ticket.id} />}
        />
        <Route
          path="/tickets"
          element={
            <TicketsPanel
              filters={filters}
              setFilters={setFilters}
              sortBy={sortBy}
              setSortBy={setSortBy}
              tickets={tickets}
              teamOptions={teamOptions}
              productOptions={productOptions}
              onRefresh={fetchList}
              onOpen={openTicket}
              selectedId={selected?.ticket.id}
              pagination={pagination}
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
              onOpenAssign={() => setShowAssignDialog(true)}
              onOpenClose={() => setShowCloseDialog(true)}
              canAssign={canAssign}
              canClose={canClose}
            />
          }
        />
        <Route
          path="/admin"
          element={
            canManageAny ? (
              <Management
                canManageTenant={canManageTenant}
                canManageProduct={canManageProduct}
                canManageTeam={canManageTeam}
                canManageTemplate={canManageTemplate}
                canManageUser={canManageUser}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="/account" element={<Account />} />
        <Route path="/tickets/:id" element={<Navigate to="/tickets" replace />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {selected && (
        <TicketDetailPanel
          ticket={selected}
          loading={loading}
          assignTo={assignTo}
          setAssignTo={setAssignTo}
          onAssign={submitAssign}
          onClose={closeTicket}
          onEscalate={escalate}
          closeReason={closeReason}
          setCloseReason={setCloseReason}
          escalateReason={escalateReason}
          setEscalateReason={setEscalateReason}
          priorityDraft={priorityDraft}
          setPriorityDraft={setPriorityDraft}
          priorityReason={priorityReason}
          setPriorityReason={setPriorityReason}
          onChangePriority={changePriority}
          replyText={replyText}
          setReplyText={setReplyText}
          onReply={submitReply}
          onSelect={(checked) => {
            const next = new Set(selectedIds);
            if (checked) next.add(selected.ticket.id);
            else next.delete(selected.ticket.id);
            setSelectedIds(next);
          }}
          selectedIds={selectedIds}
          canAssign={canAssign}
          canClose={canClose}
          canEscalate={canEscalate}
          canReply={canWrite}
        />
      )}

      <BulkActions
        openAssign={showAssignDialog}
        setOpenAssign={setShowAssignDialog}
        openClose={showCloseDialog}
        setOpenClose={setShowCloseDialog}
        bulkAssignee={bulkAssignee}
        setBulkAssignee={setBulkAssignee}
        bulkReason={bulkReason}
        setBulkReason={setBulkReason}
        selectedIds={selectedIds}
        canAssign={canAssign}
        canClose={canClose}
        onBulkAssign={async () => {
          if (!bulkAssignee || selectedIds.size === 0) return;
          setLoading(true);
          try {
            await bulkAssign(Array.from(selectedIds), { assigneeId: bulkAssignee });
            fetchList();
            setShowAssignDialog(false);
            setSelectedIds(new Set());
            setBulkAssignee('');
          } finally {
            setLoading(false);
          }
        }}
        onBulkClose={async () => {
          if (selectedIds.size === 0) return;
          setLoading(true);
          try {
            await bulkUpdateStatus(Array.from(selectedIds), { status: 'closed' as TicketStatus, reason: bulkReason || '批量关闭' });
            fetchList();
            setShowCloseDialog(false);
            setSelectedIds(new Set());
            setBulkReason('');
          } finally {
            setLoading(false);
          }
        }}
      />
    </AppShell>
  );
};

const Tabs = ({ active, onChange }: { active: 'dashboard' | 'tickets'; onChange: (k: 'dashboard' | 'tickets') => void }) => (
  <div className="flex gap-2 rounded-lg border border-zinc-200 bg-white p-1 text-sm">
    {[
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'tickets', label: '工单' }
    ].map((tab) => (
      <button
        key={tab.key}
        onClick={() => onChange(tab.key as any)}
        className={`flex-1 rounded-md px-3 py-2 font-medium transition ${active === tab.key ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

// Dashboard moved to components
