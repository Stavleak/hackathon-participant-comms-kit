mod domain;

use axum::{extract::{DefaultBodyLimit, State}, http::{header, Request, StatusCode}, middleware::{self, Next}, response::{IntoResponse, Response}, routing::get, Json, Router};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{env, fs::{self, File, OpenOptions}, io::{self, Write}, path::{Path, PathBuf}, sync::Arc};
use subtle::ConstantTimeEq;
use tokio::sync::Mutex;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Stored { revision: u64, data: Value }
#[derive(Clone)]
struct AppState { stored: Arc<Mutex<Stored>>, path: PathBuf, token: Arc<String> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Update { expected_revision: u64, data: Value }

fn error(status: StatusCode, message: &str) -> Response { (status, Json(json!({"error":message}))).into_response() }

async fn authorize(State(state): State<AppState>, request: Request<axum::body::Body>, next: Next) -> Response {
    let supplied = request.headers().get(header::AUTHORIZATION).and_then(|value| value.to_str().ok()).and_then(|value| value.strip_prefix("Bearer ")).unwrap_or("");
    if supplied.as_bytes().ct_eq(state.token.as_bytes()).unwrap_u8() != 1 {
        return error(StatusCode::UNAUTHORIZED, "Доступ не подтверждён");
    }
    next.run(request).await
}

fn snapshot(stored: &Stored) -> Value {
    json!({"revision":stored.revision,"data":stored.data,"analysis":domain::analyze(&stored.data)})
}

async fn read(State(state): State<AppState>) -> Json<Value> {
    let stored = state.stored.lock().await;
    Json(snapshot(&stored))
}

fn persist(path: &Path, stored: &Stored) -> io::Result<()> {
    let temporary = path.with_extension("json.next");
    let bytes = serde_json::to_vec_pretty(stored).map_err(io::Error::other)?;
    let mut file = OpenOptions::new().create(true).truncate(true).write(true).open(&temporary)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);
    fs::rename(&temporary, path)
}

async fn write(State(state): State<AppState>, body: Result<Json<Update>, axum::extract::rejection::JsonRejection>) -> Response {
    let Json(update) = match body { Ok(body) => body, Err(_) => return error(StatusCode::UNPROCESSABLE_ENTITY, "Проверьте формат запроса и размер данных") };
    if let Err(message) = domain::validate(&update.data) { return error(StatusCode::UNPROCESSABLE_ENTITY, &message); }
    let mut stored = state.stored.lock().await;
    if stored.revision != update.expected_revision { return error(StatusCode::CONFLICT, "Данные изменены в другой вкладке. Загрузите актуальную версию и повторите действие."); }
    if let Err(message) = domain::validate_update(&stored.data, &update.data) { return error(StatusCode::UNPROCESSABLE_ENTITY, &message); }
    let Some(revision) = stored.revision.checked_add(1) else { return error(StatusCode::CONFLICT, "Достигнут предел версий"); };
    let next = Stored { revision, data: update.data };
    if persist(&state.path, &next).is_err() { return error(StatusCode::SERVICE_UNAVAILABLE, "Не удалось сохранить данные. Предыдущая версия сохранена; проверьте доступ к рабочему каталогу."); }
    let response = snapshot(&next);
    *stored = next;
    Json(response).into_response()
}

fn router(state: AppState) -> Router {
    let private = Router::new().route("/state", get(read).put(write)).route_layer(middleware::from_fn_with_state(state.clone(), authorize));
    Router::new().merge(private).route("/health", get(|| async { Json(json!({"ok":true})) })).layer(DefaultBodyLimit::max(512 * 1024)).with_state(state)
}

fn load(path: &Path) -> io::Result<Stored> {
    if !path.exists() { let data = domain::default_data(); domain::validate(&data).map_err(io::Error::other)?; return Ok(Stored {revision:0, data}); }
    if fs::metadata(path)?.len() > 512 * 1024 { return Err(io::Error::other("Рабочий файл слишком большой")); }
    let stored: Stored = serde_json::from_slice(&fs::read(path)?).map_err(|_| io::Error::other("Рабочий файл повреждён; восстановите проверенную резервную копию"))?;
    domain::validate(&stored.data).map_err(io::Error::other)?;
    Ok(stored)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let token = env::var("API_TOKEN").map_err(|_| "Задайте API_TOKEN (минимум 32 символа)")?;
    if token.len() < 32 { return Err("API_TOKEN должен содержать минимум 32 символа".into()); }
    let port: u16 = env::var("API_PORT").unwrap_or_else(|_| "3006".into()).parse()?;
    let path = PathBuf::from(env::var("DATA_FILE").unwrap_or_else(|_| "data/state.json".into()));
    if let Some(parent) = path.parent() { fs::create_dir_all(parent)?; }
    let lock: File = OpenOptions::new().read(true).write(true).create(true).truncate(false).open(path.with_extension("lock"))?;
    lock.try_lock_exclusive().map_err(|_| "Другой процесс уже использует рабочий файл")?;
    let state = AppState {stored:Arc::new(Mutex::new(load(&path)?)), path, token:Arc::new(token)};
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    println!("Rust API: http://127.0.0.1:{port}");
    axum::serve(listener, router(state)).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{Body, to_bytes};
    use tower::ServiceExt;
    const TOKEN: &str = "local-integration-fixture-token-32-chars";
    fn state() -> AppState {
        let path = env::temp_dir().join(format!("stavleak-kit-{}-{}.json", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        AppState {stored:Arc::new(Mutex::new(Stored{revision:0,data:domain::default_data()})),path,token:Arc::new(TOKEN.into())}
    }
    fn request(method: &str, body: Value) -> Request<Body> { Request::builder().method(method).uri("/state").header(header::AUTHORIZATION,format!("Bearer {TOKEN}")).header(header::CONTENT_TYPE,"application/json").body(Body::from(body.to_string())).unwrap() }
    #[tokio::test] async fn private_reads_require_authorization() { let response=router(state()).oneshot(Request::builder().uri("/state").body(Body::empty()).unwrap()).await.unwrap(); assert_eq!(response.status(),StatusCode::UNAUTHORIZED); }
    #[tokio::test] async fn write_survives_reload_and_rejects_stale_revision() {
        let state=state(); let app=router(state.clone()); let update=json!({"expected_revision":0,"data":domain::default_data()});
        let response=app.clone().oneshot(request("PUT",update.clone())).await.unwrap(); assert_eq!(response.status(),StatusCode::OK);
        let body:Value=serde_json::from_slice(&to_bytes(response.into_body(),1024*1024).await.unwrap()).unwrap(); assert_eq!(body["revision"],1);
        assert_eq!(load(&state.path).unwrap().revision,1);
        let stale=app.oneshot(request("PUT",update)).await.unwrap(); assert_eq!(stale.status(),StatusCode::CONFLICT);
        fs::remove_file(&state.path).unwrap();
    }
    #[tokio::test] async fn failed_disk_write_keeps_previous_state() {
        let mut state=state(); state.path=state.path.join("missing/state.json");
        let response=router(state.clone()).oneshot(request("PUT",json!({"expected_revision":0,"data":domain::default_data()}))).await.unwrap();
        assert_eq!(response.status(),StatusCode::SERVICE_UNAVAILABLE); assert_eq!(state.stored.lock().await.revision,0);
    }
    #[tokio::test] async fn unauthorized_writes_do_not_create_files() {
        let state=state(); let request=Request::builder().method("PUT").uri("/state").header(header::CONTENT_TYPE,"application/json").body(Body::from(json!({"expected_revision":0,"data":domain::default_data()}).to_string())).unwrap();
        let response=router(state.clone()).oneshot(request).await.unwrap(); assert_eq!(response.status(),StatusCode::UNAUTHORIZED); assert!(!state.path.exists());
    }
}
