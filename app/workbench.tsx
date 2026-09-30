"use client";

import { useState, type FormEvent } from "react";
import { useWorkbench } from "./use-workbench";
import { AppShell, Button, Field, Panel, Status } from "./ui";
import { demoData, type Data, type Analysis, type Decision, type Question, type Acknowledgment } from "./domain";

type Save = (next: Data) => Promise<boolean>;
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const iso = (local: string) => local ? new Date(local).toISOString() : "";
function localTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function showTime(value: string) { return value ? `${new Date(value).toLocaleString("ru-RU")} (${zone()}); ${value}` : "не указано"; }

function Audience({ data, save, busy }: { data: Data; save: Save; busy: boolean }) {
  const [recipientId, setRecipientId] = useState("");
  const [label, setLabel] = useState("");
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await save({ ...data, recipients: [...data.recipients, { id: recipientId.trim(), label: label.trim() }] })) {
      setRecipientId(""); setLabel("");
    }
  }
  return <Panel title="Аудитория">
    <p className="muted">Используйте внутренние ID и метки. Каждый участник и затронутый сотрудник — отдельная строка.</p>
    <form className="stack" onSubmit={add}>
      <Field label="Внутренний ID, например P-01" value={recipientId} onChange={e => setRecipientId(e.target.value)} required maxLength={64} pattern="[A-Za-z0-9_-]+" />
      <Field label="Метка: команда или роль" value={label} onChange={e => setLabel(e.target.value)} required maxLength={160} />
      <Button type="submit" disabled={busy}>Добавить получателя</Button>
    </form>
    {data.recipients.length === 0 ? <p>Получателей пока нет. Добавьте аудиторию перед утверждением решения.</p> :
      <ul className="list">{data.recipients.map(r => <li key={r.id}>{r.id} — {r.label}</li>)}</ul>}
  </Panel>;
}

function QuestionForm({ question, data, save, busy }: { question?: Question; data: Data; save: Save; busy: boolean }) {
  const [draft, setDraft] = useState<Question>(question ?? {
    id: "", question: "", answer: "", owner: "", deadline: "", nextStep: "", status: "open",
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { ...draft, id: question?.id ?? id("Q") };
    const success = await save({ ...data, questions: question ? data.questions.map(q => q.id === next.id ? next : q) : [...data.questions, next] });
    if (success && !question) setDraft({ id: "", question: "", answer: "", owner: "", deadline: "", nextStep: "", status: "open" });
  }
  return <form className="stack" onSubmit={submit}>
    {question && <Status tone={question.status === "resolved" ? "success" : "warning"}>{question.id} · {question.status === "resolved" ? "Ответ готов" : "Решение ожидается"}</Status>}
    <Field label="Вопрос" value={draft.question} onChange={e => setDraft({ ...draft, question: e.target.value })} required maxLength={2000} />
    <label className="field">Единый ответ
      <textarea value={draft.answer} onChange={e => setDraft({ ...draft, answer: e.target.value })} maxLength={5000} rows={3} required={draft.status === "resolved"} />
    </label>
    <Field label="Владелец ответа" value={draft.owner} onChange={e => setDraft({ ...draft, owner: e.target.value })} required maxLength={160} />
    <Field label="Обещанное обновление — местное время браузера" type="datetime-local" value={localTime(draft.deadline)} onChange={e => setDraft({ ...draft, deadline: iso(e.target.value) })} required />
    <Field label="Следующий шаг" value={draft.nextStep} onChange={e => setDraft({ ...draft, nextStep: e.target.value })} required maxLength={1000} />
    <label className="field">Статус
      <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value === "resolved" ? "resolved" : "open" })}>
        <option value="open">Ожидается решение; ответ не обещан</option><option value="resolved">Ответ проверен и готов для FAQ</option>
      </select>
    </label>
    <Button type="submit" disabled={busy}>{question ? "Сохранить ответ и следующий шаг" : "Принять вопрос"}</Button>
  </form>;
}

function DecisionForm({ decision, data, save, busy }: { decision?: Decision; data: Data; save: Save; busy: boolean }) {
  const [draft, setDraft] = useState<Decision>(decision ?? {
    id: "", title: "", owner: "", deadline: "", nextStep: "", rulesVersion: "", approvedBy: "", approvedAt: "",
    approvalEvidence: "", announcement: "", affectedRecipientIds: data.recipients.map(r => r.id), status: "draft",
  });
  const [approver, setApprover] = useState("");
  const [approvalEvidence, setApprovalEvidence] = useState("");
  const [approve, setApprove] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Decision = { ...draft, id: decision?.id ?? id("D"), status: approve ? "approved" : "draft",
      approvedBy: approve ? approver.trim() : "", approvalEvidence: approve ? approvalEvidence.trim() : "",
      approvedAt: approve ? new Date().toISOString() : "" };
    if (await save({ ...data, decisions: decision ? data.decisions.map(d => d.id === next.id ? next : d) : [...data.decisions, next] })) {
      if (!decision) setDraft({ id: "", title: "", owner: "", deadline: "", nextStep: "", rulesVersion: "", approvedBy: "", approvedAt: "",
        approvalEvidence: "", announcement: "", affectedRecipientIds: data.recipients.map(r => r.id), status: "draft" });
      setApprove(false); setApprover(""); setApprovalEvidence("");
    }
  }
  return <form className="stack" onSubmit={submit}>
    <Field label="Тема решения" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} required maxLength={300} />
    <Field label="Владелец решения" value={draft.owner} onChange={e => setDraft({ ...draft, owner: e.target.value })} required maxLength={160} />
    <Field label="Срок следующего шага — местное время браузера" type="datetime-local" value={localTime(draft.deadline)} onChange={e => setDraft({ ...draft, deadline: iso(e.target.value) })} required />
    <Field label="Следующий шаг" value={draft.nextStep} onChange={e => setDraft({ ...draft, nextStep: e.target.value })} required maxLength={1000} />
    <Field label="Новая версия правил, например v1.1" value={draft.rulesVersion} onChange={e => setDraft({ ...draft, rulesVersion: e.target.value })} maxLength={64} required={approve} pattern="[A-Za-z0-9_.-]+" />
    <fieldset className="stack"><legend>Затронутая аудитория</legend>
      {data.recipients.length === 0 && <p>Сначала добавьте получателей.</p>}
      {data.recipients.map(r => <label key={r.id}><input type="checkbox" checked={draft.affectedRecipientIds.includes(r.id)}
        onChange={e => setDraft({ ...draft, affectedRecipientIds: e.target.checked ? [...draft.affectedRecipientIds, r.id] : draft.affectedRecipientIds.filter(value => value !== r.id) })} /> {r.id} — {r.label}</label>)}
      <Button type="button" onClick={() => setDraft({ ...draft, affectedRecipientIds: data.recipients.map(r => r.id) })}>Выбрать всю текущую аудиторию</Button>
    </fieldset>
    <label className="field">Единый текст объявления: было, стало, причина, действие, точное время с зоной и помощь
      <textarea rows={5} value={draft.announcement} onChange={e => setDraft({ ...draft, announcement: e.target.value })} maxLength={10000} required={approve} />
    </label>
    <label><input type="checkbox" checked={approve} onChange={e => setApprove(e.target.checked)} /> Записать утверждённое решение и зафиксировать эту аудиторию, версию и текст</label>
    {approve && <>
      <Field label="Кто утвердил и в какой роли" value={approver} onChange={e => setApprover(e.target.value)} required maxLength={160} />
      <Field label="Свидетельство утверждения: запись или ссылка в рабочем журнале" value={approvalEvidence} onChange={e => setApprovalEvidence(e.target.value)} required maxLength={2000} />
      <p className="muted">Утверждение фиксируется текущим временем. Приложение сохраняет вашу запись; оно не устанавливает полномочия указанного человека.</p>
    </>}
    <Button type="submit" disabled={busy || (approve && draft.affectedRecipientIds.length === 0)}>{approve ? "Зафиксировать утверждение" : decision ? "Сохранить черновик" : "Создать черновик решения"}</Button>
  </form>;
}

function ReceiptForm({ decision, recipientId, data, save, busy }: { decision: Decision; recipientId: string; data: Data; save: Save; busy: boolean }) {
  const current = data.acknowledgments.find(a => a.decisionId === decision.id && a.recipientId === recipientId);
  const [status, setStatus] = useState<Acknowledgment["status"]>(current?.status ?? "sent");
  const [evidence, setEvidence] = useState(current?.evidence ?? "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ack: Acknowledgment = { decisionId: decision.id, recipientId, status, evidence: evidence.trim(), recordedAt: new Date().toISOString() };
    await save({ ...data, acknowledgments: [...data.acknowledgments.filter(a => !(a.decisionId === decision.id && a.recipientId === recipientId)), ack] });
  }
  return <form className="queue-item stack" onSubmit={submit}>
    <p>{recipientId} — {data.recipients.find(r => r.id === recipientId)?.label}</p>
    <Status tone={current?.status === "confirmed" ? "success" : "warning"}>{current ? { sent: "Только отправлено", delivered: "Есть свидетельство доставки", confirmed: "Подтвердил текст" }[current.status] : "Свидетельство ещё не записано"}</Status>
    {current && <p className="muted">Записано: {showTime(current.recordedAt)}. {current.evidence}</p>}
    {decision.status !== "closed" && <>
      <label className="field">Наблюдаемый статус
        <select value={status} onChange={e => {
          const value = e.target.value;
          if (value === "sent" || value === "delivered" || value === "confirmed") setStatus(value);
        }}><option value="sent">Отправлено вручную</option><option value="delivered">Доставка проверена вручную</option><option value="confirmed">Получатель подтвердил текст</option></select>
      </label>
      <Field label="Что проверили: ответ, журнал доставки, время, резервный канал" value={evidence} onChange={e => setEvidence(e.target.value)} required maxLength={2000} />
      <Button type="submit" disabled={busy}>Записать ручное свидетельство</Button>
    </>}
  </form>;
}

function ApprovedDecision({ decision, summary, data, save, busy }: { decision: Decision; summary?: Analysis["decisions"][number]; data: Data; save: Save; busy: boolean }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(decision.announcement); setCopied(true); setCopyError(""); }
    catch { setCopied(false); setCopyError("Буфер обмена недоступен. Выделите текст объявления и скопируйте вручную."); }
  }
  return <div className="stack">
    <Status tone={decision.status === "closed" ? "success" : "warning"}>{decision.status === "closed" ? "Закрыто" : "Уведомление открыто"} · {decision.rulesVersion}</Status>
    <p>Владелец: {decision.owner}. Следующий шаг: {decision.nextStep}. Срок: {showTime(decision.deadline)}.</p>
    <p className="muted">Утвердил: {decision.approvedBy}; {showTime(decision.approvedAt)}. {decision.approvalEvidence}</p>
    <label className="field">Единый утверждённый текст<textarea readOnly value={decision.announcement} rows={5} /></label>
    <div className="actions"><Button type="button" onClick={copy}>Скопировать объявление</Button>{copied && <Status tone="success">Текст скопирован; отправка не выполнялась</Status>}</div>
    {copyError && <p role="alert">{copyError}</p>}
    {summary && <p>Подтвердили {summary.confirmedCount} из {summary.affectedCount}. Текущие остальные статусы: отправлено {summary.sentCount}, доставлено {summary.deliveredCount}. Не подтвердили: {summary.missingRecipientIds.join(", ") || "нет"}.</p>}
    {decision.affectedRecipientIds.map(recipientId => <ReceiptForm key={`${recipientId}-${data.acknowledgments.find(a => a.decisionId === decision.id && a.recipientId === recipientId)?.recordedAt ?? "empty"}`}
      decision={decision} recipientId={recipientId} data={data} save={save} busy={busy} />)}
    {decision.status !== "closed" && <>
      <Button type="button" disabled={busy || !summary?.canClose} onClick={() => save({ ...data, decisions: data.decisions.map(d => d.id === decision.id ? { ...d, status: "closed" } : d) })}>Закрыть проверку уведомления</Button>
      {!summary?.canClose && <p className="muted">Закрытие доступно после явного подтверждения каждого затронутого получателя. Доставка и отправка не заменяют подтверждение.</p>}
    </>}
  </div>;
}

export default function Workbench() {
  const { data, analysis, revision, loading, saving, error, conflict, save, reload } = useWorkbench<Data, Analysis>();
  const [demoConfirmed, setDemoConfirmed] = useState(false);
  const empty = data && data.recipients.length === 0 && data.questions.length === 0 && data.decisions.length === 0;
  const demoLoaded = data?.decisions.some(d => d.id === "D-01" && d.title === "Учебный перенос дедлайна");
  const busy = saving || conflict;
  return <AppShell title="Связь с участниками" description="Единый FAQ, утверждённые изменения и проверка каждого получателя." loading={loading} error={error}>
    {conflict && <Panel title="Рабочие данные изменились"><p>Другой оператор сохранил новую версию. Обновите данные, затем повторите нужное действие; неподтверждённые поля формы могут потребовать повторного ввода.</p><Button onClick={() => reload()}>Загрузить текущую версию</Button></Panel>}
    {data && <>
      {demoLoaded && <Status tone="warning">Учебный сценарий: участники, утверждение и свидетельства вымышлены. Используйте отдельную пустую рабочую среду для реального события.</Status>}
      <p className="muted">Часовой пояс ввода: {zone()}. Сроки сохраняются как точные моменты UTC. Ревизия {revision}. Здесь фиксируют ручные проверки; сообщения участникам не отправляются.</p>
      {empty && <Panel title="Рабочая среда пустая">
        <p>Начните с получателей и первого вопроса. Учебные данные содержат вымышленные утверждения и подтверждение одного участника.</p>
        <label><input type="checkbox" checked={demoConfirmed} onChange={e => setDemoConfirmed(e.target.checked)} /> Загрузить вымышленную репетицию в эту пустую рабочую среду</label>
        <Button disabled={busy || !demoConfirmed} onClick={() => save(structuredClone(demoData))}>Загрузить учебный пример</Button>
      </Panel>}
      {analysis && <Panel title="Что требует действия">
        <p>Открытых вопросов: {analysis.unresolvedQuestions.length}. Незакрытых решений: {analysis.openDecisionCount}. Получателей: {analysis.recipientCount}.</p>
        {analysis.overdue.length === 0 ? <Status tone="success">Просроченных следующих шагов нет</Status> : <ul className="list">{analysis.overdue.map(item => <li key={`${item.kind}-${item.id}`}><Status tone="danger">Просрочено: {item.id}</Status> {showTime(item.deadline)}</li>)}</ul>}
      </Panel>}
      <div className="grid"><Audience data={data} save={save} busy={busy} /><Panel title="Принять вопрос"><QuestionForm data={data} save={save} busy={busy} /></Panel></div>
      <Panel title="Единый FAQ и открытые вопросы">
        {data.questions.length === 0 ? <p>Вопросов пока нет. Неутверждённый ответ оставляйте со статусом ожидания и конкретным следующим шагом.</p> :
          <div className="stack">{data.questions.map(q => <div className="queue-item" key={`${q.id}-${q.owner}-${q.deadline}-${q.nextStep}-${q.status}-${q.answer}`}><QuestionForm question={q} data={data} save={save} busy={busy} /></div>)}</div>}
      </Panel>
      <Panel title="Новое изменение правил"><DecisionForm data={data} save={save} busy={busy} /></Panel>
      {data.decisions.length === 0 && <p>Изменений пока нет. Утверждение требует версии, владельца, аудитории и текста объявления.</p>}
      {data.decisions.map(d => <Panel title={`${d.id}: ${d.title}`} key={d.id}>
        {d.status === "draft" ? <><Status>Черновик; уведомление ещё не разрешено</Status><DecisionForm decision={d} data={data} save={save} busy={busy} /></> :
          <ApprovedDecision decision={d} summary={analysis?.decisions.find(item => item.id === d.id)} data={data} save={save} busy={busy} />}
      </Panel>)}
    </>}
  </AppShell>;
}
