use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use tauri::{ipc::Channel, Manager};

#[derive(Clone, Serialize)]
#[serde(tag = "event", rename_all = "camelCase")]
pub enum REngineEvent {
    Stdout { line: String },
    Stderr { line: String },
    Close { code: Option<i32> },
    Error { message: String },
}

fn rscript_candidates(resource_dir: &Path) -> [PathBuf; 3] {
    [
        resource_dir.join("r-lang").join("bin").join("Rscript.exe"),
        resource_dir
            .join("_up_")
            .join("r-lang")
            .join("bin")
            .join("Rscript.exe"),
        resource_dir
            .join("resources")
            .join("r-lang")
            .join("bin")
            .join("Rscript.exe"),
    ]
}

fn resolve_rscript_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app.path().resource_dir().map_err(|error| error.to_string())?;
    let candidates = rscript_candidates(&resource_dir);
    candidates
        .iter()
        .find(|path| path.is_file())
        .cloned()
        .ok_or_else(|| {
            format!(
                "Portable R runtime was not found. Checked: {}",
                candidates
                    .iter()
                    .map(|path| path.display().to_string())
                    .collect::<Vec<_>>()
                    .join("; ")
            )
        })
}

pub fn validate_r_engine(app: &tauri::AppHandle) -> Result<(), String> {
    let rscript_path = resolve_rscript_path(app)?;
    let r_home = rscript_path
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| format!("Invalid portable R path: {}", rscript_path.display()))?;
    let mut command = Command::new(&rscript_path);
    command
        .arg("--vanilla")
        .arg("-e")
        .arg("cat('RNAMETA_R_ENGINE_OK')")
        .env("R_HOME", r_home)
        .env("LANG", "Chinese (Simplified)_China.utf8")
        .env("LC_ALL", "Chinese (Simplified)_China.utf8")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let status = command.status().map_err(|error| {
        format!(
            "Portable R runtime could not start '{}': {error}",
            rscript_path.display()
        )
    })?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "Portable R runtime validation failed '{}' with status {status}",
            rscript_path.display()
        ))
    }
}

fn stream_reader<R: Read + Send + 'static>(
    reader: R,
    channel: Channel<REngineEvent>,
    stderr: bool,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut bytes = Vec::new();
        loop {
            bytes.clear();
            match reader.read_until(b'\n', &mut bytes) {
                Ok(0) => break,
                Ok(_) => {
                    while matches!(bytes.last(), Some(b'\n' | b'\r')) {
                        bytes.pop();
                    }
                    let line = String::from_utf8_lossy(&bytes).into_owned();
                    let event = if stderr {
                        REngineEvent::Stderr { line }
                    } else {
                        REngineEvent::Stdout { line }
                    };
                    let _ = channel.send(event);
                }
                Err(error) => {
                    let _ = channel.send(REngineEvent::Error {
                        message: error.to_string(),
                    });
                    break;
                }
            }
        }
    })
}

#[tauri::command]
pub fn spawn_r_engine(
    app: tauri::AppHandle,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    on_event: Channel<REngineEvent>,
) -> Result<u32, String> {
    let rscript_path = resolve_rscript_path(&app)?;
    let r_home = rscript_path
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| format!("Invalid portable R path: {}", rscript_path.display()))?;
    let mut command = Command::new(&rscript_path);
    command
        .args(args)
        .env("LANG", "Chinese (Simplified)_China.utf8")
        .env("LC_ALL", "Chinese (Simplified)_China.utf8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }
    if let Some(env) = env {
        command.envs(env);
    }
    command.env("R_HOME", r_home);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let mut child = command.spawn().map_err(|error| {
        format!(
            "Failed to start portable R runtime '{}': {error}",
            rscript_path.display()
        )
    })?;
    let pid = child.id();
    let stdout = child.stdout.take().ok_or("R stdout pipe was not available")?;
    let stderr = child.stderr.take().ok_or("R stderr pipe was not available")?;
    let stdout_handle = stream_reader(stdout, on_event.clone(), false);
    let stderr_handle = stream_reader(stderr, on_event.clone(), true);

    thread::spawn(move || match child.wait() {
        Ok(status) => {
            let _ = stdout_handle.join();
            let _ = stderr_handle.join();
            let _ = on_event.send(REngineEvent::Close {
                code: status.code(),
            });
        }
        Err(error) => {
            let _ = on_event.send(REngineEvent::Error {
                message: error.to_string(),
            });
        }
    });

    Ok(pid)
}
