import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  KeyRound,
  Laptop,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MonitorCog,
  Network,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Signal,
  SignalZero,
  Trash2,
  Unlink,
  Wifi
} from "lucide-react";
import type {
  AgentEvent,
  AgentStatus,
  EnrolledNode,
  JoinRequest,
  LabAdvertisement,
  NodeRole
} from "@lab-fleet/shared";

interface RegistrationResult {
  status: AgentStatus;
  sessionToken: string;
}

interface PairingResult {
  code: string;
  expiresAt: string;
}

export default function App(): ReactNode {
  const [status, setStatus] = useState<AgentStatus>();
  const [sessionToken, setSessionToken] = useState(
    import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "host" ? "preview-session" : ""
  );
  const [roleChoice, setRoleChoice] = useState<NodeRole>();
  const [labs, setLabs] = useState<LabAdvertisement[]>([]);
  const [nodes, setNodes] = useState<EnrolledNode[]>([]);
  const [pending, setPending] = useState<JoinRequest[]>([]);
  const [pairing, setPairing] = useState<PairingResult>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await window.labFleet.invoke<AgentStatus>("getStatus"));
      setError("");
    } catch (requestError) {
      setError(messageOf(requestError, "The Lab Fleet agent is unavailable."));
    }
  }, []);

  const refreshHostData = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [nextNodes, nextPending] = await Promise.all([
        window.labFleet.invoke<EnrolledNode[]>("listNodes", { sessionToken }),
        window.labFleet.invoke<JoinRequest[]>("listPendingJoins", { sessionToken })
      ]);
      setNodes(nextNodes);
      setPending(nextPending);
    } catch (requestError) {
      if (isUnlockRequiredError(requestError)) setSessionToken("");
      setError(messageOf(requestError));
    }
  }, [sessionToken]);

  useEffect(() => {
    void refreshStatus();
    return window.labFleet.onEvent((event: AgentEvent) => {
      if (event.event === "statusChanged") setStatus(event.data as AgentStatus);
      if (event.event === "labDiscovered") {
        const lab = event.data as LabAdvertisement;
        setLabs((current) => [...current.filter((item) => item.hostId !== lab.hostId), lab]);
      }
      if (event.event === "joinRequested") {
        const request = event.data as JoinRequest;
        setPending((current) => [...current.filter((item) => item.requestId !== request.requestId), request]);
      }
      if (event.event === "nodePresenceChanged") void refreshHostData();
      if (event.event === "membershipChanged") void refreshStatus();
      if (event.event === "agentError") {
        setError((event.data as { message?: string }).message ?? "The agent reported an error.");
      }
    });
  }, [refreshHostData, refreshStatus]);

  useEffect(() => {
    if (status?.role === "host" && status.labId && sessionToken) void refreshHostData();
  }, [refreshHostData, sessionToken, status?.labId, status?.role]);

  const run = async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError("");
    try {
      return await operation();
    } catch (requestError) {
      if (isUnlockRequiredError(requestError)) setSessionToken("");
      setError(messageOf(requestError));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return <LoadingScreen error={error} onRetry={() => void refreshStatus()} />;
  }

  let content: ReactNode;
  if (status.phase === "unconfigured") {
    content = roleChoice ? (
      <Registration
        role={roleChoice}
        busy={busy}
        onBack={() => setRoleChoice(undefined)}
        onSubmit={async (values) => {
          const result = await run(() =>
            window.labFleet.invoke<RegistrationResult>(roleChoice === "host" ? "registerHost" : "registerNode", values)
          );
          if (result) {
            setStatus(result.status);
            setSessionToken(result.sessionToken);
          }
        }}
      />
    ) : (
      <RoleSelection onSelect={setRoleChoice} />
    );
  } else if (needsUnlock(status, sessionToken)) {
    content = (
      <Unlock
        status={status}
        busy={busy}
        onSubmit={async (values) => {
          const result = await run(() =>
            window.labFleet.invoke<{ sessionToken: string }>("unlock", values)
          );
          if (result) setSessionToken(result.sessionToken);
        }}
      />
    );
  } else if (status.role === "host" && !status.labId) {
    content = (
      <CreateLab
        schoolName={status.schoolName ?? "School"}
        busy={busy}
        onSubmit={async (labName) => {
          const next = await run(() =>
            window.labFleet.invoke<AgentStatus>("createLab", { sessionToken, labName })
          );
          if (next) setStatus(next);
        }}
      />
    );
  } else if (status.role === "host") {
    content = (
      <HostDashboard
        status={status}
        nodes={nodes}
        pending={pending}
        pairing={pairing}
        busy={busy}
        onStartPairing={async () => {
          const result = await run(() =>
            window.labFleet.invoke<PairingResult>("startPairing", { sessionToken })
          );
          if (result) setPairing(result);
        }}
        onApprove={async (requestId) => {
          const result = await run(() =>
            window.labFleet.invoke("approveJoin", { sessionToken, requestId })
          );
          if (result) await refreshHostData();
        }}
        onReject={async (requestId) => {
          const result = await run(() =>
            window.labFleet.invoke("rejectJoin", { sessionToken, requestId })
          );
          if (result) await refreshHostData();
        }}
        onRemove={async (nodeId) => {
          const result = await run(() => window.labFleet.invoke("removeNode", { sessionToken, nodeId }));
          if (result) await refreshHostData();
        }}
        onRefresh={() => void refreshHostData()}
      />
    );
  } else if (status.membership) {
    content = (
      <StudentLinked
        status={status}
        busy={busy}
        onUnlink={async (values) => {
          const next = await run(() => window.labFleet.invoke<AgentStatus>("unlinkLocal", values));
          if (next) {
            setSessionToken("");
            setStatus(next);
          }
        }}
      />
    );
  } else {
    content = (
      <StudentEnrollment
        status={status}
        labs={labs}
        busy={busy}
        onRefresh={async () => {
          const discovered = await run(() => window.labFleet.invoke<LabAdvertisement[]>("discoverLabs"));
          if (discovered) setLabs(discovered);
        }}
        onJoin={async (advertisement, code) => {
          await run(() => window.labFleet.invoke("requestJoin", { sessionToken, advertisement, code }));
          await refreshStatus();
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar status={status} />
      <main className="main-content">
        {error && (
          <div className="alert" role="alert">
            <CircleAlert size={18} />
            <span>{error}</span>
            <button className="icon-button" onClick={() => setError("")} title="Dismiss error" aria-label="Dismiss error">
              <Check size={16} />
            </button>
          </div>
        )}
        {content}
      </main>
    </div>
  );
}

function Sidebar({ status }: { status: AgentStatus }): ReactNode {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><MonitorCog size={24} /></span>
        <span><strong>Lab Fleet</strong><small>Network console</small></span>
      </div>
      <div className="sidebar-context">
        <span className="eyebrow">This device</span>
        <strong>{status.role === "host" ? "H-node" : status.role === "student" ? "S-node" : "Not configured"}</strong>
        <span>{status.platform === "windows" ? "Windows" : "Ubuntu / Linux"}</span>
      </div>
      <div className="sidebar-foot">
        <ShieldCheck size={17} />
        <span>Local network only</span>
      </div>
    </aside>
  );
}

function LoadingScreen({ error, onRetry }: { error: string; onRetry(): void }): ReactNode {
  return (
    <div className="loading-screen">
      <span className="brand-mark large"><MonitorCog size={30} /></span>
      <h1>Lab Fleet</h1>
      {error ? <p>{error}</p> : <LoaderCircle className="spin" size={24} />}
      {error && <button className="button secondary" onClick={onRetry}><RefreshCw size={17} /> Retry</button>}
    </div>
  );
}

function RoleSelection({ onSelect }: { onSelect(role: NodeRole): void }): ReactNode {
  return (
    <section className="setup-page">
      <PageHeading eyebrow="Device setup" title="Choose how this computer operates" subtitle="The role is fixed until an administrator resets the local installation." />
      <div className="role-grid">
        <button className="role-card" onClick={() => onSelect("host")}>
          <span className="role-icon host"><Server size={26} /></span>
          <span><strong>H-node</strong><small>Create and manage a lab group</small></span>
          <ChevronRight size={20} />
        </button>
        <button className="role-card" onClick={() => onSelect("student")}>
          <span className="role-icon student"><Laptop size={26} /></span>
          <span><strong>S-node</strong><small>Join a lab and stay connected</small></span>
          <ChevronRight size={20} />
        </button>
      </div>
    </section>
  );
}

function Registration({ role, busy, onBack, onSubmit }: {
  role: NodeRole;
  busy: boolean;
  onBack(): void;
  onSubmit(values: Record<string, string>): Promise<void>;
}): ReactNode {
  const [values, setValues] = useState<Record<string, string>>({});
  const host = role === "host";
  return (
    <section className="setup-page narrow">
      <button className="text-button" onClick={onBack}><ArrowLeft size={17} /> Back</button>
      <PageHeading eyebrow={host ? "H-node registration" : "S-node registration"} title={host ? "Create the administrator profile" : "Register this lab computer"} subtitle="Credentials remain on this device and are stored as salted hashes." />
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void onSubmit(values); }}>
        {host && <Field label="School name" value={values.schoolName ?? ""} onChange={(schoolName) => setValues({ ...values, schoolName })} autoFocus />}
        <Field label={host ? "Admin username" : "Laptop username"} value={(host ? values.adminUsername : values.laptopUsername) ?? ""} onChange={(value) => setValues({ ...values, [host ? "adminUsername" : "laptopUsername"]: value })} autoFocus={!host} />
        <Field label="Password" type="password" value={values.password ?? ""} onChange={(password) => setValues({ ...values, password })} />
        <button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />} Register device</button>
      </form>
    </section>
  );
}

function Unlock({ status, busy, onSubmit }: { status: AgentStatus; busy: boolean; onSubmit(values: Record<string, string>): Promise<void> }): ReactNode {
  const [username, setUsername] = useState(status.laptopUsername ?? "");
  const [password, setPassword] = useState("");
  return (
    <section className="setup-page narrow">
      <span className="page-symbol"><LockKeyhole size={26} /></span>
      <PageHeading eyebrow="Protected console" title={`Unlock this ${status.role === "host" ? "H-node" : "S-node"}`} subtitle="The session locks again after fifteen minutes of inactivity." />
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void onSubmit({ username, password }); }}>
        <Field label="Username" value={username} onChange={setUsername} autoFocus={!username} />
        <Field label="Password" type="password" value={password} onChange={setPassword} autoFocus={Boolean(username)} />
        <button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />} Unlock</button>
      </form>
    </section>
  );
}

function CreateLab({ schoolName, busy, onSubmit }: { schoolName: string; busy: boolean; onSubmit(name: string): Promise<void> }): ReactNode {
  const [labName, setLabName] = useState("");
  return (
    <section className="setup-page narrow">
      <PageHeading eyebrow={schoolName} title="Create the first lab group" subtitle="This H-node will advertise one group on the local network." />
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void onSubmit(labName); }}>
        <Field label="Lab name" value={labName} onChange={setLabName} autoFocus />
        <button className="button primary" disabled={busy}><Plus size={18} /> Create lab</button>
      </form>
    </section>
  );
}

function HostDashboard(props: {
  status: AgentStatus;
  nodes: EnrolledNode[];
  pending: JoinRequest[];
  pairing: PairingResult | undefined;
  busy: boolean;
  onStartPairing(): Promise<void>;
  onApprove(id: string): Promise<void>;
  onReject(id: string): Promise<void>;
  onRemove(id: string): Promise<void>;
  onRefresh(): void;
}): ReactNode {
  const [, setClockTick] = useState(0);
  useEffect(() => {
    if (!props.pairing) return;
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [props.pairing]);
  const online = props.nodes.filter((node) => node.presence.status === "online").length;
  const pairingActive = props.pairing && Date.parse(props.pairing.expiresAt) > Date.now();
  const addresses = props.status.networkAddresses ?? [];
  const port = props.status.networkPort ?? 45820;
  return (
    <section className="dashboard">
      <header className="dashboard-header">
        <PageHeading eyebrow={props.status.schoolName ?? "School"} title={props.status.labName ?? "Lab"} subtitle="H-node fleet overview" />
        <button className="button primary compact" onClick={() => void props.onStartPairing()} disabled={props.busy}><KeyRound size={17} /> Open enrollment</button>
      </header>
      <div className="metrics">
        <Metric icon={<Signal size={20} />} label="Online" value={String(online)} tone="green" />
        <Metric icon={<Laptop size={20} />} label="Enrolled" value={String(props.nodes.length)} tone="blue" />
        <Metric icon={<Clock3 size={20} />} label="Pending" value={String(props.pending.length)} tone="amber" />
      </div>
      {pairingActive && (
        <div className="pairing-panel">
          <div><span className="eyebrow">Enrollment code</span><strong className="join-code">{props.pairing!.code}</strong></div>
          <div className="pairing-side">
            <div className="pairing-meta"><Clock3 size={17} /><span>Expires {formatTime(props.pairing!.expiresAt)}</span></div>
            {addresses.length > 0 && (
              <div className="address-list">
                {addresses.slice(0, 3).map((address) => <code key={address}>{address}:{port}</code>)}
              </div>
            )}
          </div>
        </div>
      )}
      {props.pending.length > 0 && (
        <section className="content-section">
          <SectionHeading title="Enrollment requests" count={props.pending.length} />
          <div className="request-list">
            {props.pending.map((request) => (
              <div className="request-row" key={request.requestId}>
                <span className="device-avatar"><Laptop size={19} /></span>
                <div><strong>{request.laptopUsername}</strong><small>{platformLabel(request.platform)} · {request.osVersion}</small></div>
                <div className="row-actions">
                  <button className="button secondary compact" onClick={() => void props.onReject(request.requestId)}>Reject</button>
                  <button className="button primary compact" onClick={() => void props.onApprove(request.requestId)}><Check size={16} /> Approve</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="content-section">
        <SectionHeading title="Lab computers" count={props.nodes.length} action={<button className="icon-button" onClick={props.onRefresh} title="Refresh nodes" aria-label="Refresh nodes"><RefreshCw size={17} /></button>} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Computer</th><th>System</th><th>Status</th><th>Last seen</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {props.nodes.length === 0 ? <tr><td colSpan={5}><EmptyState icon={<Network size={23} />} title="No computers enrolled" /></td></tr> : props.nodes.map((node) => (
                <tr key={node.nodeId}>
                  <td><div className="device-cell"><span className="device-avatar"><Laptop size={18} /></span><strong>{node.laptopUsername}</strong></div></td>
                  <td>{platformLabel(node.platform)}<small className="cell-detail">{node.osVersion}</small></td>
                  <td><Status status={node.presence.status} /></td>
                  <td>{formatRelative(node.presence.lastSeen)}</td>
                  <td><button className="icon-button danger" onClick={() => void props.onRemove(node.nodeId)} title="Remove node" aria-label={`Remove ${node.laptopUsername}`}><Trash2 size={17} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function StudentEnrollment({ status, labs, busy, onRefresh, onJoin }: {
  status: AgentStatus;
  labs: LabAdvertisement[];
  busy: boolean;
  onRefresh(): Promise<void>;
  onJoin(lab: LabAdvertisement, code: string): Promise<void>;
}): ReactNode {
  const [selected, setSelected] = useState<LabAdvertisement>();
  const [code, setCode] = useState("");
  const [manual, setManual] = useState(false);
  const [address, setAddress] = useState("");
  const [port, setPort] = useState("45820");
  const pending = status.phase === "student-pending";
  const portNumber = Number(port);
  const manualLab = useMemo<LabAdvertisement>(() => ({
    protocolVersion: 1,
    hostId: "00000000-0000-4000-8000-000000000000",
    schoolName: "Manual connection",
    labId: "00000000-0000-4000-8000-000000000000",
    labName: address || "H-node",
    address,
    port: portNumber,
    fingerprint: "",
    discoveredAt: new Date().toISOString()
  }), [address, portNumber]);
  const manualReady = address.trim().length > 0 && Number.isInteger(portNumber) && portNumber > 0 && portNumber <= 65_535;

  if (pending) {
    return <CenteredState icon={<Clock3 size={28} />} eyebrow="Enrollment pending" title="Waiting for H-node approval" subtitle="The request remains protected by the temporary enrollment session." />;
  }
  return (
    <section className="dashboard">
      <header className="dashboard-header">
        <PageHeading eyebrow={status.laptopUsername ?? "S-node"} title="Join a lab group" subtitle="Available H-nodes on this local network" />
        <button className="button secondary compact" onClick={() => void onRefresh()} disabled={busy}><RefreshCw className={busy ? "spin" : ""} size={17} /> Scan again</button>
      </header>
      {!manual && (
        <div className="lab-list">
          {labs.length === 0 ? <EmptyState icon={<Wifi size={24} />} title="No lab groups discovered. Use the H-node IP address if multicast is blocked." /> : labs.map((lab) => (
            <button className={`lab-row ${selected?.hostId === lab.hostId ? "selected" : ""}`} key={lab.hostId} onClick={() => setSelected(lab)}>
              <span className="role-icon host"><Server size={21} /></span>
              <span><strong>{lab.labName}</strong><small>{lab.schoolName} · {lab.address}</small></span>
              {selected?.hostId === lab.hostId ? <Check size={19} /> : <ChevronRight size={19} />}
            </button>
          ))}
        </div>
      )}
      {manual && <div className="manual-fields"><Field label="H-node address" value={address} onChange={setAddress} autoFocus /><Field label="Port" value={port} onChange={setPort} /></div>}
      <button className="text-button" onClick={() => setManual((value) => !value)}>{manual ? <Wifi size={17} /> : <Link2 size={17} />}{manual ? "Use discovery" : "Connect by IP address"}</button>
      <form className="join-form" onSubmit={(event) => { event.preventDefault(); const target = manual ? manualLab : selected; if (target) void onJoin(target, code); }}>
        <Field label="Enrollment code" value={code} onChange={setCode} placeholder="ABCD-EFGH" />
        <button className="button primary" disabled={busy || !(manual ? manualReady : selected)}>{busy ? <LoaderCircle className="spin" size={18} /> : <Link2 size={18} />} Request to join</button>
      </form>
    </section>
  );
}

function StudentLinked({ status, busy, onUnlink }: { status: AgentStatus; busy: boolean; onUnlink(values: Record<string, string>): Promise<void> }): ReactNode {
  const [showUnlink, setShowUnlink] = useState(false);
  const [password, setPassword] = useState("");
  const connected = status.phase === "student-connected";
  return (
    <section className="dashboard student-status-page">
      <PageHeading eyebrow={status.laptopUsername ?? "S-node"} title={connected ? "Connected to the lab" : "Reconnecting to the H-node"} subtitle={status.membership?.payload.labId ? "Enrollment is stored on this device" : ""} />
      <div className={`connection-hero ${connected ? "connected" : "offline"}`}>
        <span className="connection-icon">{connected ? <Signal size={32} /> : <SignalZero size={32} />}</span>
        <div><span className="eyebrow">Connection</span><strong>{connected ? "Online" : "H-node unavailable"}</strong><small>{connected ? "Presence heartbeats are active" : "The agent will retry automatically"}</small></div>
        <Status status={connected ? "online" : "offline"} />
      </div>
      {!showUnlink ? (
        <button className="button danger-outline" onClick={() => setShowUnlink(true)}><Unlink size={17} /> Unlink this computer</button>
      ) : (
        <form className="unlink-panel" onSubmit={(event) => { event.preventDefault(); void onUnlink({ username: status.laptopUsername ?? "", password }); }}>
          <div><strong>Confirm unlink</strong><small>This removes the saved membership from this S-node.</small></div>
          <Field label="S-node password" type="password" value={password} onChange={setPassword} autoFocus />
          <div className="row-actions"><button type="button" className="button secondary" onClick={() => setShowUnlink(false)}>Cancel</button><button className="button danger" disabled={busy}><Unlink size={17} /> Unlink</button></div>
        </form>
      )}
    </section>
  );
}

function Field({ label, value, onChange, type = "text", autoFocus, placeholder }: { label: string; value: string; onChange(value: string): void; type?: string; autoFocus?: boolean; placeholder?: string }): ReactNode {
  return <label className="field"><span>{label}</span><input required type={type} value={value} onChange={(event) => onChange(event.target.value)} autoFocus={autoFocus} placeholder={placeholder} /></label>;
}

function PageHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }): ReactNode {
  return <div className="page-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>;
}

function SectionHeading({ title, count, action }: { title: string; count: number; action?: ReactNode }): ReactNode {
  return <div className="section-heading"><div><h2>{title}</h2><span className="count">{count}</span></div>{action}</div>;
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }): ReactNode {
  return <div className="metric"><span className={`metric-icon ${tone}`}>{icon}</span><div><strong>{value}</strong><span>{label}</span></div></div>;
}

function Status({ status }: { status: "online" | "offline" }): ReactNode {
  return <span className={`status ${status}`}><i />{status === "online" ? "Online" : "Offline"}</span>;
}

function EmptyState({ icon, title }: { icon: ReactNode; title: string }): ReactNode {
  return <div className="empty-state">{icon}<span>{title}</span></div>;
}

function CenteredState({ icon, eyebrow, title, subtitle }: { icon: ReactNode; eyebrow: string; title: string; subtitle: string }): ReactNode {
  return <section className="centered-state"><span className="page-symbol">{icon}</span><PageHeading eyebrow={eyebrow} title={title} subtitle={subtitle} /></section>;
}

function needsUnlock(status: AgentStatus, sessionToken: string): boolean {
  if (sessionToken) return false;
  if (status.role === "host") return true;
  return status.role === "student" && !status.membership;
}

function platformLabel(platform: string): string {
  return platform === "windows" ? "Windows" : "Ubuntu / Linux";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatRelative(value: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : formatTime(value);
}

function messageOf(error: unknown, fallback = "The request could not be completed."): string {
  const message = error instanceof Error ? error.message : fallback;
  return message
    .replace(/^Error invoking remote method 'lab-fleet:invoke': Error:\s*/i, "")
    .replace(/^Error invoking remote method "lab-fleet:invoke": Error:\s*/i, "")
    .trim();
}

function isUnlockRequiredError(error: unknown): boolean {
  return messageOf(error) === "Unlock Lab Fleet to continue.";
}
