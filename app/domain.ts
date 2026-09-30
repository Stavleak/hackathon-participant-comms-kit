export type Recipient = { id: string; label: string };
export type Question = {
  id: string; question: string; answer: string; owner: string;
  deadline: string; nextStep: string; status: "open" | "resolved";
};
export type Decision = {
  id: string; title: string; owner: string; deadline: string; nextStep: string;
  rulesVersion: string; approvedBy: string; approvedAt: string; approvalEvidence: string;
  announcement: string; affectedRecipientIds: string[]; status: "draft" | "approved" | "closed";
};
export type Acknowledgment = {
  decisionId: string; recipientId: string; status: "sent" | "delivered" | "confirmed";
  evidence: string; recordedAt: string;
};
export type Data = {
  recipients: Recipient[]; questions: Question[]; decisions: Decision[]; acknowledgments: Acknowledgment[];
};
export type Analysis = {
  recipientCount: number; unresolvedQuestions: string[];
  overdue: { kind: "question" | "decision"; id: string; deadline: string }[];
  openDecisionCount: number;
  decisions: {
    id: string; status: Decision["status"]; affectedCount: number;
    sentCount: number; deliveredCount: number; confirmedCount: number;
    missingRecipientIds: string[]; canClose: boolean;
  }[];
};

// Explicit training fixture. The real workspace always starts with empty arrays.
export const demoData: Data = {
  recipients: [{ id: "P-01", label: "Учебный участник 1" }, { id: "P-02", label: "Учебный участник 2" }],
  questions: [{ id: "Q-01", question: "Можно сдать ссылку вместо ZIP?", answer: "", owner: "Учебный редактор",
    deadline: "2026-09-01T16:30:00+05:00", nextStep: "Получить утверждение руководителя; пока ZIP", status: "open" }],
  decisions: [{ id: "D-01", title: "Учебный перенос дедлайна", owner: "Учебный редактор",
    deadline: "2026-09-01T17:10:00+05:00", nextStep: "Получить подтверждение P-02",
    rulesVersion: "v1.1", approvedBy: "Учебный руководитель", approvedAt: "2026-09-01T16:50:00+05:00",
    approvalEvidence: "Вымышленная запись репетиции: перенос утверждён для обоих участников",
    announcement: "Учебный пример. Сдача ZIP перенесена с 1 сентября 2026, 18:00 UTC+05:00 (13:00 UTC) на 18:30 UTC+05:00 (13:30 UTC). Правила v1.1. Причина: учебный сбой формы. Ранее принятые пакеты сохранены в сценарии. Подтвердите новый срок дежурному; при недоступном чате используйте учебную стойку.",
    affectedRecipientIds: ["P-01", "P-02"], status: "approved" }],
  acknowledgments: [{ decisionId: "D-01", recipientId: "P-01", status: "confirmed",
    evidence: "Вымышленное подтверждение: P-01 назвал новый срок в репетиции", recordedAt: "2026-09-01T16:58:00+05:00" }],
};
