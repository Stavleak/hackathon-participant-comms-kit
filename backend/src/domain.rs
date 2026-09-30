use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Data {
    recipients: Vec<Recipient>,
    questions: Vec<Question>,
    decisions: Vec<Decision>,
    acknowledgments: Vec<Acknowledgment>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Recipient { id: String, label: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Question {
    id: String, question: String, answer: String, owner: String,
    deadline: String, next_step: String, status: QuestionStatus,
}

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum QuestionStatus { Open, Resolved }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Decision {
    id: String, title: String, owner: String, deadline: String, next_step: String,
    rules_version: String, approved_by: String, approved_at: String,
    approval_evidence: String, announcement: String,
    affected_recipient_ids: Vec<String>, status: DecisionStatus,
}

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum DecisionStatus { Draft, Approved, Closed }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Acknowledgment {
    decision_id: String, recipient_id: String, status: DeliveryStatus,
    evidence: String, recorded_at: String,
}

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum DeliveryStatus { Sent, Delivered, Confirmed }

pub fn default_data() -> Value {
    json!({"recipients": [], "questions": [], "decisions": [], "acknowledgments": []})
}

fn text(value: &str, name: &str, max: usize, required: bool) -> Result<(), String> {
    if value.chars().count() > max || (required && value.trim().is_empty())
        || value.chars().any(|c| c.is_control() && c != '\n' && c != '\t') {
        return Err(format!("{name}: заполните поле (не более {max} символов)"));
    }
    Ok(())
}

fn identifier(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 64
        || !value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err("ID: используйте 1–64 латинских букв, цифр, дефис или подчёркивание".into());
    }
    Ok(())
}

fn timestamp(value: &str, name: &str) -> Result<(), String> {
    if value.len() > 64 || DateTime::parse_from_rfc3339(value).is_err() {
        return Err(format!("{name}: нужна точная дата RFC3339 с часовым поясом"));
    }
    Ok(())
}

fn version(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 64
        || !value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.')) {
        return Err("Версия правил: укажите номер без пробелов, например v1.1".into());
    }
    Ok(())
}

pub fn validate(value: &Value) -> Result<(), String> {
    let data: Data = serde_json::from_value(value.clone())
        .map_err(|e| format!("Некорректная структура данных: {e}"))?;
    if data.recipients.len() > 500 || data.questions.len() > 500
        || data.decisions.len() > 200 || data.acknowledgments.len() > 10_000 {
        return Err("Превышен лимит: 500 получателей, 500 вопросов, 200 решений, 10000 отметок".into());
    }
    let mut recipient_ids = HashSet::new();
    for r in &data.recipients {
        identifier(&r.id)?;
        text(&r.label, "Метка получателя", 160, true)?;
        if !recipient_ids.insert(r.id.as_str()) { return Err("Повторяется ID получателя".into()); }
    }
    let mut question_ids = HashSet::new();
    for q in &data.questions {
        identifier(&q.id)?;
        if !question_ids.insert(q.id.as_str()) { return Err("Повторяется ID вопроса".into()); }
        text(&q.question, "Вопрос", 2000, true)?;
        text(&q.answer, "Ответ", 5000, q.status == QuestionStatus::Resolved)?;
        text(&q.owner, "Владелец вопроса", 160, true)?;
        text(&q.next_step, "Следующий шаг вопроса", 1000, true)?;
        timestamp(&q.deadline, "Срок вопроса")?;
    }
    let mut decision_ids = HashMap::new();
    let mut versions = HashSet::new();
    for d in &data.decisions {
        identifier(&d.id)?;
        if decision_ids.insert(d.id.as_str(), d).is_some() { return Err("Повторяется ID решения".into()); }
        text(&d.title, "Тема решения", 300, true)?;
        text(&d.owner, "Владелец решения", 160, true)?;
        text(&d.next_step, "Следующий шаг решения", 1000, true)?;
        timestamp(&d.deadline, "Срок решения")?;
        text(&d.announcement, "Текст объявления", 10000, d.status != DecisionStatus::Draft)?;
        text(&d.approved_by, "Утверждающий", 160, d.status != DecisionStatus::Draft)?;
        text(&d.approval_evidence, "Основание утверждения", 2000, d.status != DecisionStatus::Draft)?;
        if !d.rules_version.is_empty() { version(&d.rules_version)?; }
        if d.status != DecisionStatus::Draft {
            version(&d.rules_version)?;
            timestamp(&d.approved_at, "Время утверждения")?;
            if !versions.insert(d.rules_version.as_str()) { return Err("Версия уже связана с другим утверждённым решением".into()); }
            if d.affected_recipient_ids.is_empty() { return Err("Для утверждения нужна затронутая аудитория".into()); }
        } else if !d.approved_by.is_empty() || !d.approved_at.is_empty() || !d.approval_evidence.is_empty() {
            return Err("Черновик не должен содержать отметку утверждения".into());
        }
        let mut affected = HashSet::new();
        for id in &d.affected_recipient_ids {
            if !recipient_ids.contains(id.as_str()) { return Err("Аудитория решения содержит неизвестного получателя".into()); }
            if !affected.insert(id.as_str()) { return Err("Повторяется получатель в аудитории решения".into()); }
        }
    }
    let mut pairs = HashMap::new();
    for ack in &data.acknowledgments {
        let d = decision_ids.get(ack.decision_id.as_str()).ok_or("Отметка ссылается на неизвестное решение")?;
        if d.status == DecisionStatus::Draft { return Err("Сначала утвердите решение, затем записывайте уведомление".into()); }
        if !d.affected_recipient_ids.contains(&ack.recipient_id) { return Err("Получатель отметки отсутствует в аудитории решения".into()); }
        text(&ack.evidence, "Ручное свидетельство уведомления", 2000, true)?;
        timestamp(&ack.recorded_at, "Время отметки")?;
        if DateTime::parse_from_rfc3339(&ack.recorded_at).map_err(|e| e.to_string())?
            < DateTime::parse_from_rfc3339(&d.approved_at).map_err(|e| e.to_string())? {
            return Err("Отметка уведомления не может предшествовать утверждению".into());
        }
        if pairs.insert((ack.decision_id.as_str(), ack.recipient_id.as_str()), ack).is_some() {
            return Err("Для пары решение–получатель допустима одна текущая отметка".into());
        }
    }
    for d in &data.decisions {
        if d.status == DecisionStatus::Closed && d.affected_recipient_ids.iter().any(|id| {
            pairs.get(&(d.id.as_str(), id.as_str())).is_none_or(|ack| ack.status != DeliveryStatus::Confirmed)
        }) {
            return Err("Закрытие заблокировано: каждый затронутый получатель должен подтвердить текст".into());
        }
    }
    Ok(())
}

/// Called by the persistence layer under its revision/mutex guard.
/// A new rules revision needs a new decision; old receipts never certify a new text.
pub fn validate_update(previous: &Value, next: &Value) -> Result<(), String> {
    validate(previous)?;
    validate(next)?;
    let before = previous["decisions"].as_array().ok_or("Нет прежних решений")?;
    let after = next["decisions"].as_array().ok_or("Нет новых решений")?;
    for old in before.iter().filter(|d| d["status"] != "draft") {
        let new = after.iter().find(|d| d["id"] == old["id"])
            .ok_or("Утверждённое решение нельзя удалить; создайте новую редакцию")?;
        if old["status"] == "closed" && new != old {
            return Err("Закрытое решение неизменно; новая редакция требует нового ID и версии".into());
        }
        if new["status"] == "draft" { return Err("Утверждение нельзя вернуть в черновик".into()); }
        for field in ["title", "rulesVersion", "approvedBy", "approvedAt", "approvalEvidence", "announcement", "affectedRecipientIds"] {
            if old[field] != new[field] {
                return Err(format!("Утверждённое поле {field} неизменно; создайте новое решение и версию"));
            }
        }
        if old["status"] == "closed" {
            let old_receipts: Vec<&Value> = previous["acknowledgments"].as_array().ok_or("Нет прежних отметок")?
                .iter().filter(|a| a["decisionId"] == old["id"]).collect();
            let new_receipts: Vec<&Value> = next["acknowledgments"].as_array().ok_or("Нет новых отметок")?
                .iter().filter(|a| a["decisionId"] == old["id"]).collect();
            if old_receipts.len() != new_receipts.len() || old_receipts.iter().any(|a| !new_receipts.contains(a)) {
                return Err("Свидетельства закрытого решения неизменны".into());
            }
        }
    }
    Ok(())
}

pub fn analyze(value: &Value) -> Value {
    if let Err(error) = validate(value) { return json!({"error": error}); }
    let data: Data = match serde_json::from_value(value.clone()) {
        Ok(data) => data,
        Err(error) => return json!({"error": error.to_string()}),
    };
    let now = Utc::now();
    let mut overdue = Vec::new();
    let unresolved: Vec<&str> = data.questions.iter().filter(|q| q.status == QuestionStatus::Open)
        .map(|q| q.id.as_str()).collect();
    for q in &data.questions {
        if q.status == QuestionStatus::Open && DateTime::parse_from_rfc3339(&q.deadline).is_ok_and(|t| t < now) {
            overdue.push(json!({"kind": "question", "id": q.id, "deadline": q.deadline}));
        }
    }
    let mut summaries = Vec::new();
    for d in &data.decisions {
        if d.status != DecisionStatus::Closed && DateTime::parse_from_rfc3339(&d.deadline).is_ok_and(|t| t < now) {
            overdue.push(json!({"kind": "decision", "id": d.id, "deadline": d.deadline}));
        }
        let current: HashMap<&str, &Acknowledgment> = data.acknowledgments.iter()
            .filter(|a| a.decision_id == d.id).map(|a| (a.recipient_id.as_str(), a)).collect();
        let missing: Vec<&str> = d.affected_recipient_ids.iter().filter(|id| {
            current.get(id.as_str()).is_none_or(|ack| ack.status != DeliveryStatus::Confirmed)
        }).map(String::as_str).collect();
        let status = match d.status { DecisionStatus::Draft => "draft", DecisionStatus::Approved => "approved", DecisionStatus::Closed => "closed" };
        summaries.push(json!({"id": d.id, "status": status, "affectedCount": d.affected_recipient_ids.len(),
            "sentCount": current.values().filter(|a| a.status == DeliveryStatus::Sent).count(),
            "deliveredCount": current.values().filter(|a| a.status == DeliveryStatus::Delivered).count(),
            "confirmedCount": current.values().filter(|a| a.status == DeliveryStatus::Confirmed).count(),
            "missingRecipientIds": missing,
            "canClose": d.status == DecisionStatus::Approved && !d.affected_recipient_ids.is_empty() && missing.is_empty()}));
    }
    json!({"recipientCount": data.recipients.len(), "unresolvedQuestions": unresolved,
        "overdue": overdue, "decisions": summaries,
        "openDecisionCount": data.decisions.iter().filter(|d| d.status != DecisionStatus::Closed).count()})
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Value {
        json!({"recipients":[{"id":"P-01","label":"Первый"},{"id":"P-02","label":"Второй"}],"questions":[],
            "decisions":[{"id":"D-01","title":"Новый срок","owner":"Редактор","deadline":"2020-01-01T18:00:00+05:00","nextStep":"Проверить всех",
            "rulesVersion":"v1.1","approvedBy":"Руководитель","approvedAt":"2020-01-01T16:00:00+05:00","approvalEvidence":"Запись утверждения",
            "announcement":"Срок для всех 18:30 UTC+05:00","affectedRecipientIds":["P-01","P-02"],"status":"approved"}],
            "acknowledgments":[{"decisionId":"D-01","recipientId":"P-01","status":"confirmed","evidence":"Ответ с новым сроком","recordedAt":"2020-01-01T16:05:00+05:00"}]})
    }

    #[test]
    fn incomplete_confirmation_remains_open() {
        let a = analyze(&fixture());
        assert_eq!(a["decisions"][0]["confirmedCount"], 1);
        assert_eq!(a["decisions"][0]["missingRecipientIds"], json!(["P-02"]));
        assert_eq!(a["decisions"][0]["canClose"], false);
    }

    #[test]
    fn duplicate_recipient_ids_are_rejected() {
        let mut v = fixture();
        v["recipients"][1]["id"] = json!("P-01");
        assert!(validate(&v).is_err());
    }

    #[test]
    fn closed_without_every_confirmation_is_rejected() {
        let mut v = fixture();
        v["decisions"][0]["status"] = json!("closed");
        assert!(validate(&v).is_err());
    }

    #[test]
    fn approved_requires_a_version_and_evidence() {
        let mut v = fixture();
        v["decisions"][0]["rulesVersion"] = json!("");
        assert!(validate(&v).is_err());
        v["decisions"][0]["rulesVersion"] = json!("v1.1");
        v["decisions"][0]["approvalEvidence"] = json!("");
        assert!(validate(&v).is_err());
    }

    #[test]
    fn denominator_is_affected_unique_recipients() {
        let mut v = fixture();
        v["recipients"].as_array_mut().unwrap().push(json!({"id":"P-03","label":"Не затронут"}));
        assert_eq!(analyze(&v)["decisions"][0]["affectedCount"], 2);
        v["decisions"][0]["affectedRecipientIds"] = json!(["P-01","P-01"]);
        assert!(validate(&v).is_err());
    }

    #[test]
    fn duplicate_pairs_and_unknown_references_are_rejected() {
        let mut v = fixture();
        let duplicate = v["acknowledgments"][0].clone();
        v["acknowledgments"].as_array_mut().unwrap().push(duplicate);
        assert!(validate(&v).is_err());
        v["acknowledgments"].as_array_mut().unwrap().pop();
        v["acknowledgments"][0]["recipientId"] = json!("UNKNOWN");
        assert!(validate(&v).is_err());
    }

    #[test]
    fn sent_and_delivered_do_not_mean_confirmed() {
        let mut v = fixture();
        v["acknowledgments"][0]["status"] = json!("delivered");
        let a = analyze(&v);
        assert_eq!(a["decisions"][0]["confirmedCount"], 0);
        assert_eq!(a["decisions"][0]["deliveredCount"], 1);
        assert_eq!(a["decisions"][0]["canClose"], false);
    }

    #[test]
    fn all_confirmed_permits_closure() {
        let mut v = fixture();
        let mut second = v["acknowledgments"][0].clone();
        second["recipientId"] = json!("P-02");
        v["acknowledgments"].as_array_mut().unwrap().push(second);
        assert_eq!(analyze(&v)["decisions"][0]["canClose"], true);
        v["decisions"][0]["status"] = json!("closed");
        assert!(validate(&v).is_ok());
    }

    #[test]
    fn overdue_and_unresolved_faq_are_reported() {
        let mut v = fixture();
        v["questions"] = json!([{"id":"Q-01","question":"Можно ссылку?","answer":"","owner":"Редактор","deadline":"2020-01-01T16:10:00Z","nextStep":"Получить решение","status":"open"}]);
        let a = analyze(&v);
        assert_eq!(a["unresolvedQuestions"], json!(["Q-01"]));
        assert_eq!(a["overdue"].as_array().unwrap().len(), 2);
        v["questions"][0]["status"] = json!("resolved");
        assert!(validate(&v).is_err());
    }

    #[test]
    fn empty_start_is_valid_and_unknown_fields_fail() {
        assert!(validate(&default_data()).is_ok());
        let mut v = default_data();
        v["automaticDelivery"] = json!(true);
        assert!(validate(&v).is_err());
    }

    #[test]
    fn approved_text_and_audience_cannot_reuse_receipts() {
        let before = fixture();
        let mut after = before.clone();
        after["decisions"][0]["announcement"] = json!("Другой срок");
        assert!(validate(&after).is_ok());
        assert!(validate_update(&before, &after).is_err());
        after = before.clone();
        after["decisions"][0]["affectedRecipientIds"] = json!(["P-01"]);
        after["decisions"][0]["status"] = json!("closed");
        assert!(validate(&after).is_ok());
        assert!(validate_update(&before, &after).is_err());
    }

    #[test]
    fn new_decision_version_does_not_inherit_receipts() {
        let before = fixture();
        let mut after = before.clone();
        let mut second = after["decisions"][0].clone();
        second["id"] = json!("D-02");
        second["rulesVersion"] = json!("v1.2");
        after["decisions"].as_array_mut().unwrap().push(second);
        assert!(validate_update(&before, &after).is_ok());
        assert_eq!(analyze(&after)["decisions"][1]["confirmedCount"], 0);
        after["decisions"][1]["rulesVersion"] = json!("v1.1");
        assert!(validate(&after).is_err());
    }

    #[test]
    fn closed_records_and_receipts_cannot_be_rewritten() {
        let mut before = fixture();
        let mut second = before["acknowledgments"][0].clone();
        second["recipientId"] = json!("P-02");
        before["acknowledgments"].as_array_mut().unwrap().push(second);
        before["decisions"][0]["status"] = json!("closed");
        let mut after = before.clone();
        after["decisions"][0]["status"] = json!("approved");
        assert!(validate_update(&before, &after).is_err());
        after = before.clone();
        after["acknowledgments"][0]["evidence"] = json!("Подменённое свидетельство");
        assert!(validate_update(&before, &after).is_err());
    }
}
